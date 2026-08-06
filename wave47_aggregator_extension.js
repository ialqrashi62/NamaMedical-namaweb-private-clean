/**
 * wave47_aggregator_extension.js -- Wave 47: Extended Metrics Aggregator
 *
 * PROBLEM:
 *   Wave 46 unified 4 sub-modules (csp, audit, http, db_pool) into the main
 *   /api/metrics scrape. But 4 more sub-modules remain hidden at:
 *     - /api/metrics/backup      (Wave 34 backup activation: 4 gauges)
 *     - /api/metrics/logrotate   (Wave 35 log rotation: 4 gauges)
 *     - /api/metrics/dr-drill    (Wave 41 DR drill hardening: 5 gauges)
 *     - /api/metrics/process     (Wave 42 process lifecycle: 4+ gauges)
 *
 *   Operators would still need 4 more scrape configs in Prometheus.
 *
 * WAVE 47 SHIPS:
 *   Extension to wave46 that adds 4 sub-modules. Designed to be:
 *   - Backward compatible: wave46 still works unchanged.
 *   - Composable: aggregateAll(deps) calls wave46 first, then layers 47 on top.
 *   - Cached: same 5s TTL behavior.
 *   - Failure-isolated: each new sub-module wrapped in _safe().
 *
 * Sub-modules added:
 *   - backup    : validateActivation() from wave34 + toPrometheusMetrics()
 *   - logrotate : validateActivation() from wave35 + toPrometheusMetrics()
 *   - dr_drill  : summarize() + toPrometheusMetrics() from wave41
 *   - process   : getCounters() + toPrometheusMetrics() from wave42
 *
 * Safety rails (AGENTS.md section 2.2):
 *   - Rail 1: never logs secrets.
 *   - Rail 12: never logs request bodies.
 *   - Failure isolation: each sub-module wrapped in try/catch.
 *
 * Public API:
 *   - fetchExtendedSummaries(deps) → Promise<{backup, logrotate, dr_drill, process, ...}>
 *   - buildExtendedOutput(summaries) → string (Prometheus text format)
 *   - aggregateAll(deps) → Promise<string> (one-call: wave46 + wave47)
 *   - listExtendedSubModules() → string[]
 *   - reset() → clears the TTL cache
 */

'use strict';

const TTL_MS = 5000;
let _cache = { at: 0, value: null };

const EXTENDED_SUB_MODULES = ['backup', 'logrotate', 'dr_drill', 'process'];

function listExtendedSubModules() {
    return EXTENDED_SUB_MODULES.slice();
}

// ----- Degraded fetch wrapper (same shape as wave46) -----

async function _safe(label, fn) {
    try {
        const v = await fn();
        return { ok: true, value: v };
    } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e), label };
    }
}

// ----- Fetch extended sub-module summaries -----

// Production default for the DR drill log path. Mirrors server.js
// (getWave41Report uses this same path).
const DEFAULT_DR_DRILL_LOG = '/var/backups/nama-medical/dr-restore.log';

/**
 * Fetch all extended sub-module summaries in parallel.
 *
 * @param {object} deps
 * @param {object} [deps.logPaths]  -- { drDrillLog } override the DR drill log path
 * @returns {Promise<object>}       -- { backup, logrotate, dr_drill, process, captured_at, errors }
 */
async function fetchExtendedSummaries(deps) {
    deps = deps || {};
    const drDrillLogPath = (deps.logPaths && deps.logPaths.drDrillLog)
        || deps.drDrillLogPath
        || DEFAULT_DR_DRILL_LOG;

    const wave34 = require('./wave34_backup_activation');
    const wave35 = require('./wave35_logrotate');
    const wave41 = require('./wave41_dr_drill');
    const wave42 = require('./wave42_process_lifecycle');

    const [backupRes, logrotateRes, drDrillRes, processRes] = await Promise.all([
        _safe('backup', () => {
            // Tests pass deps.exec to avoid real SSH/file I/O; on prod,
            // the default arg internally uses wave34.sshExec + localExec.
            if (deps && typeof deps.exec === 'function') {
                return wave34.validateActivation({ exec: deps.exec });
            }
            return wave34.validateActivation();
        }),
        _safe('logrotate', () => {
            if (deps && typeof deps.exec === 'function') {
                return wave35.validateActivation({ exec: deps.exec });
            }
            return wave35.validateActivation();
        }),
        _safe('dr_drill', () => wave41.summarize({ logPath: drDrillLogPath })),
        _safe('process', () => wave42.getCounters()),
    ]);

    const errors = [];
    if (!backupRes.ok) errors.push(backupRes);
    if (!logrotateRes.ok) errors.push(logrotateRes);
    if (!drDrillRes.ok) errors.push(drDrillRes);
    if (!processRes.ok) errors.push(processRes);

    return {
        backup: backupRes.ok ? backupRes.value : null,
        logrotate: logrotateRes.ok ? logrotateRes.value : null,
        dr_drill: drDrillRes.ok ? drDrillRes.value : null,
        process: processRes.ok ? processRes.value : null,
        captured_at: new Date().toISOString(),
        errors,
    };
}

