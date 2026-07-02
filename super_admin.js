/**
 * super_admin.js — Jumanasoft SaaS Tenant Control Center (Batch 1).
 *
 * Platform-level Super Admin to manage TENANTS (list / details / suspend / reactivate). Additive +
 * flag-gated (`SUPER_ADMIN_ENABLED`): mounting an empty router when disabled = zero behavior change.
 *
 * Security model (no tenant breakout):
 *   - Super Admin identity = an explicit ENV allowlist `SUPER_ADMIN_USERS` (comma-separated usernames).
 *     A tenant 'Admin' is NOT a Super Admin → prevents privilege escalation. Fail-closed.
 *   - The tenants table has no RLS (top-level), so listing reads it directly.
 *   - Per-tenant stats (users/facilities/last activity) are read INSIDE that tenant's RLS context
 *     (runWithTenant) — never a bulk cross-tenant read.
 *   - Every state change writes an audit event. No delete, no payments, no impersonation (this batch).
 *
 * Pure core (isSuperAdmin / parseAllowlist / canTransition / parseTenantFilters / deriveTenantSummary)
 * is unit-tested with no DB. makeSuperAdminRouter(deps) builds the Express router.
 */
'use strict';

const ALLOWED_STATUSES = ['active', 'suspended', 'trial', 'cancelled'];

// ENV allowlist -> Set of usernames (trimmed, non-empty).
function parseAllowlist(envValue) {
    return new Set(String(envValue || '')
        .split(',').map(s => s.trim()).filter(Boolean));
}

// Super Admin iff the user is active AND explicitly listed. Tenant role is irrelevant (no escalation).
function isSuperAdmin(user, allowlist) {
    if (!user || !user.username) return false;
    if (user.is_active === 0 || user.is_active === false) return false;
    const set = allowlist instanceof Set ? allowlist : parseAllowlist(allowlist);
    return set.has(String(user.username));
}

// Allowed status transitions (conservative). cancelled is terminal here (reactivation deferred).
const TRANSITIONS = {
    active:    ['suspended'],
    suspended: ['active'],
    trial:     ['active', 'suspended'],
    cancelled: []
};
function canTransition(from, to) {
    if (!ALLOWED_STATUSES.includes(to)) return false;
    const allowed = TRANSITIONS[from] || [];
    return allowed.includes(to);
}

// Validate/normalize list filters from the query string (enum + bounded text). Never throws.
function parseTenantFilters(query = {}) {
    const out = {};
    if (query.status && ALLOWED_STATUSES.includes(String(query.status))) out.status = String(query.status);
    if (query.plan && /^[\w-]{1,50}$/.test(String(query.plan))) out.plan = String(query.plan);
    if (query.q) out.q = String(query.q).trim().slice(0, 100);
    return out;
}

// Build a stable display summary for one tenant row (+ optional computed stats).
function deriveTenantSummary(row, stats = {}) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name || '',
        subdomain: row.subdomain || '',
        status: ALLOWED_STATUSES.includes(row.status) ? row.status : 'active',
        plan: row.plan_type || 'standard',
        created_at: row.created_at || null,
        users: stats.users == null ? null : Number(stats.users),
        facilities: stats.facilities == null ? null : Number(stats.facilities),
        last_activity: stats.last_activity || null
    };
}

