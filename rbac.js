/**
 * rbac.js — E-X3 RBAC matrix middleware (additive, non-breaking).
 *
 * Provides makeRequirePermission(deps) -> requirePermission(key) middleware that enforces the
 * DB-backed role_permissions matrix (the L6 gap: previously system_users.permissions / user_permissions
 * were persisted but NEVER enforced). It is purely ADDITIVE — it does not modify or replace the existing
 * in-code requireRole / ROLE_PERMISSIONS. Mount it as an extra middleware on protected routes.
 *
 * Behavior (in order):
 *   1) Unauthenticated  -> 401 (mirror requireAuth shape).
 *   2) Admin / role with '*' in legacy ROLE_PERMISSIONS -> next() (short-circuit, mirrors server.js:219).
 *   3) DB matrix HIT: a role_permissions row for (tenant_id, role, permission_key) exists -> next().
 *      DB matrix explicit-miss (role HAS rows but not this key) -> 403 {error:'Access denied'}.
 *   4) FALLBACK (non-breaking): role has NO matrix rows at all for this tenant -> defer to the supplied
 *      roleFallback(req) (wrapping the legacy requireRole logic). If no fallback provided -> allow (open),
 *      preserving pre-RBAC-matrix behavior so deploying the table without seeding never locks anyone out.
 *   5) Any DB error -> fail-closed to the fallback (never throw into the route).
 *
 * deps: { pool, getRequestTenantContext, roleFallback }
 *   - pool: pg pool (tenant-scoped via the db_postgres AsyncLocalStorage wrapper).
 *   - getRequestTenantContext(req) -> { tenantId }.
 *   - roleFallback(req): optional (req)=>boolean — legacy allow decision when matrix is empty for the role.
 */
'use strict';

function makeRequirePermission(deps) {
    const { pool, getRequestTenantContext, roleFallback } = deps || {};
    if (!pool || typeof getRequestTenantContext !== 'function') {
        throw new Error('rbac.makeRequirePermission requires { pool, getRequestTenantContext }');
    }

    // Legacy Admin/'*' short-circuit set — kept here so we never need to import ROLE_PERMISSIONS.
    // Admin is the canonical superuser role in server.js ROLE_PERMISSIONS ('Admin': '*').
    // Mirror the canonical set EXACTLY: only 'Admin' maps to '*' (server.js:204). Broadening this to
    // case variants / 'administrator' would over-trust roles the canonical requireRole never treats as wildcard.
    const ADMIN_ROLES = new Set(['Admin']);

    return function requirePermission(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('requirePermission(key) requires a non-empty string key');
        }
        return async function (req, res, next) {
            try {
                if (!req.session || !req.session.user) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
                const role = req.session.user.role;

                // (2) Admin short-circuit (mirrors ROLE_PERMISSIONS '*').
                if (ADMIN_ROLES.has(role)) return next();

                const { tenantId } = getRequestTenantContext(req);

                // Resolve the role's matrix rows for this tenant in ONE query.
                // tenant-scoped: role_permissions is under FORCE RLS; the pool wrapper binds app.tenant_id,
                // and we also filter explicitly as defense-in-depth.
                const { rows } = await pool.query(
                    'SELECT permission_key FROM role_permissions WHERE role = $1 AND ($2::int IS NULL OR tenant_id = $2)',
                    [role, tenantId || null]
                );

                if (rows.length === 0) {
                    // (4) No matrix rows for this role/tenant -> non-breaking fallback to legacy behavior.
                    if (typeof roleFallback === 'function') {
                        return roleFallback(req) ? next() : res.status(403).json({ error: 'Access denied' });
                    }
                    return next(); // open fallback: preserves pre-matrix behavior
                }

                // (3) Matrix present for this role: enforce strictly.
                const granted = rows.some(r => r.permission_key === key);
                if (granted) return next();
                return res.status(403).json({ error: 'Access denied' });
            } catch (e) {
                // (5) Fail-closed to fallback; never leak details, never throw into the route.
                console.error('requirePermission error:', e.message);
                if (typeof roleFallback === 'function') {
                    return roleFallback(req) ? next() : res.status(403).json({ error: 'Access denied' });
                }
                return res.status(403).json({ error: 'Access denied' });
            }
        };
    };
}

module.exports = { makeRequirePermission };
