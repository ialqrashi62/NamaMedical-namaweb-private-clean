/**
 * tenant_resolve_test.js — PURE unit test for Gate 4 (tenant-context resolution precedence).
 * Run: node tenant_resolve_test.js   (no DB; deterministic)
 *
 * SECURITY invariant: a tenant-BOUND authenticated user's tenant comes from the SESSION and
 * can NEVER be overridden by a client-supplied x-tenant-id header (the old code read the
 * header first, letting a user for tenant 5 bind RLS context to tenant 7). The header is
 * honored ONLY for a tenant-UNBOUND privileged session (super admin) or dev fallback.
 */
'use strict';
const T = require('./tenant_resolve');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}

console.log(`${BOLD}Gate 4 — tenant context resolution (pure unit test)${RESET}\n`);

// ---- THE FIX: session wins over spoofed header ----
console.log('[1] tenant-bound session ignores x-tenant-id header (anti-spoof)');
let r = T.resolveTenantContext({ headerTenant: '7', sessionUser: { tenantId: 5, facilityId: 2 }, isProduction: true });
assert(r.tenantId === 5 && r.source === 'session', 'session tenant 5 + header 7 -> 5 (header ignored)', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: '99', sessionUser: { tenantId: 5, facilityId: 2 }, isProduction: false });
assert(r.tenantId === 5, 'even in dev, bound session beats header', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: 5, sessionUser: { tenantId: 5, facilityId: 2 }, isProduction: true });
assert(r.tenantId === 5 && r.facilityId === 2, 'facility from session', JSON.stringify(r));

// ---- privileged tenant-unbound session may use header ----
console.log('\n[2] tenant-unbound (super-admin) session may scope via header');
r = T.resolveTenantContext({ headerTenant: '3', sessionUser: { tenantId: null, role: 'SuperAdmin' }, isProduction: true });
assert(r.tenantId === 3 && r.source === 'header-privileged', 'unbound session + header 3 -> 3', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: null, sessionUser: { tenantId: null, role: 'SuperAdmin' }, isProduction: true });
assert(r.tenantId === null && r.source === 'none', 'unbound session no header -> null', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: 'abc', sessionUser: { tenantId: null }, isProduction: true });
assert(r.tenantId === null, 'garbage header -> null (never coerced to 1)', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: '0', sessionUser: { tenantId: null }, isProduction: true });
assert(r.tenantId === null, 'header 0 -> null (must be positive int)', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: '-2', sessionUser: { tenantId: null }, isProduction: true });
assert(r.tenantId === null, 'negative header -> null', JSON.stringify(r));

// ---- no session ----
console.log('\n[3] unauthenticated — dev fallback only, never header, never prod');
r = T.resolveTenantContext({ headerTenant: '9', sessionUser: null, isProduction: true });
assert(r.tenantId === null && r.source === 'none', 'no session + header in PROD -> null (no leak)', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: '9', sessionUser: null, isProduction: false });
assert(r.tenantId === 1 && r.source === 'dev-fallback', 'no session in DEV -> tenant 1 fallback (header ignored)', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: null, sessionUser: null, isProduction: false });
assert(r.tenantId === 1, 'no session no header in DEV -> 1', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: null, sessionUser: null, isProduction: true });
assert(r.tenantId === null, 'no session no header in PROD -> null', JSON.stringify(r));

// ---- invalid session tenant treated as unbound (not coerced) ----
console.log('\n[4] invalid session tenantId is not silently coerced');
r = T.resolveTenantContext({ headerTenant: null, sessionUser: { tenantId: 0 }, isProduction: true });
assert(r.tenantId === null, 'session tenantId 0 -> treated as unbound null', JSON.stringify(r));
r = T.resolveTenantContext({ headerTenant: '4', sessionUser: { tenantId: 'x' }, isProduction: true });
assert(r.tenantId === 4 && r.source === 'header-privileged', 'invalid session tenant + header -> unbound path uses header', JSON.stringify(r));

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
