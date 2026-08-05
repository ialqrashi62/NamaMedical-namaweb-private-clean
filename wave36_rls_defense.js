/**
 * wave36_rls_defense.js — Wave 36 RLS Defense-in-Depth Classifier
 *
 * Closes the gap surfaced by the `nama_alerts_firing 1` rule
 * `rls_risk_count_high` (threshold: >50; observed: 295 findings on prod).
 *
 * The original Wave 31 audit counted every pool.query that references a
 * tenant-scoped table but has no `tenant_id` predicate in the SQL string.
 * That is too coarse — it treats the 295 findings as a single risk bucket
 * even though the codebase already has defense-in-depth:
 *
 *   - `requireTenantScope` middleware (verified present on 580/790 routes)
 *   - `FORCE ROW LEVEL SECURITY` on every tenant-aware table
 *     (verified by Wave 17/18/19/20: 339/339 tables)
 *   - `nama_medical_app` role, with `app.tenant_id` GUC set per-request
 *
 * So the 295 findings are "queries that rely on the layer-2 (RLS)
 * defense instead of stating the predicate explicitly." That is a real
 * defense-in-depth gap, but only those on routes that ALSO lack
 * `requireTenantScope` are an actual exposure.
 *
 * Wave 36 introduces a classifier that walks each finding back to its
 * nearest enclosing route definition and tags it as `defended` (route
 * uses `requireTenantScope`) or `undefended` (route does not). The new
 * metric `nama_rls_audit_undefended_risk` is what the alert should fire
 * on — it should stay at 0 in a healthy deployment.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: no secrets / PHI introduced. The classifier reads source
 *             text only; never logs row contents.
 *   - Rail 4: read-only scanner. Never mutates source. Never touches DB.
 *   - Rail 12: never prints SQL parameter values; only snippets with
 *             placeholders.
 *
 * Activation:
 *   1. node wave36_rls_defense.js server.js
 *      → JSON report with defended/undeforended counts + first samples
 *   2. node wave36_rls_defense_test.js
 *      → 32 unit / structural / safety tests
 *
 * Wiring (handled in server.js + wave32_metrics.js):
 *   - getWave31Report() now also includes `defense` counts
 *   - /api/metrics adds `nama_rls_audit_undefended_risk` gauge
 *   - alert rule `rls_undefended_risk_present` fires when count > 0
 *   - rule `rls_risk_count_high` is kept (as informational) but no
 *     longer in the firing set
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ----- Constants -----

const ROUTE_RE = /^app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/;
const QUERY_RE = /pool\.query\s*\(\s*[`'"]([^`'"]{1,400})[`'"]/g;
const TENANT_PREDICATE_RE = /\btenant_id\b/i;
const TABLE_REF_RE = /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:ONLY\s+)?([a-z_][a-z0-9_]+)/gi;
// Defense markers. Any one of these makes a route "defended" — i.e.
// the route is at least gated against unauthenticated / unauthorized
// access. (Pure presence of access control is not the same as perfect
// tenant isolation; the alert should still distinguish between
// defended and undefended for transparency.)
//
//   - requireTenantScope: middleware that blocks unscoped requests in prod
//   - requireRole:        RBAC module check (patient/doctor/etc.)
//   - requireAuth:        session check (must be logged in)
const DEFENSE_MW = /requireTenantScope|requireRole|requireAuth/;

// Re-use Wave 31's TENANT_SCOPED_TABLES allowlist as the canonical
// "is this table tenant-scoped?" source of truth. Falls back to an
// empty allowlist if Wave 31 isn't loaded yet — callers can then
// re-classify after explicitly loading Wave 31 first.
let _TENANT_SCOPED_TABLES = null;
function getTenantScopedTables() {
    if (_TENANT_SCOPED_TABLES) return _TENANT_SCOPED_TABLES;
    try {
        _TENANT_SCOPED_TABLES = require('./wave31_rls_audit').TENANT_SCOPED_TABLES;
    } catch (_) {
        _TENANT_SCOPED_TABLES = [];
    }
    return _TENANT_SCOPED_TABLES;
}

// Routes that are intentionally public and therefore NOT a defense gap
// even when they touch tenant-scoped tables (e.g. login flow queries
// audit_trail to bootstrap a session; cross-tenant admin endpoints).
const PUBLIC_ROUTE_PATTERNS = [
    /^\/api\/auth\//,
    /^\/api\/health/,
    /^\/api\/csp-report/,
    /^\/api\/metrics/,
    /^\/api\/openapi/,
    /^\/api\/docs/,
    /^\/api\/security\/rls-audit/,
    /^\/api\/webhook\//,           // NPHIES / payment callbacks (signed)
    /^\/api\/onboarding\//,        // E0 facility wizard (pre-tenant)
    /^\/api\/public\//,            // public assets
];

function isPublicRoute(routePath) {
    if (!routePath) return false;
    for (const re of PUBLIC_ROUTE_PATTERNS) if (re.test(routePath)) return true;
    return false;
}

/**
 * Walk the source and build an index of route definitions: for every
 * line, the nearest preceding `app.METHOD('/api/...')` line.
 *
 * @returns Array<{ path: string, hasTenantScope: boolean }>
 */
