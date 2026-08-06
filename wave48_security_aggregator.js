/**
 * wave48_security_aggregator.js -- Wave 48: Security Metrics Aggregator Extension
 *
 * PROBLEM:
 *   After Waves 46 and 47, 4 critical SECURITY/COMPLIANCE sub-modules still
 *   hide at separate `/api/metrics/<module>` paths:
 *     - /api/metrics/rls-defense  (Wave 36) — 5 gauges including
 *                                       wave36_rls_undefended (the alert target)
 *     - /api/metrics/audit-chain  (Wave 38) — 5 gauges including chain gaps
 *                                       (hash-chain integrity check)
 *     - /api/metrics/errors       (Wave 43) — 6 gauges of Express error
 *                                       classification (parse/rls/404/5xx/4xx)
 *     - /api/metrics/audit-log    (Wave 40) — ALREADY in wave46; not duplicated
 *
 *   These are critical for SECURITY/COMPLIANCE monitoring:
 *   - wave36_rls_undefended must stay 0 (any non-zero = real risk)
 *   - wave38_audit_chain_gaps_total must stay 0 (any non-zero = hash-chain break)
 *   - nama_errors_total visibility needed to catch silent error storms
 *
 *   Without these in the unified scrape, operators must add 3 more scrape
 *   targets in Prometheus. Wave 48 closes the security observability gap.
 *
 * WAVE 48 SHIPS:
 *   - fetchSecuritySummaries(deps) — collects rls_defense, audit_chain, errors
 *   - buildSecurityOutput(summaries) — emits Prometheus text for all 3
 *   - aggregateSecurity(deps) — composes wave47 output + security output
 *   - The `aggregateSecurity(deps)` is intended to be the NEW one-call
 *     entry point. It calls wave47.aggregateAll(deps) and adds security on top.
 *   - Same 5s TTL cache, same failure-isolated `_safe()` wrapper.
 *
 * Sub-modules added (3 new):
 *   - rls_defense : runWithDefense(target) from wave36 (server.js scanner)
 *   - audit_chain : runAuditChainCheck() from wave38 (DB hash-chain check)
 *   - errors      : getCounters() from wave43 (in-memory counters)
 *
 * Safety rails (AGENTS.md section 2.2):
 *   - Rail 1: never logs secrets.
 *   - Rail 12: never logs request bodies.
 *   - Failure isolation: each sub-module wrapped in try/catch.
 *
 * Public API:
 *   - fetchSecuritySummaries(deps) → Promise<{rls_defense, audit_chain, errors, ...}>
 *   - buildSecurityOutput(summaries) → string (Prometheus text format)
 *   - aggregateSecurity(deps) → Promise<string> (composes wave47 + security)
 *   - listSecuritySubModules() → string[]
 *   - reset() → clears the TTL cache
 */

'use strict';

const TTL_MS = 5000;
let _cache = { at: 0, value: null };

const SECURITY_SUB_MODULES = ['rls_defense', 'audit_chain', 'errors'];

function listSecuritySubModules() {
    return SECURITY_SUB_MODULES.slice();
}

// ----- Degraded fetch wrapper (same shape as wave46/47) -----

async function _safe(label, fn) {
    try {
        const v = await fn();
        return { ok: true, value: v };
    } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e), label };
    }
}

// ----- Fetch security sub-module summaries -----

/**
 * Fetch all security sub-module summaries in parallel.
 *
 * @param {object} deps
 * @param {object} [deps.serverPath]   -- override the server.js path for RLS scanner
 * @param {object} [deps.pool]        -- pg pool (for audit chain check)
 * @returns {Promise<object>}         -- { rls_defense, audit_chain, errors, captured_at, errors_meta }
 */
async function fetchSecuritySummaries(deps) {
    deps = deps || {};
    const path = require('path');
    const serverPath = deps.serverPath || path.join(__dirname, 'server.js');

    const wave36 = require('./wave36_rls_defense');
    const wave38 = require('./wave38_audit_chain');
    const wave43 = require('./wave43_error_handler');

    const [rlsRes, chainRes, errorsRes] = await Promise.all([
        _safe('rls_defense', () => {
            // runWithDefense([file]) runs the static RLS defense scanner.
            const result = wave36.runWithDefense([serverPath]);
            return result && result.summary ? result.summary : result;
        }),
        _safe('audit_chain', async () => {
            // runAuditChainCheck({ pool }) is async — runs psql against DB.
            // Falls back to a degraded report (no DB) if pool not provided.
            if (deps.pool) {
                return await wave38.runAuditChainCheck({ pool: deps.pool });
            }
            // No pool = degraded mode. Return an empty chain report.
            // toPrometheusMetrics expects {gaps: [], perTenant: [], error: null}.
            return {
                scannedAt: new Date().toISOString(),
                gaps: [],
                perTenant: [],
                raw: '',
                error: 'no_pool: degraded',
            };
        }),
        _safe('errors', () => wave43.getCounters()),
    ]);

    const errorsMeta = [];
    if (!rlsRes.ok) errorsMeta.push(rlsRes);
    if (!chainRes.ok) errorsMeta.push(chainRes);
    if (!errorsRes.ok) errorsMeta.push(errorsRes);

    return {
        rls_defense: rlsRes.ok ? rlsRes.value : null,
        audit_chain: chainRes.ok ? chainRes.value : null,
        errors: errorsRes.ok ? errorsRes.value : null,
        captured_at: new Date().toISOString(),
        errors_meta: errorsMeta,
    };
}

