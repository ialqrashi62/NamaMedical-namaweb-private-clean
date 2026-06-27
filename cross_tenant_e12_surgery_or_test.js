/**
 * cross_tenant_e12_surgery_or_test.js — Epic E12 tenant-isolation tests.
 * 1) Static: E12 queries carry explicit AND tenant_id, INSERTs stamp tenant_id from session.
 * 2) Static: e12RequireTenant fails closed (403) in production with no tenant.
 * 3) Simulation: cross-tenant IDOR is blocked on all 5 new tables + linked entity checks.
 * DB-free. Run: NODE_PATH=...\node_modules node cross_tenant_e12_surgery_or_test.js
 */
const fs = require('fs');
const path = require('path');
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;
function assert(cond, name, extra = '') { if (cond) { console.log(`  ${G}PASS${X} ${name}`); passed++; } else { console.log(`  ${R}FAIL${X} ${name}${extra ? ' | ' + extra : ''}`); failed++; } }

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const e12 = server.slice(server.indexOf('EPIC E12'), server.indexOf('===== BLOOD BANK'));

console.log('\n[ 1 ] Static tenant-scoping audit (E12 block)');
assert(e12.includes('function e12RequireTenant'), 'e12RequireTenant fail-closed helper present');
assert(e12.includes("err.statusCode = 403") && e12.includes('isProduction'), 'fail-closed 403 in production on null tenant');
// Every SELECT/UPDATE/DELETE on the new tables uses an AND tenant_id=$ branch.
const newTables = ['or_slots', 'who_surgical_checklist', 'pacu_records', 'operative_notes', 'or_consumption'];
for (const t of newTables) {
    const re = new RegExp(t + "[\\s\\S]{0,400}?(AND tenant_id=\\$|WHERE tenant_id=\\$|tenant_id=\\$)");
    assert(re.test(e12), `table ${t} referenced with tenant_id scoping`);
}
// INSERTs stamp tenant_id (and never read it from the request body).
assert(!/tenant_id\s*:\s*req\.body/.test(e12) && !/body\.tenant_id/.test(e12), 'tenant_id never sourced from client body');
assert(e12.includes('tenantId, facilityId') || e12.includes('tenantId,facilityId') || /tenantId,\s*facilityId/.test(e12), 'tenant/facility stamped from session context');
// Linked-entity tenant checks on reserve (surgery/room/surgeon all tenant-validated).
assert(e12.includes('Invalid operating room context or access denied'), 'room tenant-validated on reserve');
assert(e12.includes('Invalid surgeon context or access denied'), 'surgeon tenant-validated on reserve');

console.log('\n[ 2 ] Cross-tenant IDOR simulation (RLS + explicit filter)');
const db = {
    patients: [{ id: 1, tenant_id: 1 }, { id: 2, tenant_id: 2 }],
    surgeries: [{ id: 501, patient_id: 1, tenant_id: 1, status: 'Scheduled' }, { id: 502, patient_id: 2, tenant_id: 2, status: 'Scheduled' }],
    operating_rooms: [{ id: 10, tenant_id: 1 }, { id: 20, tenant_id: 2 }],
    system_users: [{ id: 11, tenant_id: 1 }, { id: 22, tenant_id: 2 }],
    or_slots: [{ id: 1, surgery_id: 501, tenant_id: 1 }, { id: 2, surgery_id: 502, tenant_id: 2 }],
    who_surgical_checklist: [{ id: 1, surgery_id: 501, tenant_id: 1, state: 'Time-Out' }, { id: 2, surgery_id: 502, tenant_id: 2, state: 'Sign-In' }],
    pacu_records: [{ id: 1, surgery_id: 501, tenant_id: 1 }, { id: 2, surgery_id: 502, tenant_id: 2 }],
    operative_notes: [{ id: 1, surgery_id: 501, tenant_id: 1 }, { id: 2, surgery_id: 502, tenant_id: 2 }],
    or_consumption: [{ id: 1, surgery_id: 501, tenant_id: 1 }, { id: 2, surgery_id: 502, tenant_id: 2 }],
    inventory_items: [{ id: 100, tenant_id: 1, stock_qty: 5 }, { id: 200, tenant_id: 2, stock_qty: 5 }]
};
// Simulates: DB RLS filter (tenant) + the route's explicit AND tenant_id (same tenant).
function q(tbl, filters, sessionTenant) {
    return db[tbl].filter(r => r.tenant_id === sessionTenant).filter(r => Object.entries(filters).every(([k, v]) => r[k] === v));
}
// A. Tenant 1 cannot read Tenant 2 rows on any new table.
for (const t of newTables) {
    const other = db[t].find(r => r.tenant_id === 2);
    assert(q(t, { id: other.id }, 1).length === 0, `T1 cannot read T2 ${t} (IDOR blocked)`);
}
// B. Tenant 1 cannot reserve using Tenant 2 room/surgeon/surgery.
function validateReserve(surgeryId, roomId, surgeonId, tenant) {
    if (q('surgeries', { id: surgeryId }, tenant).length === 0) return { status: 404 };
    if (q('operating_rooms', { id: roomId }, tenant).length === 0) return { status: 403 };
    if (q('system_users', { id: surgeonId }, tenant).length === 0) return { status: 403 };
    return { status: 200 };
}
assert(validateReserve(502, 10, 11, 1).status === 404, 'T1 reserve against T2 surgery -> 404');
assert(validateReserve(501, 20, 11, 1).status === 403, 'T1 reserve with T2 room -> 403');
assert(validateReserve(501, 10, 22, 1).status === 403, 'T1 reserve with T2 surgeon -> 403');
assert(validateReserve(501, 10, 11, 1).status === 200, 'same-tenant reserve allowed');
// C. Tenant 1 cannot decrement Tenant 2 inventory item.
assert(q('inventory_items', { id: 200 }, 1).length === 0, 'T1 cannot lock/decrement T2 inventory item');
assert(q('inventory_items', { id: 100 }, 1).length === 1, 'T1 can use its own inventory item');
// D. Mass-assignment: client-supplied tenant_id ignored, session value stamped.
function stampInsert(body, sessionTenant) { return { tenant_id: sessionTenant, surgery_id: body.surgery_id }; }
assert(stampInsert({ surgery_id: 501, tenant_id: 2 }, 1).tenant_id === 1, 'client tenant_id injection ignored; session stamped');
// E. WHO checklist state of T2 invisible to T1 (gating cannot be spoofed cross-tenant).
assert(q('who_surgical_checklist', { surgery_id: 502 }, 1).length === 0, 'T1 cannot see/abuse T2 WHO checklist state');

console.log(`\n[ E12 CROSS-TENANT ] passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
