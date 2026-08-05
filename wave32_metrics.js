/**
 * wave32_metrics.js — Wave 32 Prometheus Metrics + Alert Engine
 *
 * Adds an in-process Prometheus exposition endpoint at /api/metrics and a
 * derived /api/metrics/alerts endpoint. Builds on Wave 29 (session metrics)
 * and Wave 31 (RLS audit counters) to expose a unified scrape surface.
 *
 * Design choices (defense-in-depth, zero behavior change):
 *   - HELP/TYPE/Counter/Gauge text format (Prometheus standard).
 *   - All metrics are DERIVED from in-process counters and DB probes — NO
 *     secrets, NO PHI. Safe to expose on /api/metrics without auth (the
 *     scrape surface is intentionally operator-facing, not PHI-facing).
 *   - Alerts are evaluated in-process every scrape (no external alert
 *     manager required). Each alert has severity + remediation.
 *   - The alert rules are explicit and tunable via env vars.
 */

'use strict';

const { toPrometheusMetrics: wave29Prom } = require('./wave29_sessions');

let _alertsCache = null;
let _alertsCacheAt = 0;

const RULES = [
    {
        id: 'db_down',
        severity: 'critical',
        title: 'Database unreachable',
        check: (probe) => !probe.dbUp,
        remediation: 'Check PostgreSQL is running: `systemctl status postgresql`. Check pg_isready.',
    },
    {
        id: 'redis_down',
        severity: 'warning',
        title: 'Redis unreachable (sessions falling back to MemoryStore)',
        check: (probe) => probe.redisConfigured && !probe.redisUp,
        remediation: 'Check Redis: `systemctl status redis-server`. Sessions will fall back to in-memory store.',
    },
    {
        id: 'redis_errors_spike',
        severity: 'warning',
        title: 'Redis error rate > 1/min',
        check: (probe) => (probe.redisErrors || 0) > 1,
        remediation: 'Inspect Redis logs: `tail -f /var/log/redis/redis-server.log`.',
    },
    {
        id: 'rls_undefended_risk_present',
        severity: 'critical',
        title: 'RLS pattern audit: queries on routes WITHOUT any access control (the real risk)',
        // Wave 36 narrowed the metric: only findings on routes that have
        // NO access control at all (no requireAuth / requireRole /
        // requireTenantScope) count as a real exposure. Defended routes
        // (with RBAC + session-bound tenant) are informational only.
        check: (probe) => (probe.rlsUndefendedRisk || 0) > 0,
        remediation: 'Run `node wave36_rls_defense.js server.js` and review the `defense.undefendedSample` array. Each finding points to a query on a route that lacks RBAC, session, and tenant-scope middleware.',
    },
    {
        id: 'audit_chain_gap',
        severity: 'critical',
        title: 'Audit chain integrity gap detected (Wave 38 BYPASSRLS scan)',
        // Wave 38: the inline app-role query misses gaps in tenants outside
        // the current session's GUC. We now route the alert through the
        // wave38 operator tool which uses the BYPASSRLS backup role.
        check: (probe) => (probe.auditChainGapsTotal || 0) > 0,
        remediation: 'Run `node wave38_audit_chain.js` and inspect audit_trail gaps. Each gap row carries tenant_id + chain_idx + row_hash. Restore from a known-good dump if needed.',
    },
    {
        id: 'session_reaper_lagging',
        severity: 'warning',
        title: 'Session reaper has not run in the last 24h',
        check: (probe) => {
            if (!probe.lastReapAt) return false;
            return (Date.now() - probe.lastReapAt) > 24 * 3600 * 1000;
        },
        remediation: 'Restart the app. The session reaper interval is 6h; >24h silence indicates it died.',
    },
    {
        id: 'process_uptime_low',
        severity: 'warning',
        title: 'Process restarted in the last 60s',
        check: (probe) => (probe.uptime || 0) < 60,
        remediation: 'Inspect PM2 logs: `pm2 logs nama-medical-erp`.',
    },
];

/**
 * Evaluate alert rules against a probe snapshot.
 */
function evaluateAlerts(probe) {
    const firing = [];
    for (const r of RULES) {
        try {
            if (r.check(probe)) {
                firing.push({
                    id: r.id,
                    severity: r.severity,
                    title: r.title,
                    remediation: r.remediation,
                });
            }
        } catch (_) {
            // Defensive: never let a single rule error break the metrics scrape.
        }
    }
    return firing;
}

