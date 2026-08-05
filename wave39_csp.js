/**
 * wave39_csp.js -- Wave 39 CSP Report Persistence + Metric
 *
 * Closes the gap where /api/csp-report logged to console but never
 * persisted. CSP reports are a real attack signal: a violation means
 * either a misconfigured CSP directive OR an active XSS attempt.
 * Lost in console == lost security signal.
 *
 * Wave 39 ships:
 *   1. PersistCspReport({ pool, body, sourceIp, userAgent, tenantId })
 *      writes a row to csp_reports (RLS-scoped to the caller's tenant).
 *   2. summarizeCspReports({ pool, windowHours }) returns
 *      { total, byDirective, byTenant } for the admin surface.
 *   3. toPrometheusMetrics({ summary }) emits:
 *      - nama_csp_reports_last_24h
 *      - nama_csp_reports_last_1h
 *      - nama_csp_reports_total
 *
 * Safety rails (AGENTS.md section 2.2):
 *   - Rail 1: never logs raw report bodies (PII risk).
 *   - Rail 4: only INSERT into csp_reports (no UPDATE/DELETE).
 *   - Rail 5: RLS is enforced (FORCE ROW LEVEL SECURITY on the table).
 *   - Rail 12: never prints user_agent or source_ip beyond summary counts.
 */
'use strict';

const DEFAULT_WINDOW_HOURS = 24;

// ----- Persist -----

/**
 * Insert a single CSP report row. The caller must have the caller's
 * tenant_id set on the session (via SET app.tenant_id) so RLS permits
 * the INSERT. Returns { row: { id, created_at } } or { error }.
 *
 * @param {object} pool       -- pg pool from server.js
 * @param {object} body       -- parsed CSP report body (the inner "csp-report" object)
 * @param {string} sourceIp   -- request remote IP (already redacted by trust-proxy chain)
 * @param {string} userAgent  -- request User-Agent header
 * @param {number|string|null} tenantId -- tenant id from AsyncLocalStorage or null
 */
async function persistCspReport(pool, body, sourceIp, userAgent, tenantId) {
    const tenantIdInt = (typeof tenantId === 'number') ? tenantId
        : (typeof tenantId === 'string' && /^\d+$/.test(tenantId)) ? parseInt(tenantId, 10)
            : null;
    const docUri = String(body && (body['document-uri'] || body.documentURL) || '').slice(0, 200);
    const directive = String(body && (body['violated-directive'] || body['effective-directive'] || body.effectiveDirective) || '').slice(0, 120);
    const blockedUri = String(body && (body['blocked-uri'] || body.blockedURL) || '').slice(0, 200);
    const raw = (typeof body === 'object') ? JSON.stringify(body).slice(0, 4000) : '';
    try {
        const r = await pool.query(
            'INSERT INTO csp_reports (tenant_id, document_uri, directive, blocked_uri, source_ip, user_agent, raw_body) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at',
            [tenantIdInt, docUri, directive, blockedUri, sourceIp || '', userAgent || '', raw]
        );
        return { row: r.rows[0] };
    } catch (e) {
        return { error: e && e.message ? e.message : 'persist_failed' };
    }
}

// ----- Summarize -----

async function summarizeCspReports(pool, { windowHours = DEFAULT_WINDOW_HOURS } = {}) {
    const out = { total: 0, last24h: 0, last1h: 0, byDirective: {}, byTenant: {} };
    if (!pool) return out;
    try {
        const totalRes = await pool.query('SELECT COUNT(*)::int AS n FROM csp_reports');
        out.total = totalRes.rows[0].n;
        const r24 = await pool.query(
            "SELECT COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - ($1 || ' hours')::interval",
            [String(windowHours)]
        );
        out.last24h = r24.rows[0].n;
        const r1 = await pool.query(
            "SELECT COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - INTERVAL '1 hour'"
        );
        out.last1h = r1.rows[0].n;
        const dirRes = await pool.query(
            "SELECT directive, COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - ($1 || ' hours')::interval GROUP BY directive ORDER BY n DESC LIMIT 10",
            [String(windowHours)]
        );
        out.byDirective = dirRes.rows.reduce((acc, r) => { acc[r.directive || '(unknown)'] = r.n; return acc; }, {});
        const tenantRes = await pool.query(
            "SELECT tenant_id, COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - ($1 || ' hours')::interval GROUP BY tenant_id ORDER BY n DESC LIMIT 20",
            [String(windowHours)]
        );
        out.byTenant = tenantRes.rows.reduce((acc, r) => { acc[String(r.tenant_id)] = r.n; return acc; }, {});
    } catch (_) { /* RLS denies; caller may fall back to BYPASSRLS */ }
    return out;
}

// ----- Prometheus exposition -----

function toPrometheusMetrics(summary) {
    const s = summary || {};
    return [
        '# HELP nama_csp_reports_total Lifetime CSP reports persisted (caller tenant scope)',
        '# TYPE nama_csp_reports_total gauge',
        `nama_csp_reports_total ${s.total || 0}`,
        '# HELP nama_csp_reports_last_24h CSP reports in the last 24 hours',
        '# TYPE nama_csp_reports_last_24h gauge',
        `nama_csp_reports_last_24h ${s.last24h || 0}`,
        '# HELP nama_csp_reports_last_1h CSP reports in the last hour',
        '# TYPE nama_csp_reports_last_1h gauge',
        `nama_csp_reports_last_1h ${s.last1h || 0}`,
    ].join('\n');
}

// ----- Exports -----

module.exports = {
    persistCspReport,
    summarizeCspReports,
    toPrometheusMetrics,
    DEFAULT_WINDOW_HOURS,
};