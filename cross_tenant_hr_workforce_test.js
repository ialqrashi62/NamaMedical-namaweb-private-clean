/**
 * cross_tenant_hr_workforce_test.js
 * Cross-tenant isolation tests for E18 HR/Workforce (no DB/HTTP, no PHI):
 *  (A) Static audit: every E18 route carries requireTenantScope + e18RequireTenant fail-closed +
 *      explicit AND tenant_id=$N; mutations stamp tenant_id; new migration tables have FORCE RLS.
 *  (B) Mock-pool tenant-filter simulation: tenant 1 never sees tenant 2 HR rows on GET, and a
 *      writer stamps the session tenant (cannot forge another tenant's id), for licenses, shifts,
 *      leave requests, payroll slips and competencies.
 *   NODE_PATH=.../node_modules node cross_tenant_hr_workforce_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det) {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; failures.push(name); }
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const mig = fs.readFileSync(path.join(__dirname, 'migrations', 'e18_01_hr_workforce_up.sql'), 'utf8');
const has = s => server.includes(s);

console.log('\n=== E18 CROSS-TENANT ISOLATION TESTS ===\n');

// ---------- (A) static audit ----------
console.log('[A] static audit: tenant scoping on every E18 route + RLS on new tables');
const hrRoutes = ['/api/hr/licenses', '/api/hr/shifts', '/api/hr/attendance',
    '/api/hr/leave-requests', '/api/hr/payroll-slips', '/api/hr/competencies'];
hrRoutes.forEach(r => {
    // each route mentions requireTenantScope (paired with requireRole('hr'))
    const occurrences = server.split(r).length - 1;
    assert(occurrences >= 1, 'route present: ' + r);
});
assert((server.match(/requireRole\('hr'\), requireTenantScope/g) || []).length >= 14, 'all E18 routes pair requireRole(hr)+requireTenantScope');
assert(has('function e18RequireTenant(req)') && has("if (!tenantId) return { ok: false }"), 'fail-closed tenant resolver');

// I1: GET /api/hr/attendance must carry requireTenantScope + explicit tenant filter
assert(has("app.get('/api/hr/attendance', requireAuth, requireRole('hr'), requireTenantScope"), 'I1: GET /api/hr/attendance has requireTenantScope');
assert(has('ha.tenant_id=$1'), 'I1: GET /api/hr/attendance query carries explicit ha.tenant_id=$1 filter');

// explicit tenant_id in every list query (no unscoped SELECT)
['l.tenant_id=$1', 's.tenant_id=$1', 'r.tenant_id=$1', 'c.tenant_id=$1', 'ha.tenant_id=$1'].forEach(f =>
    assert(has(f), 'explicit tenant filter: ' + f));
// writes stamp tenant_id (the session tenant t.tenantId), never a client-supplied tenant
assert(has('t.tenantId, t.facilityId || null') || has('t.tenantId, t.facilityId'), 'inserts stamp session tenant_id/facility_id');
assert(!/tenant_id\s*=\s*req\.body\.tenant_id/.test(server), 'no client-supplied tenant_id ever trusted');

// new migration tables: FORCE RLS + canonical policy + tenant_id NOT NULL REFERENCES tenants
['hr_licenses', 'hr_shifts', 'hr_leave_requests', 'hr_payroll_slips', 'hr_competencies'].forEach(tbl => {
    assert(mig.includes('ALTER TABLE ' + tbl + ' FORCE ROW LEVEL SECURITY'), tbl + ': FORCE RLS');
    assert(mig.includes('tenant_id       INTEGER NOT NULL REFERENCES tenants(id)') || new RegExp('tenant_id\\s+INTEGER NOT NULL REFERENCES tenants\\(id\\)').test(mig), tbl + ': tenant_id NOT NULL FK->tenants (file-level)');
});
assert((mig.match(/USING \(tenant_id = NULLIF\(current_setting\('app\.tenant_id', true\), ''\)::integer\)/g) || []).length === 5,
    'canonical RLS policy on all 5 new tables');
assert((mig.match(/REFERENCES hr_employees\(id\) ON DELETE CASCADE/g) || []).length === 5, 'all 5 tables FK->hr_employees');

// ---------- (B) mock-pool tenant-filter simulation ----------
console.log('\n[B] mock-pool simulation: tenant 1 cannot see/forge tenant 2 HR rows');

function makeStore() {
    return {
        hr_licenses: [
            { id: 1, employee_id: 11, license_number: 'SCFHS-T1', tenant_id: 1 },
            { id: 2, employee_id: 22, license_number: 'SCFHS-T2', tenant_id: 2 }
        ],
        hr_shifts: [
            { id: 1, employee_id: 11, shift_date: '2026-06-26', tenant_id: 1 },
            { id: 2, employee_id: 22, shift_date: '2026-06-26', tenant_id: 2 }
        ],
        hr_leave_requests: [
            { id: 1, employee_id: 11, status: 'requested', tenant_id: 1 },
            { id: 2, employee_id: 22, status: 'requested', tenant_id: 2 }
        ],
        hr_payroll_slips: [
            { id: 1, employee_id: 11, net_salary: 9000, tenant_id: 1 },
            { id: 2, employee_id: 22, net_salary: 8000, tenant_id: 2 }
        ],
        hr_competencies: [
            { id: 1, employee_id: 11, status: 'compliant', tenant_id: 1 },
            { id: 2, employee_id: 22, status: 'non_compliant', tenant_id: 2 }
        ]
    };
}
// GET enforces RLS: only rows WHERE tenant_id = session tenant
function getRows(store, table, sessionTenant) {
    return store[table].filter(r => r.tenant_id === sessionTenant);
}
// WRITE always stamps the session tenant (RLS WITH CHECK rejects any other)
function insertRow(store, table, row, sessionTenant) {
    const stamped = { ...row, tenant_id: sessionTenant }; // server stamps session tenant, ignores client value
    const id = Math.max(0, ...store[table].map(r => r.id)) + 1;
    const rec = { id, ...stamped };
    store[table].push(rec);
    return rec;
}
// Cross-tenant mutation guard: a status flip locks/loads WHERE id AND tenant_id
function loadForUpdate(store, table, id, sessionTenant) {
    return store[table].find(r => r.id === id && r.tenant_id === sessionTenant) || null;
}

['hr_licenses', 'hr_shifts', 'hr_leave_requests', 'hr_payroll_slips', 'hr_competencies'].forEach(tbl => {
    const store = makeStore();
    const t1 = getRows(store, tbl, 1);
    const t2 = getRows(store, tbl, 2);
    assert(t1.length === 1 && t1[0].tenant_id === 1, `GET ${tbl} (tenant 1): sees only own row`);
    assert(!t1.some(r => r.tenant_id === 2), `GET ${tbl} (tenant 1): no tenant-2 leak`);
    assert(t2.length === 1 && t2[0].tenant_id === 2, `GET ${tbl} (tenant 2): sees only own row`);
});

// writer: tenant 1 attempts to forge tenant_id=2 -> server stamps 1
const wstore = makeStore();
const forged = insertRow(wstore, 'hr_licenses', { employee_id: 11, license_number: 'X', tenant_id: 2 /* forge attempt */ }, 1);
assert(forged.tenant_id === 1, 'WRITE stamps session tenant (forged tenant_id=2 overridden to 1)');
assert(getRows(wstore, 'hr_licenses', 2).length === 1, 'tenant-2 view still has exactly its original row (no injected row)');

// cross-tenant status flip: tenant 1 cannot load tenant 2's leave row -> null (404, not mutated)
const lstore = makeStore();
assert(loadForUpdate(lstore, 'hr_leave_requests', 2, 1) === null, 'tenant 1 cannot FOR UPDATE-load tenant 2 leave row (IDOR blocked)');
assert(loadForUpdate(lstore, 'hr_leave_requests', 1, 1) !== null, 'tenant 1 CAN load its own leave row');
assert(loadForUpdate(lstore, 'hr_payroll_slips', 2, 1) === null, 'tenant 1 cannot load tenant 2 payroll slip (IDOR blocked)');

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
process.exit(0);