// ----- Build Prometheus output for extended sub-modules -----

/**
 * Build the Prometheus text output for the extended sub-modules.
 * Each module's toPrometheusMetrics is called with the right argument shape.
 *
 * @param {object} summaries  -- output of fetchExtendedSummaries
 * @returns {string}
 */
function buildExtendedOutput(summaries) {
    summaries = summaries || {};
    const parts = [];

    const wave34 = require('./wave34_backup_activation');
    const wave35 = require('./wave35_logrotate');
    const wave41 = require('./wave41_dr_drill');
    const wave42 = require('./wave42_process_lifecycle');

    // Wave 34 (backup): toPrometheusMetrics(report) where report = {ok, checks}
    try {
        if (summaries.backup) {
            const out = wave34.toPrometheusMetrics(summaries.backup);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Wave 35 (logrotate): toPrometheusMetrics(report) where report = {ok, checks}
    try {
        if (summaries.logrotate) {
            const out = wave35.toPrometheusMetrics(summaries.logrotate);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Wave 41 (dr_drill): toPrometheusMetrics(summary)
    try {
        if (summaries.dr_drill) {
            const out = wave41.toPrometheusMetrics(summaries.dr_drill);
            if (out && typeof out === 'string' && out.length) parts.push(out);
        }
    } catch (_e) { /* degraded */ }

    // Wave 42 (process): toPrometheusMetrics() — no arg, reads its own counters
    try {
        const out = wave42.toPrometheusMetrics();
        if (out && typeof out === 'string' && out.length) parts.push(out);
    } catch (_e) { /* degraded */ }

    // Self-metric: how many extended sub-modules succeeded
    const succeeded = [
        summaries.backup != null,
        summaries.logrotate != null,
        summaries.dr_drill != null,
        summaries.process != null,
    ].filter(Boolean).length;

    const selfStats = [
        '# HELP nama_metrics_aggregator_ext_modules_ok Extended sub-modules that returned a summary',
        '# TYPE nama_metrics_aggregator_ext_modules_ok gauge',
        'nama_metrics_aggregator_ext_modules_ok ' + succeeded,
        '# HELP nama_metrics_aggregator_ext_modules_total Total extended sub-modules invoked',
        '# TYPE nama_metrics_aggregator_ext_modules_total gauge',
        'nama_metrics_aggregator_ext_modules_total ' + EXTENDED_SUB_MODULES.length,
    ].join('\n');

    parts.push(selfStats);

    return parts.join('\n') + '\n';
}

// ----- Diagnostics -----

/**
 * Count TYPE declarations in the extended output.
 * @param {string} output
 * @returns {number}
 */
function countExtendedGauges(output) {
    if (!output || typeof output !== 'string') return 0;
    const matches = output.match(/^# TYPE [^\s]+ (gauge|counter)/gm);
    return matches ? matches.length : 0;
}

/**
 * True when the extended output contains at least one anchor metric from each
 * of the 4 extended sub-modules.
 *
 * @param {string} output
 * @returns {boolean}
 */
function hasExtendedMinimalOutput(output) {
    if (!output || typeof output !== 'string') return false;
    const required = [
        'wave34_activation_status',     // backup
        'wave35_activation_status',     // logrotate
        'nama_dr_drill_last_success',   // dr_drill
        'nama_process_unhandled_rejections_total', // process
    ];
    return required.every((name) => output.indexOf(name) !== -1);
}

// ----- The one-call aggregateAll() -----

/**
 * One-call convenience: runs wave46.aggregate + wave47.buildExtendedOutput,
 * concatenates the result, and caches it for 5 seconds.
 *
 * @param {object} deps  -- passed to wave46.aggregate and wave47.fetchExtendedSummaries
 * @returns {Promise<string>} -- combined Prometheus text body
 */
async function aggregateAll(deps) {
    const wave46 = require('./wave46_metrics_aggregator');

    const now = Date.now();
    if (_cache.value && (now - _cache.at) < TTL_MS) {
        return _cache.value;
    }

    const [prom46, extSummaries] = await Promise.all([
        wave46.aggregate(deps),
        fetchExtendedSummaries(deps || {}),
    ]);

    const prom47 = buildExtendedOutput(extSummaries);
    const combined = prom46 + '\n' + prom47;
    _cache = { at: now, value: combined };
    return combined;
}

// ----- Cache management -----

function reset() {
    _cache = { at: 0, value: null };
}

// ----- Public exports -----

module.exports = {
    fetchExtendedSummaries,
    buildExtendedOutput,
    aggregateAll,
    listExtendedSubModules,
    countExtendedGauges,
    hasExtendedMinimalOutput,
    reset,
    TTL_MS,
    EXTENDED_SUB_MODULES,
};
