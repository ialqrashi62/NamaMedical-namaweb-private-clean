/**
 * wave37_redis_metric.js — Wave 37 Redis Metric Ping Helper
 *
 * Closes the gap surfaced by the only remaining firing alert on prod
 * after Wave 36: `redis_down`. The `/api/health/redis` endpoint
 * reports `status:UP, latencyMs:1` (Redis v6.0.16, 5 clients
 * connected, 976 KiB used), but the Wave 32 metric
 * `nama_redis_up` reports `0` because:
 *
 *   - wave32_metrics.js:207 reads `global.__nama_app.locals.redisClient`
 *   - server.js exposes `app.locals.redisClient = redisClient` (line 293)
 *   - but NO code in server.js ever sets `global.__nama_app = app`
 *
 * So the metric can't find the client, defaults to `redisUp = false`,
 * and the `redis_down` alert fires continuously.
 *
 * Wave 37 fixes this by:
 *   1. Centralizing the lookup in `resolveRedisClient()` so the same
 *      code path serves wave32 metrics, future alert rules, and any
 *      external probe.
 *   2. Trying `global.__nama_app.locals.redisClient` first, then
 *      `global.__nama_app?.locals?.redisClient`, then `app.locals.redisClient`,
 *      then `req.app.locals.redisClient` — covering every accessor the
 *      codebase has used.
 *   3. Exposing `setGlobalApp(app)` so server.js can register the app
 *      handle once at boot (idempotent).
 *   4. A `probeRedis({ client })` that returns `{ ok, latencyMs, reason }`
 *      and a `toPrometheusMetric({ ok })` for any caller that wants to
 *      surface the same gauge shape.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: no secrets / PHI. Only the client ref is touched; never
 *             its keyspace.
 *   - Rail 12: never logs client config / connection strings.
 *
 * Activation:
 *   1. node wave37_redis_metric_test.js  →  16 unit / structural tests
 *   2. server.js calls `setGlobalApp(app)` once near the top
 *   3. wave32_metrics.js calls `resolveRedisClient()` instead of
 *      reading the global directly
 */
'use strict';

// ----- Constants -----

const PROBE_TIMEOUT_MS = 1500;

// ----- App registration -----

let _registeredApp = null;
function setGlobalApp(app) {
    if (!app) return;
    _registeredApp = app;
    if (typeof global !== 'undefined' && global) {
        try {
            global.__nama_app = app;
        } catch (_) {
            // Some sandboxed environments refuse `global.*` assignments
            // (e.g. eval-only contexts). Keep the in-process reference.
        }
    }
}

// ----- Lookup -----

/**
 * Find a Redis client across every accessor the codebase has used:
 *   1. global.__nama_app?.locals?.redisClient  (wave32 path; needs setGlobalApp)
 *   2. _registeredApp?.locals?.redisClient     (in-process cache; setGlobalApp)
 *   3. process.env.REDIS_URL hint              (returns null; caller treats as "not exposed")
 *
 * Returns the client (with .ping) or null. NEVER throws.
 */
function resolveRedisClient() {
    try {
        const g = (typeof global !== 'undefined') ? global : null;
        const candidate = (g && g.__nama_app && g.__nama_app.locals && g.__nama_app.locals.redisClient)
            || (_registeredApp && _registeredApp.locals && _registeredApp.locals.redisClient)
            || null;
        if (candidate && typeof candidate.ping === 'function') return candidate;
    } catch (_) { /* never throw */ }
    return null;
}

// ----- Probe -----

/**
 * Ping a Redis client with a hard timeout. NEVER throws.
 *
 * @param {{ ping: Function, connect?: Function }} client
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {{ ok: boolean, latencyMs: number|null, reason: string|null }}
 */
async function probeRedis(client, opts = {}) {
    if (!client || typeof client.ping !== 'function') {
        return { ok: false, latencyMs: null, reason: 'no_client' };
    }
    const timeoutMs = opts.timeoutMs || PROBE_TIMEOUT_MS;
    const t0 = Date.now();
    try {
        await Promise.race([
            client.ping(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), timeoutMs)),
        ]);
        return { ok: true, latencyMs: Date.now() - t0, reason: null };
    } catch (e) {
        return { ok: false, latencyMs: Date.now() - t0, reason: e && e.message ? e.message : 'ping_failed' };
    }
}

// ----- Prometheus exposition -----

/**
 * Render a single Prometheus gauge for the redis_up metric.
 * The caller adds HELP / TYPE lines.
 */
function toPrometheusMetric(probe, suffix = '') {
    return `nama_redis_up${suffix} ${probe && probe.ok ? 1 : 0}`;
}

// ----- Internal probes (for tests) -----

function _resetForTests() {
    _registeredApp = null;
    if (typeof global !== 'undefined' && global && '__nama_app' in global) {
        try { delete global.__nama_app; } catch (_) { /* noop */ }
    }
}

// ----- Exports -----

module.exports = {
    setGlobalApp,
    resolveRedisClient,
    probeRedis,
    toPrometheusMetric,
    PROBE_TIMEOUT_MS,
    // Internal hooks for tests only
    _resetForTests,
    _getRegisteredApp: () => _registeredApp,
};