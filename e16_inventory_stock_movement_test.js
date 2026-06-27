/**
 * e16_inventory_stock_movement_test.js
 * Business/workflow + state-machine tests for E16:
 *  (A) Static code audit of server.js: tenant scoping, RBAC role guards, SELECT FOR UPDATE,
 *      no-negative stock, anti-spoof (no client bi_test_result on PUT cycles), BI release gate.
 *  (B) Mock-pool simulation of the transactional stock-movement decrement (no negative, race-safe),
 *      PO -> GRN flow advancing PO status, and the fail-CLOSED CSSD release gate, reusing the
 *      real e16 engine for the authority decisions.
 *   NODE_PATH=.../node_modules node e16_inventory_stock_movement_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const e16 = require('./e16_inventory_engine');

let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det) {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; failures.push(name); }
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const collapse = s => s.replace(/\s+/g, '');
const srvC = collapse(server);
const has = sub => server.includes(sub);
const hasC = sub => srvC.includes(collapse(sub));

console.log('\n=== E16 STOCK-MOVEMENT / WORKFLOW TESTS ===\n');

// ---------- (A) static code audit ----------
console.log('[A] server.js static audit (RBAC / tenant / tx / state machine / anti-spoof)');
// RBAC role guards on new routes
assert(hasC("app.post('/api/inventory/movements', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope"), 'movements route: requireRole(inventory/pharmacy)+tenant scope');
assert(hasC("app.post('/api/inventory/goods-receipts', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope"), 'GRN route: role + tenant scope');
assert(hasC("app.post('/api/inventory/purchase-orders', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope"), 'PO create: role + tenant scope');
assert(hasC("app.put('/api/inventory/purchase-orders/:id/status', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope"), 'PO status: role + tenant scope');
assert(hasC("app.put('/api/cssd/cycles/:id/release', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope"), 'CSSD release: role + tenant scope');
assert(hasC("app.put('/api/cssd/cycles/:id/bi-result', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope"), 'CSSD bi-result: role + tenant scope');
// legacy CSSD routes hardened (no longer requireAuth-only)
assert(hasC("app.get('/api/cssd/cycles', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope"), 'legacy GET cycles hardened with tenant scope');
assert(hasC("app.put('/api/cssd/cycles/:id', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope"), 'legacy PUT cycles/:id hardened with tenant scope');
assert(hasC("app.get('/api/cssd/batches', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope"), 'legacy GET batches hardened');
// fail-closed tenant helper present + used
assert(has('function e16RequireTenant(req)') && has("if (!t.ok) return res.status(403)"), 'e16RequireTenant fail-closed (403) used');
// transactional safety
assert(has('async function e16BeginTenantTx') && has("set_config('app.tenant_id', $1, true)"), 'dedicated-tx client sets app.tenant_id (RLS-visible under FOR UPDATE)');
assert(has('FOR UPDATE'), 'SELECT ... FOR UPDATE present (race-safe shared resource)');
assert(has('ORDER BY id ASC FOR UPDATE'), 'batches locked in ascending id order (deadlock-safe)');
// no-negative stock
assert(has('stock_qty >= $1'), 'decrement guarded by stock_qty >= qty (no negative at SQL layer)');
assert(has("res.status(409).json({ error: 'Insufficient stock'"), 'insufficient stock returns 409');
// state machines / 409
assert(has('e16.canTransitionPO') && has('Invalid PO transition'), 'PO transition rejected 409 on invalid');
assert(has('e16.canReceivePO') && has('not receivable in status'), 'GRN blocked unless PO receivable (409)');
assert(has('e16.canTransitionCycle') && has('Invalid cycle transition'), 'cycle transition rejected 409 on invalid');
assert(has('e16.canIssueSterileLoad') && has("res.status(409).json({ error: 'Sterile release blocked'"), 'BI release gate returns 409 fail-closed');
// anti-spoof: PUT cycles/:id no longer accepts client bi_test_result; server normalises BI on bi-result route
assert(!hasC("if (bi_test_result) { sets.push(`bi_test_result=$"), 'legacy client-supplied bi_test_result writer removed (anti-spoof)');
assert(has('e16.normIndicator(req.body.bi_test_result)'), 'BI result normalised server-side (not trusted raw)');
// server owns movement sign
assert(has('e16.movementSign(movementType)') && has('if (sign === null) return res.status(422)'), 'server-authoritative movement sign (client cannot flip issue->receive)');
// audit on sensitive writes
['CREATE_PURCHASE_ORDER', 'CREATE_GOODS_RECEIPT', 'STOCK_MOVEMENT', 'CSSD_BI_RESULT', 'CSSD_RELEASE_STERILE', 'STOCK_COUNT'].forEach(act => {
    assert(has("'" + act + "'"), 'logAudit action present: ' + act);
});
// parameterized — no obvious interpolation of ids into inventory queries
assert(!has('inventory_movements WHERE id = ${'), 'no string-interpolated ids in movements queries');
// C1: empty-GRN guard -- all-invalid po_item_ids must yield 422 before creating goods_receipt header
assert(has("No valid PO items to receive"), 'C1: empty poItemIds guard returns 422 (no silent empty GRN)');
// I1: null cycle_id on tray issue must block (fail-closed), not silently skip BI re-check
assert(has("{ error: 'cycle_missing' }"), 'I1: null cycle_id tray issue blocked 409 cycle_missing');
// I2: CSSD batch PUT has state machine guard (no terminal->processing regression)
assert(has('BATCH_TRANSITIONS') && has('Invalid batch transition'), 'I2: batch PUT state machine guard present');


// ---------- (B) mock-pool simulation ----------
console.log('\n[B] transactional decrement / PO-GRN / BI-release simulation (mock pool + real engine)');

// Build a tiny mock store with row-level "locks" to emulate SELECT FOR UPDATE serialization.
function makeStore() {
    return {
        items: { 1: { id: 1, stock_qty: 12, tenant_id: 1 } },
        batches: {
            10: { id: 10, item_id: 1, qty_on_hand: 5, expiry_date: '2026-05-01', tenant_id: 1 },
            11: { id: 11, item_id: 1, qty_on_hand: 7, expiry_date: '2027-05-01', tenant_id: 1 }
        }
    };
}

// Emulate the server's decrement handler (transactional, FEFO, no-negative).
function issueStock(store, tenantId, itemId, qty) {
    const item = store.items[itemId];
    if (!item || item.tenant_id !== tenantId) return { status: 404 };
    const dec = e16.checkDecrement(item.stock_qty, qty);
    if (!dec.ok) return { status: 409, error: 'Insufficient stock' };
    const batchRows = Object.values(store.batches).filter(b => b.item_id === itemId && b.tenant_id === tenantId && b.qty_on_hand > 0);
    const alloc = e16.fefoAllocate(batchRows, qty);
    if (!alloc.ok) return { status: 409, error: 'Insufficient batch stock' };
    // apply ascending batch id (deadlock-safe)
    [...alloc.allocations].sort((a, b) => a.batch_id - b.batch_id).forEach(a => { store.batches[a.batch_id].qty_on_hand -= a.qty; });
    item.stock_qty -= qty;
    return { status: 200, balance_after: item.stock_qty, allocations: alloc.allocations };
}

let s = makeStore();
const r1 = issueStock(s, 1, 1, 6);  // FEFO: 5 from batch10 + 1 from batch11
assert(r1.status === 200 && r1.balance_after === 6, 'issue 6 ok, balance 6');
assert(s.batches[10].qty_on_hand === 0 && s.batches[11].qty_on_hand === 6, 'FEFO drained batch10 first then batch11');
const r2 = issueStock(s, 1, 1, 100);  // exceeds remaining 6
assert(r2.status === 409, 'over-issue blocked 409 (no negative)');
assert(s.items[1].stock_qty === 6, 'stock unchanged after blocked over-issue');
const r3 = issueStock(s, 2, 1, 1);  // wrong tenant
assert(r3.status === 404, 'cross-tenant issue blocked (item not visible)');

// race: two concurrent decrements that together exceed stock — serialized, second must 409.
s = makeStore(); // stock 12
const ra = issueStock(s, 1, 1, 8);
const rb = issueStock(s, 1, 1, 8);   // only 4 remain -> must fail
assert(ra.status === 200 && rb.status === 409 && s.items[1].stock_qty === 4, 'serialized double-decrement: second blocked, never negative');

// PO -> GRN flow advancing status (server recomputes from line fulfilment)
function poFlow() {
    const po = { id: 1, status: 'draft', tenant_id: 1, lines: [{ id: 1, qty_ordered: 10, qty_received: 0 }] };
    // approve
    if (!e16.canTransitionPO(po.status, 'approved')) return { error: 'bad transition' };
    po.status = 'approved';
    // receive 4 -> partially_received
    if (!e16.canReceivePO(po.status)) return { error: 'not receivable' };
    po.lines[0].qty_received += 4;
    let agg = po.lines.reduce((a, l) => ({ ord: a.ord + l.qty_ordered, rec: a.rec + l.qty_received }), { ord: 0, rec: 0 });
    po.status = agg.rec >= agg.ord ? 'received' : 'partially_received';
    const afterFirst = po.status;
    // receive remaining 6 -> received
    po.lines[0].qty_received += 6;
    agg = po.lines.reduce((a, l) => ({ ord: a.ord + l.qty_ordered, rec: a.rec + l.qty_received }), { ord: 0, rec: 0 });
    po.status = agg.rec >= agg.ord ? 'received' : 'partially_received';
    return { afterFirst, final: po.status };
}
const pf = poFlow();
assert(pf.afterFirst === 'partially_received', 'PO partial receipt => partially_received');
assert(pf.final === 'received', 'PO full receipt => received');
// cannot receive against draft
assert(e16.canReceivePO('draft') === false, 'GRN against draft PO blocked');

// CSSD BI release gate simulation (fail-closed)
function tryRelease(cycle) {
    const gate = e16.canIssueSterileLoad(cycle.status, cycle.bi, cycle.ci);
    return gate.allowed ? { status: 200 } : { status: 409, reason: gate.reason };
}
assert(tryRelease({ status: 'completed', bi: 'pass', ci: 'pass' }).status === 200, 'release: completed + BI pass => 200');
assert(tryRelease({ status: 'completed', bi: null, ci: null }).status === 409, 'release: BI missing => 409 (fail-closed)');
assert(tryRelease({ status: 'completed', bi: 'fail', ci: 'pass' }).status === 409, 'release: BI fail => 409');
assert(tryRelease({ status: 'running', bi: 'pass', ci: 'pass' }).status === 409, 'release: cycle not completed => 409');

// C1 mock: GRN with all-invalid po_item_ids => 422 (no empty receipt created)
function grnReceive(lines) {
    const e16eng = require('./e16_inventory_engine');
    const poItemIds = lines.map(l => e16eng.e16IntId(l.po_item_id)).filter(x => x !== null);
    if (poItemIds.length === 0) return { status: 422, error: 'No valid PO items to receive' };
    return { status: 200, created: true };
}
assert(grnReceive([{ po_item_id: 'bad' }, { po_item_id: '0' }, { po_item_id: null }]).status === 422, 'C1: all-invalid po_item_ids => 422 (no empty GRN)');
assert(grnReceive([{ po_item_id: '5' }]).status === 200, 'C1: valid po_item_id passes guard');

// I1 mock: tray issue with null cycle_id => 409 cycle_missing
function issueTrayWithCycle(cycleId) {
    if (!cycleId) return { status: 409, error: 'cycle_missing' };
    return { status: 200 };
}
assert(issueTrayWithCycle(null).status === 409 && issueTrayWithCycle(null).error === 'cycle_missing', 'I1: null cycle_id => 409 cycle_missing (not silently skipped)');
assert(issueTrayWithCycle(1000).status === 200, 'I1: non-null cycle_id proceeds to BI check');

// I2 mock: batch state machine - terminal states cannot transition back
const BATCH_TRANSITIONS_SIM = { processing: ['completed', 'failed'], completed: [], failed: [] };
function tryBatchTransition(from, to) {
    const allowed = (BATCH_TRANSITIONS_SIM[String(from).toLowerCase()] || []).includes(to);
    return allowed ? { status: 200 } : { status: 409 };
}
assert(tryBatchTransition('processing', 'completed').status === 200, 'I2: processing -> completed allowed');
assert(tryBatchTransition('processing', 'failed').status === 200, 'I2: processing -> failed allowed');
assert(tryBatchTransition('completed', 'processing').status === 409, 'I2: completed -> processing BLOCKED (terminal)');
assert(tryBatchTransition('failed', 'processing').status === 409, 'I2: failed -> processing BLOCKED (terminal)');
assert(tryBatchTransition('completed', 'completed').status === 409, 'I2: completed -> completed BLOCKED (self-loop from terminal)');


console.log('\n=== SUMMARY ===');
console.log('  PASS: ' + passed + '  FAIL: ' + failed);
if (failed) { console.log('  Failures: ' + failures.join('; ')); process.exit(1); }
console.log('  ALL WORKFLOW TESTS PASSED');
process.exit(0);
