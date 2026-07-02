/**
 * tenant_resolve.js — Gate 4 pure tenant-context resolution (RLS binding source).
 *
 * SECURITY (anti cross-tenant spoof): the tenant of a tenant-BOUND authenticated user is
 * taken from the trusted SESSION and can NEVER be overridden by a client-supplied
 * x-tenant-id header. The previous logic read the header FIRST, so a user authenticated
 * for tenant 5 could send `x-tenant-id: 7` and bind the RLS connection var app.tenant_id
 * to tenant 7 (RLS was then the only, defeated, backstop).
 *
 * Precedence:
 *   1. Session user WITH a valid tenantId  -> session tenant (header IGNORED).           [the fix]
 *   2. Session user WITHOUT a tenantId (tenant-unbound super admin) -> header if valid.
 *   3. No session -> dev fallback tenant 1 in non-production only; null in production.
 * Any tenant id must be a positive integer; invalid values are treated as absent and are
 * NEVER silently coerced to 1.
 *
 * حلّ سياق المستأجر: الجلسة الموثوقة تسبق الترويسة دائمًا لمستخدم مرتبط بمستأجر (منع الانتحال).
 */
'use strict';

function positiveInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

function resolveTenantContext({ headerTenant, sessionUser, isProduction } = {}) {
    const sessionTenant = sessionUser ? positiveInt(sessionUser.tenantId) : null;

    // 1. Tenant-bound authenticated user — trusted session wins, header ignored.
    if (sessionTenant !== null) {
        const facilityId = sessionUser && sessionUser.facilityId != null ? sessionUser.facilityId : null;
        return { tenantId: sessionTenant, facilityId, isProduction: !!isProduction, source: 'session' };
    }

    // 2. Authenticated but tenant-unbound (e.g. super admin) — may scope via header.
    if (sessionUser) {
        const headerT = positiveInt(headerTenant);
        if (headerT !== null) {
            return { tenantId: headerT, facilityId: null, isProduction: !!isProduction, source: 'header-privileged' };
        }
        return { tenantId: null, facilityId: null, isProduction: !!isProduction, source: 'none' };
    }

    // 3. Unauthenticated — dev fallback only, never honor a header, never in production.
    if (!isProduction) {
        return { tenantId: 1, facilityId: 1, isProduction: false, source: 'dev-fallback' };
    }
    return { tenantId: null, facilityId: null, isProduction: true, source: 'none' };
}

module.exports = { resolveTenantContext, positiveInt };