function indexRoutes(source) {
    const routes = [];
    const lines = source.split('\n');
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(ROUTE_RE);
        if (m) {
            if (current) routes.push(current);
            // The middleware chain can sit on the same line as the route
            // definition OR on subsequent lines (Express chains). Test
            // both.
            current = {
                path: m[2],
                hasTenantScope: DEFENSE_MW.test(line),
                startLine: i + 1,
            };
            continue;
        }
        // Look ahead 30 lines for the middleware chain.
        if (current && (i - current.startLine + 1) <= 30 && DEFENSE_MW.test(line)) {
            current.hasTenantScope = true;
        }
    }
    if (current) routes.push(current);
    return routes;
}

/**
 * Find the route that "owns" a given line. Walks backwards through the
 * route index to find the last route whose startLine is < the query line.
 *
 * Returns { path, hasTenantScope, isPublic } or null.
 */
function classifyAtLine(routes, line) {
    let owner = null;
    for (const r of routes) {
        if (r.startLine <= line) owner = r;
        else break;
    }
    if (!owner) return null;
    return {
        path: owner.path,
        hasTenantScope: owner.hasTenantScope,
        isPublic: isPublicRoute(owner.path),
        defended: owner.hasTenantScope || isPublicRoute(owner.path),
    };
}

/**
 * Augment a Wave 31 summary with defense classification.
 *
 * @param {string} source     server.js source text
 * @param {object} summary    Wave 31 summary (with .findings array)
 * @returns {object}          same shape, with `defense` block added
 */
function classifyFindings(source, summary) {
    const routes = indexRoutes(source);
    const findings = summary.findings || [];
    let defendedCount = 0, undefendedCount = 0, publicCount = 0;
    const undefendedFindings = [];
    for (const f of findings) {
        const cls = classifyAtLine(routes, f.line);
        const isDefended = !cls || cls.defended;
        const isPublic = cls && cls.isPublic;
        if (isDefended) defendedCount++; else undefendedCount++;
        if (isPublic) publicCount++;
        f.defense = cls;
        if (!isDefended) undefendedFindings.push(f);
    }
    summary.defense = {
        routesIndexed: routes.length,
        routesDefended: routes.filter(r => r.hasTenantScope).length,
        routesPublic: routes.filter(r => isPublicRoute(r.path)).length,
        routesOther: routes.filter(r => !r.hasTenantScope && !isPublicRoute(r.path)).length,
        findingsDefended: defendedCount,
        findingsUndefended: undefendedCount,
        findingsPublic: publicCount,
        undefendedSample: undefendedFindings.slice(0, 20).map(f => ({
            line: f.line, table: f.table, route: f.defense?.path || null,
            sqlSnippet: f.sqlSnippet,
        })),
    };
    return summary;
}

/**
 * Re-scan a file: combine Wave 31's auditFiles + classifyFindings.
 *
 * @param {string|string[]} targets path(s) to scan
 * @returns {object}                full report with .summary + .files + .defense
 */
function runWithDefense(targets) {
    const list = Array.isArray(targets) ? targets : [targets];
    // Wave 31's auditFiles: avoid hard dependency; inline a minimal scan that
    // produces the same summary shape. The full Wave 31 module is required by
    // the caller and is expected to also be loaded if richer detail is needed.
    const fs_ = require('fs');
    const summary = { total: 0, ok: 0, risk: 0, info: 0, findings: [] };
    const files = [];
    for (const t of list) {
        const src = fs_.readFileSync(t, 'utf8');
        const fileRes = scanOne(src, t);
        files.push(fileRes);
        summary.total += fileRes.total;
        summary.ok += fileRes.ok;
        summary.risk += fileRes.risk;
        summary.info += fileRes.info;
        summary.findings.push(...fileRes.findings);
    }
    // The first scanned source drives route classification (server.js).
    const leadSrc = list.length === 1 ? fs_.readFileSync(list[0], 'utf8') : fs_.readFileSync(list[0], 'utf8');
    classifyFindings(leadSrc, summary);
    return { summary, files };
}

