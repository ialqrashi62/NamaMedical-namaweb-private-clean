/**
 * billing_integrity_test.js
 * ==========================================
 * PHASE 1 C-2/C-3 — server-side billing integrity (billing_integrity.js). DB-free, deterministic.
 *
 *   node billing_integrity_test.js
 *
 * Proves the CRITICAL invariants:
 *   - a client CANNOT pass a fake/NaN/negative/Infinity total or amount (parseMoney fails closed)
 *   - a client CANNOT take a discount above their role's % cap (enforceDiscountCap -> 403)
 *   - the server calculation is stable (rounding deterministic; within-cap discounts allowed)
 */
const bi = require('./billing_integrity');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
// assert that fn() throws with a given statusCode
function throwsWith(fn, statusCode, name) {
    try { fn(); assert(false, name, 'did not throw'); }
    catch (e) { assert(e && e.statusCode === statusCode, name, `expected ${statusCode}, got ${e && e.statusCode}: ${e && e.message}`); }
}

console.log(`\n${BOLD}${BLUE}=== Billing Integrity Unit Tests (C-2/C-3) ===${RESET}\n`);

// ===== 1. parseMoney rejects unsafe client values (C-2) =====
console.log(`${BOLD}[1] parseMoney fails closed on unsafe input${RESET}`);
throwsWith(() => bi.parseMoney('abc', { field: 'total' }), 400, 'non-numeric string rejected');
throwsWith(() => bi.parseMoney(NaN, { field: 'total' }), 400, 'NaN rejected');
throwsWith(() => bi.parseMoney(Infinity, { field: 'total' }), 400, 'Infinity rejected');
throwsWith(() => bi.parseMoney(-5, { field: 'total' }), 400, 'negative rejected');
throwsWith(() => bi.parseMoney('', { field: 'total' }), 400, 'empty string rejected');
throwsWith(() => bi.parseMoney(null, { field: 'total' }), 400, 'null rejected');
throwsWith(() => bi.parseMoney(undefined, { field: 'total' }), 400, 'undefined rejected');
throwsWith(() => bi.parseMoney(1e12, { field: 'total' }), 400, 'absurdly large value rejected');
throwsWith(() => bi.parseMoney(0, { field: 'amount', allowZero: false }), 400, 'zero rejected when allowZero=false');

// ===== 2. parseMoney is stable for valid input (server calculation stable) =====
console.log(`${BOLD}[2] parseMoney stable rounding${RESET}`);
assert(bi.parseMoney('100.00') === 100, 'string "100.00" -> 100');
assert(bi.parseMoney(100.005) === 100.01, '100.005 -> 100.01 (2dp round)');
assert(bi.parseMoney(0) === 0, '0 allowed by default');
assert(bi.parseMoney('19.99') === 19.99, 'string "19.99" -> 19.99');
assert(bi.parseMoney(50.1 + 0.2) === 50.3, 'float drift normalized to 50.30');

// ===== 3. enforceDiscountCap blocks over-cap discounts (C-3) =====
console.log(`${BOLD}[3] discount cap enforced per role${RESET}`);
// cashier cap = 10%
throwsWith(() => bi.enforceDiscountCap('cashier', 20, 100), 403, 'cashier 20% > 10% cap rejected');
throwsWith(() => bi.enforceDiscountCap('doctor', 25, 100), 403, 'doctor 25% > 20% cap rejected');
throwsWith(() => bi.enforceDiscountCap('manager', 60, 100), 403, 'manager 60% > 50% cap rejected');
// unknown role => 0% cap (fail closed)
throwsWith(() => bi.enforceDiscountCap('unknownrole', 1, 100), 403, 'unknown role any discount rejected (0% cap)');
throwsWith(() => bi.enforceDiscountCap(undefined, 1, 100), 403, 'missing role any discount rejected');
// discount cannot exceed amount / invalid gross
throwsWith(() => bi.enforceDiscountCap('admin', 150, 100), 400, 'discount > gross rejected (400)');
throwsWith(() => bi.enforceDiscountCap('cashier', 5, 0), 400, 'discount on zero gross rejected (400)');

