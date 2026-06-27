/**
 * e10_finance_engine_test.js
 * ==========================================
 * E10 Finance — PURE engine unit tests (finance_engine.js). DB-free, deterministic.
 *
 *   NODE_PATH=.../namaweb/node_modules node e10_finance_engine_test.js
 *
 * Covers the CRITICAL invariants that live in the engine:
 *   - balanced-entry: sum(debit)==sum(credit) per entry; unbalanced/negative/both-sided/zero rejected
 *   - money math in integer halalas (no binary float drift; 0.1+0.2 style)
 *   - VAT 15% server-side (exclusive & inclusive)
 *   - AR aging bucket boundaries (30/60/90)
 *   - ZATCA TLV QR encoding (tag/len/value, deterministic base64) + UBL hash determinism + reversal
 */
const fe = require('./finance_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
console.log(`\n${BOLD}${BLUE}=== E10 Finance Engine Unit Tests ===${RESET}\n`);

// ===== 1. money / halalas =====
console.log(`${BOLD}[1] money math (integer halalas)${RESET}`);
assert(fe.toHalalas('100.00') === 10000, '100.00 -> 10000 halalas');
assert(fe.toHalalas(0.1) + fe.toHalalas(0.2) === fe.toHalalas(0.3), '0.1+0.2 == 0.3 in halalas (no float drift)');
assert(fe.money2(1234.5) === '1234.50', 'money2 formats to 2dp');
assert(fe.money2('abc') === null, 'non-numeric money -> null');

// ===== 2. balanced-entry validation =====
console.log(`\n${BOLD}[2] balanced double-entry validation${RESET}`);
const balanced = fe.validateBalancedEntry([
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(balanced.ok === true && balanced.debit === '100.00' && balanced.credit === '100.00', 'balanced 100/100 entry accepted');

const unbalanced = fe.validateBalancedEntry([
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 50 }
]);
assert(unbalanced.ok === false && unbalanced.reason === 'unbalanced', 'unbalanced 100/50 rejected (reason=unbalanced)');
assert(unbalanced.debit === '100.00' && unbalanced.credit === '50.00', 'unbalanced reports both totals');

assert(fe.validateBalancedEntry([{ account_id: 1, debit: 100, credit: 0 }]).reason === 'min_two_lines', 'single line rejected (needs >=2)');
assert(fe.validateBalancedEntry([{ account_id: 1, debit: -5, credit: 0 }, { account_id: 2, debit: 0, credit: -5 }]).reason === 'negative_amount', 'negative amount rejected');
assert(fe.validateBalancedEntry([{ account_id: 1, debit: 10, credit: 10 }, { account_id: 2, debit: 0, credit: 10 }]).reason === 'both_sides_nonzero', 'line with both debit+credit rejected');
assert(fe.validateBalancedEntry([{ account_id: 1, debit: 0, credit: 0 }, { account_id: 2, debit: 0, credit: 0 }]).reason === 'zero_line', 'all-zero line rejected');
assert(fe.validateBalancedEntry([{ account_id: 0, debit: 1, credit: 0 }, { account_id: 2, debit: 0, credit: 1 }]).reason === 'bad_account_id', 'account_id 0 rejected');
assert(fe.validateBalancedEntry([{ account_id: '2x', debit: 1, credit: 0 }, { account_id: 2, debit: 0, credit: 1 }]).reason === 'bad_account_id', 'non-integer account_id rejected (no string coercion)');
// multi-line balanced (float-prone amounts)
const multi = fe.validateBalancedEntry([
    { account_id: 1, debit: 33.33, credit: 0 },
    { account_id: 2, debit: 33.33, credit: 0 },
    { account_id: 3, debit: 33.34, credit: 0 },
    { account_id: 4, debit: 0, credit: 100.00 }
]);
assert(multi.ok === true && multi.debit === '100.00', 'multi-line 33.33+33.33+33.34 == 100.00 balanced');

// ===== 3. reversal =====
console.log(`\n${BOLD}[3] reversal builder (swaps debit<->credit)${RESET}`);
const rev = fe.buildReversalLines([{ account_id: 1, debit: '100.00', credit: '0.00' }, { account_id: 2, debit: '0.00', credit: '100.00' }]);
assert(rev[0].credit === '100.00' && rev[0].debit === '0.00', 'reversal swaps line 1 debit->credit');
assert(fe.validateBalancedEntry(rev).ok === true, 'reversal is itself balanced');

// ===== 4. VAT 15% =====
console.log(`\n${BOLD}[4] VAT 15% server-side${RESET}`);
const ve = fe.vatFromExclusive(100);
assert(ve.vat_amount === '15.00' && ve.total_incl === '115.00', 'exclusive 100 -> vat 15.00, total 115.00');
const vi = fe.vatFromInclusive(115);
assert(vi.base_excl === '100.00' && vi.vat_amount === '15.00', 'inclusive 115 -> base 100.00, vat 15.00');
assert(fe.vatFromInclusive(-5) === null, 'negative total -> null');

// ===== 5. AR aging buckets =====
console.log(`\n${BOLD}[5] AR aging bucket boundaries${RESET}`);
assert(fe.bucketLabel(0) === '0-30' && fe.bucketLabel(30) === '0-30', 'day 0 and 30 -> 0-30');
assert(fe.bucketLabel(31) === '31-60' && fe.bucketLabel(60) === '31-60', 'day 31 and 60 -> 31-60');
assert(fe.bucketLabel(61) === '61-90' && fe.bucketLabel(90) === '61-90', 'day 61 and 90 -> 61-90');
assert(fe.bucketLabel(91) === '90+', 'day 91 -> 90+');
const aging = fe.ageInvoices([
    { id: 1, balance: 100, age_days: 10 },
    { id: 2, balance: 200, age_days: 45 },
    { id: 3, balance: 300, age_days: 75 },
    { id: 4, balance: 400, age_days: 200 },
    { id: 5, balance: 0, age_days: 5 },     // zero balance excluded
    { id: 6, balance: -50, age_days: 5 }    // credit balance excluded
]);
assert(aging['0-30'] === '100.00' && aging['31-60'] === '200.00' && aging['61-90'] === '300.00' && aging['90+'] === '400.00', 'aging buckets summed correctly');
assert(aging.total === '1000.00', 'aging total excludes zero/credit balances (1000.00)');

// ===== 6. ZATCA TLV QR + UBL =====
console.log(`\n${BOLD}[6] ZATCA TLV QR + UBL determinism${RESET}`);
const qr = fe.buildZatcaQR({ sellerName: 'Nama', sellerVat: '300000000000003', timestamp: '2026-06-26T10:00:00Z', total: '115.00', vat: '15.00' });
const qrBuf = Buffer.from(qr, 'base64');
assert(qrBuf[0] === 1 && qrBuf[1] === 4 && qrBuf.slice(2, 6).toString() === 'Nama', 'TLV tag1 (seller) length+value correct');
assert(qr === fe.buildZatcaQR({ sellerName: 'Nama', sellerVat: '300000000000003', timestamp: '2026-06-26T10:00:00Z', total: '115.00', vat: '15.00' }), 'QR is deterministic (same input -> same base64)');
const ubl1 = fe.buildUBLInvoice({ invoiceNumber: 'INV-1', issueDate: '2026-06-26', issueTime: '10:00:00', sellerName: 'Nama', sellerVat: 'X', buyerName: 'B', baseExcl: '100.00', vat: '15.00', total: '115.00' });
const ubl2 = fe.buildUBLInvoice({ invoiceNumber: 'INV-1', issueDate: '2026-06-26', issueTime: '10:00:00', sellerName: 'Nama', sellerVat: 'X', buyerName: 'B', baseExcl: '100.00', vat: '15.00', total: '115.00' });
assert(ubl1 === ubl2 && fe.ublHash(ubl1) === fe.ublHash(ubl2), 'UBL XML + hash deterministic');
assert(ubl1.includes('<cbc:ID>INV-1</cbc:ID>') && ubl1.includes('15.00'), 'UBL contains invoice id + VAT');
assert(ubl1.includes('UNSIGNED-NO-CSID'), 'UBL stamp is a placeholder (no real CSID stamp forged)');
// XSS/XML-injection guard in UBL
const ublInj = fe.buildUBLInvoice({ invoiceNumber: '<x>&"', issueDate: '2026-06-26', sellerName: 'S', sellerVat: '', buyerName: '', baseExcl: '0.00', vat: '0.00', total: '0.00' });
assert(ublInj.includes('&lt;x&gt;&amp;&quot;') && !ublInj.includes('<x>&"'), 'UBL escapes XML special chars (no injection)');

console.log(`\n${BOLD}${BLUE}=== E10 Engine Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