// ----- Build Prometheus output for security sub-modules -----

/**
 * Build the Prometheus text output for the 3 security sub-modules.
 *
 * @param {object} summaries  -- output of fetchSecuritySummaries
 * @returns {string}
 */
function buildSecurityOutput(summaries) {
    summaries = summaries || {};
    const parts = [];

    const wave36 = require('./wave36_rls_defense');
    const wave38 = require('./wave38_audit_chain');
    const wave43 = require('./wave43_error_handler');

    // Wave 36 (RLS defense): toPrometheusMetrics(summary)
    try {
        if (summaries.rls_defense) {
            const out = wave36.toPrometheusMetrics(summaries.rls_defense);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Wave 38 (audit chain): toPrometheusMetrics(report)
    // runAuditChainCheck returns {gaps: [], perTenant: [], error: null}.
    try {
        if (summaries.audit_chain) {
            // audit_chain IS the report (runAuditChainCheck returns the right shape).
            const out = wave38.toPrometheusMetrics(summaries.audit_chain);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Wave 43 (errors): toPrometheusMetrics(counters)
    try {
        if (summaries.errors) {
            const out = wave43.toPrometheusMetrics(summaries.errors);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Self-metric: how many security sub-modules succeeded
    const succeeded = [
        summaries.rls_defense != null,
        summaries.audit_chain != null,
        summaries.errors != null,
    ].filter(Boolean).length;

    const selfStats = [
        '# HELP nama_metrics_aggregator_security_modules_ok Security sub-modules that returned a summary',
        '# TYPE nama_metrics_aggregator_security_modules_ok gauge',
        'nama_metrics_aggregator_security_modules_ok ' + succeeded,
        '# HELP nama_metrics_aggregator_security_modules_total Total security sub-modules invoked',
        '# TYPE nama_metrics_aggregator_security_modules_total gauge',
        'nama_metrics_aggregator_security_modules_total ' + SECURITY_SUB_MODULES.length,
    ].join('\n');

    parts.push(selfStats);

    return parts.join('\n') + '\n';
}

// ----- Diagnostics -----

/**
 * Count TYPE declarations in the security output.
 * @param {string} output
 * @returns {number}
 */
function countSecurityGauges(output) {
    if (!output || typeof output !== 'string') return 0;
    const matches = output.match(/^# TYPE [^\s]+ (gauge|counter)/gm);
    return matches ? matches.length : 0;
}

/**
 * True when the security output contains the critical anchor metrics.
 * wave36_rls_undefended and wave38_audit_chain_gaps_total are the security
 * alert targets — their presence means the scrape actually ran the scanners.
 *
 * @param {string} output
 * @returns {boolean}
 */
function hasSecurityMinimalOutput(output) {
    if (!output || typeof output !== 'string') return false;
    const required = [
        'wave36_rls_undefended',
        'wave38_audit_chain_gaps_total',
        'nama_errors_total',
    ];
    return required.every((name) => output.indexOf(name) !== -1);
}

// ----- The one-call aggregateSecurity() -----

/**
 * One-call convenience: runs wave47.aggregateAll + wave48 security layer,
 * concatenates the result, and caches for 5 seconds.
 *
 * @param {object} deps  -- passed to wave47.aggregateAll and fetchSecuritySummaries
 * @returns {Promise<string>} -- combined Prometheus text body
 */
async function aggregateSecurity(deps) {
    const wave47 = require('./wave47_aggregator_extension');

    const now = Date.now();
    if (_cache.value && (now - _cache.at) < TTL_MS) {
        return _cache.value;
    }

    const [prom47, secSummaries] = await Promise.all([
        wave47.aggregateAll(deps),
        fetchSecuritySummaries(deps || {}),
    ]);

    const prom48 = buildSecurityOutput(secSummaries);
    const combined = prom47 + '\n' + prom48;
    _cache = { at: now, value: combined };
    return combined;
}

// ----- Cache management -----

function reset() {
    _cache = { at: 0, value: null };
}

// ----- Public exports -----

module.exports = {
    fetchSecuritySummaries,
    buildSecurityOutput,
    aggregateSecurity,
    listSecuritySubModules,
    countSecurityGauges,
    hasSecurityMinimalOutput,
    reset,
    TTL_MS,
    SECURITY_SUB_MODULES,
};