// ===== 4. enforceDiscountCap allows within-cap discounts =====
console.log(`${BOLD}[4] within-cap discounts allowed${RESET}`);
function noThrow(fn, name) { try { fn(); assert(true, name); } catch (e) { assert(false, name, e.message); } }
noThrow(() => bi.enforceDiscountCap('cashier', 10, 100), 'cashier exactly 10% allowed');
noThrow(() => bi.enforceDiscountCap('manager', 49.99, 100), 'manager 49.99% allowed');
noThrow(() => bi.enforceDiscountCap('admin', 100, 100), 'admin 100% allowed');
noThrow(() => bi.enforceDiscountCap('cashier', 0, 100), 'zero discount is a no-op');
noThrow(() => bi.enforceDiscountCap('doctor', 20, 100), 'doctor exactly 20% allowed');

// ===== 5. PHASE 2 (H-1/H-2): payment/refund amount guards =====
console.log(`${BOLD}[5] parsePositiveMoneyToMinorUnits fails closed${RESET}`);
throwsWith(() => bi.parsePositiveMoneyToMinorUnits('abc', { field: 'amount_paid' }), 400, 'non-numeric rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(NaN, { field: 'amount_paid' }), 400, 'NaN rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(Infinity, { field: 'amount_paid' }), 400, 'Infinity rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(-10, { field: 'amount_paid' }), 400, 'negative rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(0, { field: 'amount_paid' }), 400, 'zero rejected (positive required)');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits('', { field: 'amount_paid' }), 400, 'empty string rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(null, { field: 'amount_paid' }), 400, 'null rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(undefined, { field: 'amount_paid' }), 400, 'undefined rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(10.005, { field: 'amount_paid' }), 400, 'sub-halala precision rejected');
throwsWith(() => bi.parsePositiveMoneyToMinorUnits(2e9, { field: 'amount_paid' }), 400, 'absurd amount rejected');

console.log(`${BOLD}[6] parsePositiveMoneyToMinorUnits accepts valid amounts (as halalas)${RESET}`);
assert(bi.parsePositiveMoneyToMinorUnits('100.00') === 10000, '"100.00" -> 10000 halalas');
assert(bi.parsePositiveMoneyToMinorUnits(19.99) === 1999, '19.99 -> 1999 halalas');
assert(bi.parsePositiveMoneyToMinorUnits(0.01) === 1, '0.01 -> 1 halala');
assert(bi.toMinorUnits(50.1 + 0.2) === 5030, 'toMinorUnits normalizes float drift -> 5030');

console.log(`${BOLD}[7] assertAmountWithinCap (outstanding / refundable)${RESET}`);
// payment: outstanding cap
throwsWith(() => bi.assertAmountWithinCap(15000, 10000, 'payment'), 400, 'payment > outstanding rejected');
throwsWith(() => bi.assertAmountWithinCap(1, 0, 'payment'), 400, 'payment when nothing outstanding rejected');
throwsWith(() => bi.assertAmountWithinCap(1, -500, 'payment'), 400, 'payment on negative outstanding rejected');
noThrow(() => bi.assertAmountWithinCap(10000, 10000, 'payment'), 'payment == outstanding allowed');
noThrow(() => bi.assertAmountWithinCap(4000, 10000, 'payment'), 'partial payment < outstanding allowed');
// refund: refundable cap (refundable = paid - already_refunded)
throwsWith(() => bi.assertAmountWithinCap(8000, 5000, 'refund'), 400, 'refund > refundable rejected');
throwsWith(() => bi.assertAmountWithinCap(1, 0, 'refund'), 400, 'refund when already fully refunded rejected');
noThrow(() => bi.assertAmountWithinCap(5000, 5000, 'refund'), 'refund == refundable allowed');
noThrow(() => bi.assertAmountWithinCap(2000, 5000, 'refund'), 'partial refund < refundable allowed');

// ===== summary =====
console.log(`\n${BOLD}Result: ${passed} passed, ${failed} failed${RESET}`);
if (failed > 0) { console.log(`${RED}Failures:${RESET}`); failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
process.exit(0);
