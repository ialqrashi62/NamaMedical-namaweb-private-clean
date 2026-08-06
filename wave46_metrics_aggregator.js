/**
 * wave46_metrics_aggregator.js -- Wave 46: Unified Metrics Aggregator
 *
 * PROBLEM:
 *   Each wave added a sub-endpoint (`/api/metrics/csp`, `/api/metrics/http`,
 *   `/api/metrics/db-pool`, etc.). But the Prometheus scrape target is
 *   `/api/metrics` (the canonical surface). It currently emits ONLY the
 *   Wave 32 metrics (process, db_up, redis_up, session, audit_chain,
 *   rls_audit). The new waves (39, 40, 44, 45) are invisible to the
 *   primary scrape endpoint.
 *
 *   Operators have to add 4+ scrape configs in Prometheus to see the
 *   full picture. That's operational debt.
 *
 * WAVE 46 SHIPS:
 *   1. fetchAllSummaries({ pool, httpCounters, auditCounters, dbPool })
 *      collects all sub-module summaries in parallel.
 *   2. buildPrometheusOutput(summaries) concatenates all sub-module
 *      toPrometheusMetrics() outputs into a single text/plain v0.0.4 body.
 *   3. hasMinimalOutput() / countGauges() — diagnostics for tests.
 *
 *   4. aggregate() — the one-call entry point: takes the live state from
 *      server.js (counters, pool) and returns the full Prometheus text.
 *      This is what /api/metrics will call after Wave 46 is wired.
 *
 * Safety rails (AGENTS.md section 2.2):
 *   - Rail 12: never logs raw request bodies or headers.
 *   - The aggregator NEVER mutates state; it only reads.
 *   - If any sub-module throws, we degrade gracefully (continue with the
 *     others) so the scrape never 500s.
 *
 * Public API:
 *   - fetchAllSummaries(deps) → Promise<{ csp, audit, http, dbPool, captured_at }>
 *   - buildPrometheusOutput(summaries) → string (Prometheus text format v0.0.4)
 *   - aggregate(deps) → Promise<string> (one-call convenience)
 *   - listSubModules() → string[] ('csp', 'audit', 'http', 'db_pool')
 *   - countGauges(output) → number
 *   - reset() → clears the TTL cache
 */

'use strict';

// Cache the aggregate for 5 seconds to avoid hammering modules.
const TTL_MS = 5000;
let _cache = { at: 0, value: null };

// ----- Sub-module list -----

const SUB_MODULES = ['csp', 'audit', 'http', 'db_pool'];

function listSubModules() {
    return SUB_MODULES.slice();
}

// ----- Degraded fetch wrapper -----
// Each sub-module fetch is wrapped in try/catch so one failure does not
// block the others. We NEVER throw from fetchAllSummaries — Prometheus
// must always get a response.

async function _safe(label, fn) {
    try {
        const v = await fn();
        return { ok: true, value: v };
    } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e), label };
    }
}

// ----- Fetch all sub-module summaries -----

/**
 * Fetch all sub-module summaries in parallel. Each fetch is isolated;
 * a failure in one module never blocks the others.
 *
 * @param {object} deps  -- the live state from server.js
 * @param {object} [deps.pool]       -- pg pool (for wave45 + wave39)
 * @param {object} [deps.audit]      -- counters object from wave40 (counters, not a function)
 * @param {object} [deps.http]       -- counters object from wave44 (counters, not a function)
 * @param {object} [deps.poolObj]    -- alternate name for the pg pool (compat)
 * @returns {Promise<object>}        -- { csp, audit, http, dbPool, captured_at, errors }
 */
async function fetchAllSummaries(deps) {
    deps = deps || {};
    const pool = deps.pool || deps.poolObj || null;
    const audit = deps.audit || deps.auditCounters || null;
    const http = deps.http || deps.httpCounters || null;

    const wave39 = require('./wave39_csp');
    const wave40 = require('./wave40_audit_resilience');
    const wave44 = require('./wave44_http_request_metrics');
    const wave45 = require('./wave45_db_pool_metrics');

    // CSP is async (DB query).
    // Audit, HTTP, DB-pool are sync (counters + property reads).
    // NOTE: wave39.summarizeCspReports takes (pool, { windowHours }) — NOT ({ pool, windowHours }).
    const [cspRes, auditRes, httpRes, dbPoolRes] = await Promise.all([
        pool ? _safe('csp', () => wave39.summarizeCspReports(pool, { windowHours: 24 })) : Promise.resolve({ ok: true, value: null }),
        _safe('audit', () => wave40.getCounters()),
        _safe('http', () => wave44.getCounters()),
        pool ? _safe('db_pool', () => wave45.summarize(pool)) : Promise.resolve({ ok: true, value: null }),
    ]);

    const errors = [];
    if (!cspRes.ok) errors.push(cspRes);
    if (!auditRes.ok) errors.push(auditRes);
    if (!httpRes.ok) errors.push(httpRes);
    if (!dbPoolRes.ok) errors.push(dbPoolRes);

    return {
        csp: cspRes.ok ? cspRes.value : null,
        audit: auditRes.ok ? auditRes.value : null,
        http: httpRes.ok ? httpRes.value : null,
        dbPool: dbPoolRes.ok ? dbPoolRes.value : null,
        captured_at: new Date().toISOString(),
        errors,
    };
}

