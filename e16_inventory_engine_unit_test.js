/**
 * e16_inventory_engine_unit_test.js
 * Pure-engine unit tests for E16 (no DB, no I/O): FEFO allocation, no-negative decrement,
 * low-stock classification, movement-type sign whitelist, PO + cycle state machines, and the
 * fail-CLOSED CSSD biological-indicator (BI) sterile-issue gate.
 *   node e16_inventory_engine_unit_test.js
 */
'use strict';
const e16 = require('./e16_inventory_engine');

let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det) {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; failures.push(name); }
}

console.log('\n=== E16 PURE ENGINE UNIT TESTS ===\n');

// ---- id / qty helpers (integer-id, anti-coercion E6) ----
console.log('[1] id/qty helpers');
assert(e16.e16IntId('5') === 5, 'e16IntId accepts clean numeric string');
assert(e16.e16IntId(' 5') === null, 'e16IntId rejects space-padded id (E6 bypass)');
assert(e16.e16IntId('5x') === null, 'e16IntId rejects 5x');
assert(e16.e16IntId(5.5) === null, 'e16IntId rejects float');
assert(e16.e16IntId(0) === null && e16.e16IntId(-3) === null, 'e16IntId rejects <=0');
assert(e16.e16Qty('') === null && e16.e16Qty(null) === null, 'e16Qty rejects empty/null');
assert(e16.e16Qty('10') === 10, 'e16Qty accepts numeric string');

// ---- FEFO allocation ----
console.log('\n[2] FEFO allocation (earliest expiry first)');
const batches = [
    { id: 1, qty_on_hand: 10, expiry_date: '2027-01-01' },
    { id: 2, qty_on_hand: 5, expiry_date: '2026-06-01' },   // earliest
    { id: 3, qty_on_hand: 8, expiry_date: null }             // null expiry consumed last
];
const a1 = e16.fefoAllocate(batches, 7);
assert(a1.ok === true, 'FEFO ok for sufficient stock');
assert(a1.allocations[0].batch_id === 2 && a1.allocations[0].qty === 5, 'FEFO takes earliest-expiry batch first (batch 2 fully)');
assert(a1.allocations[1].batch_id === 1 && a1.allocations[1].qty === 2, 'FEFO then next-earliest (batch 1 partial)');
const a2 = e16.fefoAllocate(batches, 100);
assert(a2.ok === false && a2.shortBy === 77, 'FEFO blocks when insufficient (shortBy reported)');
const a3 = e16.fefoAllocate(batches, 0);
assert(a3.ok === false && a3.error === 'invalid_quantity', 'FEFO rejects zero qty');
// null-expiry batch must be consumed only after dated ones
const a4 = e16.fefoAllocate(batches, 16);  // 5 + 10 then 1 from null
assert(a4.ok && a4.allocations[2].batch_id === 3 && a4.allocations[2].qty === 1, 'FEFO consumes null-expiry batch last');

// ---- no-negative decrement ----
console.log('\n[3] no-negative stock decrement');
assert(e16.checkDecrement(10, 4).ok && e16.checkDecrement(10, 4).after === 6, 'decrement within stock ok');
assert(e16.checkDecrement(10, 10).ok && e16.checkDecrement(10, 10).after === 0, 'decrement to exactly zero ok');
const d = e16.checkDecrement(3, 5);
assert(d.ok === false && d.error === 'insufficient_stock' && d.shortBy === 2, 'decrement below zero BLOCKED (no negative)');
assert(e16.checkDecrement(5, 0).ok === false, 'zero decrement rejected');
assert(e16.checkDecrement(null, 1).ok === false, 'null current rejected (incomplete -> block)');

// ---- low-stock classification ----
console.log('\n[4] low-stock / reorder classification');
assert(e16.stockStatus(0, 10) === 'out', 'zero stock => out');
assert(e16.stockStatus(5, 10) === 'low', '<= reorder => low');
assert(e16.stockStatus(50, 10) === 'ok', '> reorder => ok');
assert(e16.stockStatus(null, 10) === 'unknown', 'unknown qty => unknown (never falsely ok)');
assert(e16.stockStatus(5, null) === 'unknown', 'unknown reorder => unknown');
assert(e16.isLowStock(0, 10) === true && e16.isLowStock(50, 10) === false, 'isLowStock helper');