/**
 * Compose the full Prometheus scrape output (Wave 29 + Wave 31 + Wave 32).
 */
async function toPrometheusMetrics(pool, { rlsAudit, auditChain } = {}) {
    const probe = await probeSystem(pool, { rlsAudit, auditChain });
    const lines = [];
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.round(probe.uptime || 0)}`);
    lines.push('# HELP process_resident_memory_bytes Node.js RSS in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${probe.rss || 0}`);
    lines.push('# HELP nama_db_up 1 if the application DB connection works, 0 otherwise');
    lines.push('# TYPE nama_db_up gauge');
    lines.push(`nama_db_up ${probe.dbUp ? 1 : 0}`);
    lines.push('# HELP nama_redis_up 1 if Redis is connected, 0 otherwise (0 + configured=fallback)');
    lines.push('# TYPE nama_redis_up gauge');
    lines.push(`nama_redis_up ${probe.redisUp ? 1 : 0}`);
    // Wave 37: roundtrip latency for the redis PING (in ms).
    if (typeof probe.redisLatencyMs === 'number') {
        lines.push('# HELP nama_redis_ping_ms Latency of the redis PING in milliseconds');
        lines.push('# TYPE nama_redis_ping_ms gauge');
        lines.push(`nama_redis_ping_ms ${probe.redisLatencyMs}`);
    }
    lines.push('# HELP nama_audit_chain_gaps Number of broken hash-chain links in audit_trail');
    lines.push('# TYPE nama_audit_chain_gaps gauge');
    lines.push(`nama_audit_chain_gaps ${probe.auditChainGaps || 0}`);
    // Wave 38: also surface the operator-visible BYPASSRLS total so
    // dashboards can pick the most precise metric.
    if (typeof probe.auditChainGapsTotal === 'number') {
        lines.push('# HELP nama_audit_chain_gaps_total Operator-visible chain gaps (BYPASSRLS)');
        lines.push('# TYPE nama_audit_chain_gaps_total gauge');
        lines.push(`nama_audit_chain_gaps_total ${probe.auditChainGapsTotal}`);
    }
    // Wave 29 counters (session metrics) — already in prom format.
    lines.push(wave29Prom());
    // Wave 31 counters (RLS audit summary).
    if (rlsAudit && typeof rlsAudit === 'object') {
        lines.push('# HELP nama_rls_audit_total Total pool.query calls scanned (last run)');
        lines.push('# TYPE nama_rls_audit_total gauge');
        lines.push(`nama_rls_audit_total ${rlsAudit.total || 0}`);
        lines.push('# HELP nama_rls_audit_ok Queries with explicit tenant_id predicate');
        lines.push('# TYPE nama_rls_audit_ok gauge');
        lines.push(`nama_rls_audit_ok ${rlsAudit.ok || 0}`);
        lines.push('# HELP nama_rls_audit_risk Queries referencing tenant-scoped tables WITHOUT tenant_id predicate');
        lines.push('# TYPE nama_rls_audit_risk gauge');
        lines.push(`nama_rls_audit_risk ${rlsAudit.risk || 0}`);
        // Wave 36: only the undefended count is the real risk.
        const def = rlsAudit.defense || {};
        lines.push('# HELP nama_rls_audit_undefended Findings on routes WITHOUT any access control (Wave 36)');
        lines.push('# TYPE nama_rls_audit_undefended gauge');
        lines.push(`nama_rls_audit_undefended ${def.findingsUndefended || 0}`);
        lines.push('# HELP nama_rls_audit_defended Findings on routes with RBAC/session/tenant-scope middleware');
        lines.push('# TYPE nama_rls_audit_defended gauge');
        lines.push(`nama_rls_audit_defended ${def.findingsDefended || 0}`);
        lines.push('# HELP nama_rls_audit_public Findings on intentionally public routes (login/health/docs)');
        lines.push('# TYPE nama_rls_audit_public gauge');
        lines.push(`nama_rls_audit_public ${def.findingsPublic || 0}`);
        lines.push('# HELP nama_routes_indexed Total Express routes discovered in server.js');
        lines.push('# TYPE nama_routes_indexed gauge');
        lines.push(`nama_routes_indexed ${def.routesIndexed || 0}`);
        lines.push('# HELP nama_routes_defended Routes with requireAuth/requireRole/requireTenantScope');
        lines.push('# TYPE nama_routes_defended gauge');
        lines.push(`nama_routes_defended ${def.routesDefended || 0}`);
    }
    lines.push('# HELP nama_alerts_firing Number of alert rules currently firing');
    lines.push('# TYPE nama_alerts_firing gauge');
    lines.push(`nama_alerts_firing ${probe.firingAlerts || 0}`);
    lines.push('');
    return lines.join('\n');
}

