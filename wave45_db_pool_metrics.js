// wave45_db_pool_metrics.js
//
// Wave 45 — PG Connection Pool Metrics
//
// Background:
//   The PG pool has `max: 20` connections but NO visibility. If the pool
//   exhausts under load, requests block waiting for a connection. Operators
//   have no Prometheus signal until users complain.
//
//   pg's Pool exposes these readonly counters:
//     pool.totalCount   — current total connections (busy + idle)
//     pool.idleCount    — current idle connections (available)
//     pool.waitingCount — clients waiting for a connection (queue depth)
//
//   Reading these on every scrape is cheap (atomic counters).
//
// Solution:
//   - Module exports a `summarize(pool)` function that returns safe snapshots.
//   - `toPrometheusMetrics(summary)` emits gauges.
//   - `runWithPool(pool)` returns the summary (cached 5s to avoid hot path).
//
// Safety rails:
//   -1 No secrets, no PHI.
//  -11 Fail-safe: any read failure returns zero values, never throws.
//  -12 Never logs pool internals.
//
'use strict';

const _cache = { value: null, at: 0 };
const _CACHE_TTL_MS = 5000;

// ----- Safe readers -----
// node-postgres Pool exposes totalCount/idleCount/waitingCount as **properties**
// (not methods). Some versions or wrappers expose them as methods. Handle both.
function _safeRead(pool, name) {
    try {
        if (!pool) return 0;
        const v = pool[name];
        if (typeof v === 'function') {
            const r = v.call(pool);
            if (typeof r === 'number') return r;
        } else if (typeof v === 'number') {
            return v;
        }
    } catch (_e) { /* ignore */ }
    return 0;
}

function _safeMax(pool) {
    // pool.options.max is the configured max.
    try {
        if (pool && pool.options && typeof pool.options.max === 'number') {
            return pool.options.max;
        }
    } catch (_e) { /* ignore */ }
    return 0;
}

// ----- Summary -----
// Returns { total, idle, waiting, max, utilization } at the moment of call.
function summarize(pool) {
    const total = _safeRead(pool, 'totalCount');
    const idle = _safeRead(pool, 'idleCount');
    const waiting = _safeRead(pool, 'waitingCount');
    const max = _safeMax(pool);
    // utilization = 1 - (idle / max). If max=0, utilization=0 (unknown).
    let utilization = 0;
    if (max > 0) {
        const busy = Math.max(0, total - idle);
        utilization = Number((busy / max).toFixed(4));
    }
    return {
        total, idle, waiting, max, utilization,
        captured_at: new Date().toISOString(),
    };
}

// ----- Cached summary (5s TTL) -----
// Use this from the endpoint to avoid hot-path cost from frequent scrapes.
function getSummary(pool) {
    const now = Date.now();
    if (_cache.value && (now - _cache.at) < _CACHE_TTL_MS) {
        return _cache.value;
    }
    const s = summarize(pool);
    _cache.value = s;
    _cache.at = now;
    return s;
}

function reset() {
    _cache.value = null;
    _cache.at = 0;
}

// ----- Prometheus exporter -----
function toPrometheusMetrics(summary) {
    const s = summary || { total: 0, idle: 0, waiting: 0, max: 0, utilization: 0 };
    const lines = [
        '# HELP nama_db_pool_total Total PG connections in the pool (busy + idle)',
        '# TYPE nama_db_pool_total gauge',
        `nama_db_pool_total ${s.total || 0}`,
        '# HELP nama_db_pool_idle Currently idle PG connections (available)',
        '# TYPE nama_db_pool_idle gauge',
        `nama_db_pool_idle ${s.idle || 0}`,
        '# HELP nama_db_pool_waiting Clients waiting for a connection (queue depth)',
        '# TYPE nama_db_pool_waiting gauge',
        `nama_db_pool_waiting ${s.waiting || 0}`,
        '# HELP nama_db_pool_max Configured pool max connections',
        '# TYPE nama_db_pool_max gauge',
        `nama_db_pool_max ${s.max || 0}`,
        '# HELP nama_db_pool_utilization Pool utilization (0-1, busy/max)',
        '# TYPE nama_db_pool_utilization gauge',
        `nama_db_pool_utilization ${s.utilization || 0}`,
    ];
    return lines.join('\n') + '\n';
}

module.exports = {
    summarize,
    getSummary,
    reset,
    toPrometheusMetrics,
};