// ---- movement-type sign whitelist (anti-spoof: server owns the sign) ----
console.log('\n[5] movement-type sign whitelist');
assert(e16.movementSign('receive') === 1, 'receive => +1');
assert(e16.movementSign('issue') === -1, 'issue => -1');
assert(e16.movementSign('adjust_out') === -1 && e16.movementSign('adjust_in') === 1, 'adjust signs');
assert(e16.movementSign('hack') === null && e16.isValidMovementType('hack') === false, 'unknown type rejected');

// ---- PO state machine ----
console.log('\n[6] PO state machine');
assert(e16.canTransitionPO('draft', 'approved') === true, 'draft -> approved');
assert(e16.canTransitionPO('draft', 'received') === false, 'draft -> received blocked');
assert(e16.canTransitionPO('approved', 'partially_received') === true, 'approved -> partially_received');
assert(e16.canTransitionPO('received', 'approved') === false, 'received is terminal');
assert(e16.canTransitionPO('cancelled', 'approved') === false, 'cancelled is terminal');
assert(e16.canReceivePO('approved') === true && e16.canReceivePO('partially_received') === true, 'GRN allowed from approved/partial');
assert(e16.canReceivePO('draft') === false && e16.canReceivePO('received') === false, 'GRN blocked from draft/received');

// ---- cycle state machine ----
console.log('\n[7] sterilization cycle state machine');
assert(e16.canTransitionCycle('running', 'completed') === true, 'running -> completed');
assert(e16.canTransitionCycle('running', 'failed') === true, 'running -> failed');
assert(e16.canTransitionCycle('completed', 'running') === false, 'completed terminal');

// ---- BI indicator normalisation + fail-CLOSED gate ----
console.log('\n[8] CSSD BI gate (fail-CLOSED)');
assert(e16.normIndicator('Pass') === 'pass' && e16.normIndicator('negative') === 'pass', 'normalise pass synonyms');
assert(e16.normIndicator('FAIL') === 'fail' && e16.normIndicator('positive') === 'fail', 'normalise fail synonyms');
assert(e16.normIndicator('') === null && e16.normIndicator(null) === null, 'blank/null => null (not pass)');
assert(e16.normIndicator('garbage') === 'fail', 'unknown token => fail (fail-closed)');
assert(e16.canMarkSterile('pass', 'pass').allowed === true, 'BI pass + CI pass => allowed');
assert(e16.canMarkSterile('pass', null).allowed === true, 'BI pass, CI absent => allowed (CI advisory)');
assert(e16.canMarkSterile(null, 'pass').allowed === false && e16.canMarkSterile(null).reason === 'bi_missing', 'BI missing => BLOCKED');
assert(e16.canMarkSterile('pending').allowed === false, 'BI pending => BLOCKED');
assert(e16.canMarkSterile('fail').allowed === false, 'BI fail => BLOCKED');
assert(e16.canMarkSterile('pass', 'fail').allowed === false, 'BI pass but CI fail => BLOCKED');
// the full sterile-issue gate also requires the cycle to be completed
assert(e16.canIssueSterileLoad('completed', 'pass', 'pass').allowed === true, 'completed + BI pass => issuable');
assert(e16.canIssueSterileLoad('running', 'pass', 'pass').allowed === false, 'not completed => blocked');
assert(e16.canIssueSterileLoad('completed', 'fail', 'pass').allowed === false, 'completed but BI fail => blocked');

console.log('\n=== SUMMARY ===');
console.log('  PASS: ' + passed + '  FAIL: ' + failed);
if (failed) { console.log('  Failures: ' + failures.join('; ')); process.exit(1); }
console.log('  ALL ENGINE TESTS PASSED');
process.exit(0);