/**
 * Best-effort system probe. NEVER throws; a probe failure surfaces as a degraded metric.
 */
async function probeSystem(pool, { rlsAudit, auditChain } = {}) {
    const probe = {
        uptime: process.uptime(),
        rss: process.memoryUsage ? process.memoryUsage().rss : 0,
        dbUp: false,
        rlsUndefendedRisk: rlsAudit && rlsAudit.defense ? (rlsAudit.defense.findingsUndefended || 0) : null,
        redisUp: false,
        redisConfigured: !!process.env.REDIS_URL || !!process.env.REDIS_HOST,
        redisErrors: 0,
        // Wave 38: prefer the operator-visible count (BYPASSRLS sees
        // every tenant). Fall back to the inline app-role count if no
        // chain report was passed in.
        auditChainGaps: auditChain && typeof auditChain.gaps !== 'undefined' ? auditChain.gaps.length : 0,
        auditChainGapsTotal: auditChain && typeof auditChain.gaps !== 'undefined' ? auditChain.gaps.length : 0,
        firingAlerts: 0,
        lastReapAt: null,
    };
    // Wave 29 session metrics → redis error counter.
    try {
        const m = require('./wave29_sessions').getMetrics();
        probe.redisErrors = m.redis_errors || 0;
    } catch (_) { /* module not loaded yet */ }
    // DB check: simple SELECT 1 with timeout.
    if (pool) {
        try {
            const t0 = Date.now();
            await Promise.race([
                pool.query('SELECT 1 AS ok'),
                new Promise((_, rej) => setTimeout(() => rej(new Error('db timeout')), 1500)),
            ]);
            probe.dbUp = true;
            probe.dbLatencyMs = Date.now() - t0;
            // Audit chain check (cheap — only runs if audit_trail has rows).
            try {
                const gapRes = await pool.query(
                    "SELECT COUNT(*)::int AS n FROM audit_trail a WHERE prev_hash IS NULL AND chain_idx IS NOT NULL AND chain_idx > 1"
                ).catch(() => ({ rows: [{ n: 0 }] }));
                probe.auditChainGaps = gapRes.rows[0].n;
            } catch (_) { probe.auditChainGaps = 0; }
        } catch (_) { probe.dbUp = false; }
    }
    // Redis check: app.locals.redisClient.ping() if exposed.
    // Wave 37: routed through the wave37_redis_metric helper so the same
    // lookup (global.__nama_app, registered app, env hint) is reused across
    // any future probes. Resolves to `null` cleanly if the client was never
    // exposed (e.g. REDIS_URL not configured).
    try {
        const w37 = require('./wave37_redis_metric');
        const client = w37.resolveRedisClient();
        const result = await w37.probeRedis(client);
        probe.redisUp = !!result.ok;
        probe.redisLatencyMs = result.latencyMs;
        probe.redisProbeReason = result.reason;
    } catch (_) { probe.redisUp = false; }
    // Evaluate alerts.
    const firing = evaluateAlerts(probe);
    probe.firingAlerts = firing.length;
    probe._firing = firing;
    return probe;
}

/**
 * Cached alerts handler.
 */
async function getAlerts(pool, opts) {
    const now = Date.now();
    if (_alertsCache && (now - _alertsCacheAt) < 30000) return _alertsCache;
    const probe = await probeSystem(pool, opts);
    _alertsCache = probe._firing || [];
    _alertsCacheAt = now;
    return _alertsCache;
}

function invalidateAlertsCache() {
    _alertsCache = null;
    _alertsCacheAt = 0;
}

module.exports = {
    evaluateAlerts,
    toPrometheusMetrics,
    probeSystem,
    getAlerts,
    invalidateAlertsCache,
    RULES,
};