// ----- Build the unified Prometheus output -----

/**
 * Concatenate all sub-module toPrometheusMetrics outputs into a single
 * text/plain v0.0.4 body. Each module's output is already in valid
 * Prometheus format; we just join them.
 *
 * Sub-modules that returned null (e.g. CSP without a pool) are skipped.
 *
 * @param {object} summaries  -- output of fetchAllSummaries
 * @returns {string}          -- Prometheus text format v0.0.4 body
 */
function buildPrometheusOutput(summaries) {
    summaries = summaries || {};
    const parts = [];

    const wave39 = require('./wave39_csp');
    const wave40 = require('./wave40_audit_resilience');
    const wave44 = require('./wave44_http_request_metrics');
    const wave45 = require('./wave45_db_pool_metrics');

    // Order matters for human readability: base (csp) → audit → http → db-pool.
    try {
        if (summaries.csp) {
            const out = wave39.toPrometheusMetrics(summaries.csp);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded — skip */ }

    try {
        if (summaries.audit) {
            const out = wave40.toPrometheusMetrics(summaries.audit);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded — skip */ }

    try {
        if (summaries.http) {
            const out = wave44.toPrometheusMetrics(summaries.http);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded — skip */ }

    try {
        if (summaries.dbPool) {
            const out = wave45.toPrometheusMetrics(summaries.dbPool);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded — skip */ }

    // Add an aggregator self-metric: how many sub-modules succeeded.
    const succeeded = [
        summaries.csp != null,
        summaries.audit != null,
        summaries.http != null,
        summaries.dbPool != null,
    ].filter(Boolean).length;

    const selfStats = [
        '# HELP nama_metrics_aggregator_modules_ok Sub-modules that returned a summary',
        '# TYPE nama_metrics_aggregator_modules_ok gauge',
        'nama_metrics_aggregator_modules_ok ' + succeeded,
        '# HELP nama_metrics_aggregator_modules_total Total sub-modules invoked',
        '# TYPE nama_metrics_aggregator_modules_total gauge',
        'nama_metrics_aggregator_modules_total ' + SUB_MODULES.length,
    ].join('\n');

    parts.push(selfStats);

    return parts.join('\n') + '\n';
}

// ----- Diagnostics -----

/**
 * Count the number of `# TYPE xxxx gauge|counter` declarations in a
 * Prometheus text output. Useful for tests + ops sanity check.
 *
 * @param {string} output  -- the Prometheus text body
 * @returns {number}       -- count of TYPE declarations
 */
function countGauges(output) {
    if (!output || typeof output !== 'string') return 0;
    const matches = output.match(/^# TYPE [^\s]+ (gauge|counter)/gm);
    return matches ? matches.length : 0;
}

/**
 * True when the output contains at least one metric from each of the
 * 4 sub-modules. Used as the minimal "the aggregator actually wired
 * everything" sanity check.
 *
 * @param {string} output
 * @returns {boolean}
 */
function hasMinimalOutput(output) {
    if (!output || typeof output !== 'string') return false;
    const required = [
        'nama_csp_reports_total',
        'nama_audit_log_calls_total',
        'nama_http_requests_total',
        'nama_db_pool_total',
    ];
    return required.every((name) => output.indexOf(name) !== -1);
}

// ----- The one-call aggregate() -----

/**
 * The convenience entry point used by /api/metrics after Wave 46 lands.
 * Combines fetch + build with the 5-second cache.
 *
 * @param {object} deps  -- see fetchAllSummaries
 * @returns {Promise<string>} -- full Prometheus text body
 */
async function aggregate(deps) {
    const now = Date.now();
    if (_cache.value && (now - _cache.at) < TTL_MS) {
        return _cache.value;
    }
    const summaries = await fetchAllSummaries(deps);
    const out = buildPrometheusOutput(summaries);
    _cache = { at: now, value: out };
    return out;
}

// ----- Cache management -----

function reset() {
    _cache = { at: 0, value: null };
}

// ----- Public exports -----

module.exports = {
    fetchAllSummaries,
    buildPrometheusOutput,
    aggregate,
    listSubModules,
    countGauges,
    hasMinimalOutput,
    reset,
    TTL_MS,
    SUB_MODULES,
};
