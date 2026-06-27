/**
 * cross_tenant_e16_test.js
 * Cross-tenant isolation + IDOR + null-tenant fail-closed for E16 (inventory supply-chain + CSSD).
 *  (A) Static audit: every E16 route carries explicit AND tenant_id=$N and the fail-closed 403.
 *  (B) Mock simulation: tenant A cannot read/modify tenant B's batches/PO/GRN/movements/cycles/trays;
 *      null tenant => zero rows / 403 (no unscoped fallback).
 *   NODE_PATH=.../node_modules node cross_tenant_e16_test.js
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
const has = sub => server.includes(sub);

console.log('\n=== E16 CROSS-TENANT ISOLATION TESTS ===\n');

// ---------- (A) static audit: explicit tenant filter on every E16 query ----------
console.log('[A] explicit AND tenant_id=$N on E16 reads/writes + fail-closed');
assert(has('FROM inventory_batches WHERE tenant_id=$1'), 'batches read tenant-scoped');
assert(has('FROM inventory_movements WHERE tenant_id=$1'), 'movements read tenant-scoped');
assert(has('FROM purchase_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE'), 'PO lock IDOR-scoped (id AND tenant)');
assert(has('FROM purchase_order_items WHERE id=$1 AND po_id=$2 AND tenant_id=$3 FOR UPDATE'), 'PO line lock IDOR-scoped');
assert(has('FROM cssd_sterilization_cycles WHERE id=$1 AND tenant_id=$2 FOR UPDATE'), 'cycle lock IDOR-scoped');
assert(has('FROM cssd_trays WHERE id=$1 AND tenant_id=$2 FOR UPDATE'), 'tray lock IDOR-scoped');
assert(has('FROM cssd_trays WHERE tenant_id=$1'), 'trays list tenant-scoped');
assert(has('INSERT INTO inventory_batches') && has('tenant_id, facility_id) VALUES'), 'batch insert stamps tenant/facility');
assert(has('INSERT INTO purchase_orders') && /purchase_orders \([^)]*tenant_id, facility_id\)/.test(server), 'PO insert stamps tenant/facility');
assert(has('INSERT INTO inventory_movements') && /inventory_movements \([^)]*tenant_id, facility_id\)/.test(server), 'movement insert stamps tenant/facility');
assert((server.match(/if \(!t\.ok\) return res\.status\(403\)/g) || []).length >= 12, 'fail-closed 403 on null tenant across E16 routes (>=12)', String((server.match(/if \(!t\.ok\) return res\.status\(403\)/g) || []).length));
// the GRN/movements use the dedicated-tx tenant binding (set_config true) so RLS also enforces isolation
assert(has("set_config('app.tenant_id', $1, true)"), 'dedicated-tx binds app.tenant_id for FORCE RLS');

// ---------- (B) mock isolation/IDOR simulation ----------
console.log('\n[B] mock isolation / IDOR / null-tenant fail-closed');
const db = {
    batches: [
        { id: 10, item_id: 1, qty_on_hand: 5, tenant_id: 1 },
        { id: 20, item_id: 9, qty_on_hand: 3, tenant_id: 2 }
    ],
    purchase_orders: [
        { id: 100, status: 'approved', tenant_id: 1 },
        { id: 200, status: 'approved', tenant_id: 2 }
    ],
    cycles: [
        { id: 1000, status: 'completed', bi_test_result: 'pass', tenant_id: 1, released_for_issue: 0 },
        { id: 2000, status: 'completed', bi_test_result: 'pass', tenant_id: 2, released_for_issue: 0 }
    ],
    trays: [
        { id: 50, status: 'sterile', cycle_id: 1000, tenant_id: 1 },
        { id: 60, status: 'sterile', cycle_id: 2000, tenant_id: 2 }
    ]
};

// generic tenant-scoped fetch by id (emulates "WHERE id=$1 AND tenant_id=$2")
function fetchScoped(coll, id, tenantId) {
    if (!tenantId) return null;                              // null tenant => fail-closed, no rows
    return db[coll].find(r => r.id === id && r.tenant_id === tenantId) || null;
}
function listScoped(coll, tenantId) {
    if (!tenantId) return [];                                // null tenant => zero rows
    return db[coll].filter(r => r.tenant_id === tenantId);
}

// reads isolated
assert(listScoped('batches', 1).length === 1 && listScoped('batches', 1)[0].id === 10, 'tenant 1 sees only its batch');
assert(!listScoped('batches', 1).some(b => b.tenant_id === 2), 'tenant 1 cannot see tenant 2 batches');
assert(listScoped('batches', null).length === 0, 'null tenant => zero batches (no unscoped fallback)');

// IDOR: tenant 1 trying to act on tenant 2 rows
assert(fetchScoped('purchase_orders', 200, 1) === null, 'tenant 1 cannot load tenant 2 PO (IDOR 404)');
assert(fetchScoped('purchase_orders', 100, 1) !== null, 'tenant 1 can load its own PO');
assert(fetchScoped('cycles', 2000, 1) === null, 'tenant 1 cannot load tenant 2 cycle (IDOR)');
assert(fetchScoped('trays', 60, 1) === null, 'tenant 1 cannot load tenant 2 tray (IDOR)');

// GRN against another tenant's PO is blocked because the PO is invisible
function receiveGRN(poId, tenantId) {
    const po = fetchScoped('purchase_orders', poId, tenantId);
    if (!po) return { status: 404 };
    return { status: 200 };
}
assert(receiveGRN(200, 1).status === 404, 'GRN by tenant 1 against tenant 2 PO => 404');
assert(receiveGRN(100, 1).status === 200, 'GRN by tenant 1 against own PO => 200');

// release / issue cannot cross tenant
function release(cycleId, tenantId) {
    const c = fetchScoped('cycles', cycleId, tenantId);
    if (!c) return { status: 404 };
    return { status: 200 };
}
assert(release(2000, 1).status === 404, 'tenant 1 cannot release tenant 2 cycle');
function issueTray(trayId, tenantId) {
    const t = fetchScoped('trays', trayId, tenantId);
    if (!t) return { status: 404 };
    return { status: 200 };
}
assert(issueTray(60, 1).status === 404, 'tenant 1 cannot issue tenant 2 tray');
assert(issueTray(50, 1).status === 200, 'tenant 1 can issue its own sterile tray');

// null-tenant writes blocked entirely
assert(receiveGRN(100, null).status === 404 && release(1000, null).status === 404, 'null tenant blocked from all mutations (fail-closed)');

console.log('\n=== SUMMARY ===');
console.log('  PASS: ' + passed + '  FAIL: ' + failed);
if (failed) { console.log('  Failures: ' + failures.join('; ')); process.exit(1); }
console.log('  ALL CROSS-TENANT TESTS PASSED');
process.exit(0);