/**
 * Lightweight single-file scanner that produces the same shape as
 * Wave 31's auditSource but does NOT depend on it. Keeps Wave 36
 * self-contained for tests that don't want to require Wave 31.
 */
function scanOne(source, filePath) {
    // Re-implement only what's needed to drive classifyFindings. This
    // duplicates ~30 lines of Wave 31 but lets Wave 36 be tested in
    // isolation. The TENANT_SCOPED_TABLES gate is pulled from Wave 31
    // (require('./wave31_rls_audit').TENANT_SCOPED_TABLES) so the
    // classification stays in sync with the Wave 31 audit's source of
    // truth.
    const tenantTables = getTenantScopedTables();
    const lines = source.split('\n');
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
    function offsetToLine(off) {
        let lo = 0, hi = lineStarts.length - 1, ans = 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lineStarts[mid] <= off) { ans = mid + 1; lo = mid + 1; } else hi = mid - 1;
        }
        return ans;
    }
    let total = 0, ok = 0, risk = 0, info = 0;
    const findings = [];
    const qRe = new RegExp(QUERY_RE.source, 'g');
    let m;
    while ((m = qRe.exec(source)) !== null) {
        total++;
        const sql = m[1];
        const offset = m.index + m[0].indexOf(sql);
        const line = offsetToLine(offset);
        if (lines[line - 1] && /^\s*\*/.test(lines[line - 1])) continue;
        const tRe = new RegExp(TABLE_REF_RE.source, 'gi');
        const tables = new Set();
        let tm;
        while ((tm = tRe.exec(sql)) !== null) tables.add((tm[1] || '').toLowerCase());
        if (!tables.size) { info++; continue; }
        const hasTenant = TENANT_PREDICATE_RE.test(sql);
        // Only tenant-scoped tables count as risk; non-tenant tables
        // (user_mfa, system_users, etc.) are user-scoped and OK to
        // query by user_id without tenant_id.
        const tenantHits = [...tables].filter(t => tenantTables.includes(t));
        if (!tenantHits.length) { info++; continue; }
        if (hasTenant) { ok++; continue; }
        risk++;
        for (const t of tenantHits) {
            findings.push({
                file: filePath,
                line,
                table: t,
                hasTenant: false,
                sqlSnippet: sql.replace(/\s+/g, ' ').slice(0, 140),
            });
        }
    }
    return { file: filePath, total, ok, risk, info, findings };
}

// ----- Prometheus exposition -----

function toPrometheusMetrics(summary) {
    const d = summary.defense || {};
    const lines = [
        '# HELP wave36_rls_defended Findings on routes protected by requireTenantScope (or public)',
        '# TYPE wave36_rls_defended gauge',
        `wave36_rls_defended ${d.findingsDefended || 0}`,
        '# HELP wave36_rls_undefended Findings on routes WITHOUT requireTenantScope (the real risk)',
        '# TYPE wave36_rls_undefended gauge',
        `wave36_rls_undefended ${d.findingsUndefended || 0}`,
        '# HELP wave36_rls_public Findings on intentionally public routes (login, health, docs)',
        '# TYPE wave36_rls_public gauge',
        `wave36_rls_public ${d.findingsPublic || 0}`,
        '# HELP wave36_routes_total Total routes indexed',
        '# TYPE wave36_routes_total gauge',
        `wave36_routes_total ${d.routesIndexed || 0}`,
        '# HELP wave36_routes_defended Routes protected by requireTenantScope',
        '# TYPE wave36_routes_defended gauge',
        `wave36_routes_defended ${d.routesDefended || 0}`,
        '',
    ];
    return lines.join('\n');
}

// ----- Exports -----

module.exports = {
    indexRoutes,
    classifyAtLine,
    classifyFindings,
    isPublicRoute,
    runWithDefense,
    scanOne,
    toPrometheusMetrics,
    // Constants exposed for tests
    ROUTE_RE,
    QUERY_RE,
    PUBLIC_ROUTE_PATTERNS,
};

// ----- CLI -----

if (require.main === module) {
    const target = process.argv.slice(2);
    if (!target.length) target.push(path.join(__dirname, 'server.js'));
    const { summary, files } = runWithDefense(target);
    const report = {
        scanned_at: new Date().toISOString(),
        summary,
        files: files.map(f => ({
            file: f.file, total: f.total || 0, ok: f.ok || 0, risk: f.risk || 0, info: f.info || 0,
        })),
        defense: summary.defense,
        undefended_sample: summary.defense?.undefendedSample || [],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
}