// ---- Express router factory ----
// deps: { pool, getActor(req)->user, runWithTenant(tenantId,fn), logAudit(...), allowlist, enabled,
//         requireAuth (middleware) }
function makeSuperAdminRouter(deps = {}) {
    const express = require('express');
    const router = express.Router();
    const { pool, getActor, runWithTenant, logAudit, requireAuth } = deps;
    const enabled = deps.enabled !== false; // default on when constructed; server gates by env
    const allowlist = deps.allowlist instanceof Set ? deps.allowlist : parseAllowlist(deps.allowlist);

    if (!enabled) return router; // inert: no routes registered

    function requireSuperAdmin(req, res, next) {
        const user = getActor ? getActor(req) : (req.session && req.session.user);
        if (!isSuperAdmin(user, allowlist)) {
            try { logAudit && logAudit(user && user.id, user && user.display_name, 'SUPER_ADMIN_DENY', 'SuperAdmin', `denied ${req.method} ${req.originalUrl || req.url}`, req.ip); } catch (_) {}
            return res.status(403).json({ error: 'Super Admin access required', code: 'SUPER_ADMIN_REQUIRED' });
        }
        return next();
    }
    if (requireAuth) router.use(requireAuth);
    router.use(requireSuperAdmin);

    const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : null; };

    // STATS — Aggregated platform metrics (Phase 3)
    router.get('/stats', async (req, res) => {
        try {
            // 1. Total revenue collected
            const revQuery = await pool.query('SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE paid = 1 OR paid = \'t\'');
            const totalRevenue = parseFloat(revQuery.rows[0].total || 0);

            // 2. Total tenants count
            const tenQuery = await pool.query('SELECT COUNT(*) AS count FROM tenants');
            const totalTenants = parseInt(tenQuery.rows[0].count || 0, 10);

            // 3. Active subscriptions count
            let activeSubscriptions = 0;
            try {
                const subQuery = await pool.query('SELECT COUNT(*) AS count FROM tenant_plan_assignments WHERE effective_to IS NULL');
                activeSubscriptions = parseInt(subQuery.rows[0].count || 0, 10);
            } catch (_) {}

            // 4. Plans breakdown
            let plansBreakdown = [];
            try {
                const breakdownQuery = await pool.query(`
                    SELECT plan_key, COUNT(*) AS count 
                    FROM tenant_plan_assignments 
                    WHERE effective_to IS NULL 
                    GROUP BY plan_key
                `);
                plansBreakdown = breakdownQuery.rows.map(r => ({
                    plan_key: r.plan_key,
                    count: parseInt(r.count || 0, 10)
                }));
            } catch (_) {}

            res.json({
                total_revenue: totalRevenue,
                total_tenants: totalTenants,
                active_subscriptions: activeSubscriptions,
                plans_breakdown: plansBreakdown
            });
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // LIST — reads `tenants` directly (no RLS); filters applied in SQL.
    router.get('/tenants', async (req, res) => {
        try {
            const f = parseTenantFilters(req.query);
            const where = [], params = [];
            if (f.status) { params.push(f.status); where.push(`status = $${params.length}`); }
            if (f.plan) { params.push(f.plan); where.push(`plan_type = $${params.length}`); }
            if (f.q) { params.push('%' + f.q + '%'); where.push(`(name ILIKE $${params.length} OR subdomain ILIKE $${params.length})`); }
            const sql = `SELECT id, name, subdomain, status, plan_type, created_at FROM tenants
                         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                         ORDER BY id DESC LIMIT 500`;
            const rows = (await pool.query(sql, params)).rows;
            res.json({ tenants: rows.map(r => deriveTenantSummary(r)), filters: f, count: rows.length });
        } catch (e) { res.status(500).json({ error: 'Server error' }); }
    });

    // DETAILS — core row (no RLS) + per-tenant stats read INSIDE that tenant's RLS context.
    router.get('/tenants/:id', async (req, res) => {
        const id = posInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid tenant id' });
        try {
            const row = (await pool.query('SELECT id, name, subdomain, status, plan_type, created_at FROM tenants WHERE id=$1', [id])).rows[0];
            if (!row) return res.status(404).json({ error: 'Tenant not found' });
            let stats = { users: null, facilities: null, last_activity: null };
            const readStats = async () => {
                const u = (await pool.query('SELECT COUNT(*)::int AS c FROM user_tenants WHERE tenant_id=$1 AND is_active=true', [id])).rows[0];
                const fac = (await pool.query('SELECT COUNT(*)::int AS c FROM facilities WHERE tenant_id=$1', [id])).rows[0];
                const la = (await pool.query('SELECT MAX(created_at) AS m FROM audit_trail WHERE tenant_id=$1', [id])).rows[0];
                stats = { users: u && u.c, facilities: fac && fac.c, last_activity: la && la.m };
            };
            if (runWithTenant) { await runWithTenant(id, readStats); } else { await readStats(); }
            res.json({ tenant: deriveTenantSummary(row, stats) });
        } catch (e) { res.status(500).json({ error: 'Server error' }); }
    });

    async function changeStatus(req, res, to, action) {
        const id = posInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid tenant id' });
        try {
            const row = (await pool.query('SELECT id, name, status FROM tenants WHERE id=$1', [id])).rows[0];
            if (!row) return res.status(404).json({ error: 'Tenant not found' });
            if (row.status === to) return res.json({ tenant: deriveTenantSummary(row), unchanged: true });
            if (!canTransition(row.status, to)) {
                return res.status(409).json({ error: `Cannot change status from ${row.status} to ${to}`, code: 'INVALID_TRANSITION' });
            }
            const updated = (await pool.query('UPDATE tenants SET status=$1 WHERE id=$2 RETURNING id, name, subdomain, status, plan_type, created_at', [to, id])).rows[0];
            const actor = getActor ? getActor(req) : (req.session && req.session.user);
            try { logAudit && logAudit(actor && actor.id, actor && actor.display_name, action, 'SuperAdmin', `tenant#${id} (${row.name}) ${row.status} -> ${to}`, req.ip); } catch (_) {}
            res.json({ tenant: deriveTenantSummary(updated) });
        } catch (e) { res.status(500).json({ error: 'Server error' }); }
    }
    router.post('/tenants/:id/suspend', (req, res) => changeStatus(req, res, 'suspended', 'TENANT_SUSPEND'));
    router.post('/tenants/:id/reactivate', (req, res) => changeStatus(req, res, 'active', 'TENANT_REACTIVATE'));

    return router;
}

module.exports = {
    ALLOWED_STATUSES, TRANSITIONS,
    parseAllowlist, isSuperAdmin, canTransition, parseTenantFilters, deriveTenantSummary,
    makeSuperAdminRouter
};
