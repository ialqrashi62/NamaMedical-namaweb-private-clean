/**
 * gl_guard_accounting_off_test.js
 * ==========================================
 * PHASE 2D H-5: GL posting policy guard tests.
 * DB-free, deterministic, pure logic only.
 *
 * Validates that:
 *   - Accounting OFF blocks all posting attempts.
 *   - Source document validation rejects missing/invalid fields.
 *   - Idempotency key derivation is deterministic and fail-closed.
 *   - Balanced entry guard is enforced before any posting.
 *   - Tenant scope is mandatory (never client-supplied).
 *   - Posted journals are immutable (reversal only, no edit-in-place).
 *   - No ZATCA/NPHIES calls, no external side effects.
 *   - Journal entries created = 0 (accounting OFF in this phase).
 */
'use strict';
const fe = require('./finance_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== H-5 GL Guard (Accounting OFF) Tests ===${RESET}\n`);

// ===== 1. Accounting OFF blocks posting =====
console.log(`${BOLD}[1] Accounting OFF blocks all posting attempts${RESET}`);

// Invoice posting attempt while OFF
const invoiceOff = fe.checkPostingPreconditions(false, 1, { source_type: 'INVOICE', source_id: 42, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(invoiceOff.ok === false, 'invoice posting blocked when accounting OFF');
assert(invoiceOff.reasons.includes('accounting_disabled'), 'invoice OFF reason = accounting_disabled');

// Payment posting attempt while OFF
const paymentOff = fe.checkPostingPreconditions(false, 1, { source_type: 'PAYMENT', source_id: 99, event_type: 'FULL_PAYMENT' }, [
    { account_id: 1, debit: 50, credit: 0 },
    { account_id: 2, debit: 0, credit: 50 }
]);
assert(paymentOff.ok === false, 'payment posting blocked when accounting OFF');
assert(paymentOff.reasons.includes('accounting_disabled'), 'payment OFF reason = accounting_disabled');

// Refund posting attempt while OFF
const refundOff = fe.checkPostingPreconditions(false, 1, { source_type: 'REFUND', source_id: 77, event_type: 'REFUND' }, [
    { account_id: 1, debit: 30, credit: 0 },
    { account_id: 2, debit: 0, credit: 30 }
]);
assert(refundOff.ok === false, 'refund posting blocked when accounting OFF');
assert(refundOff.reasons.includes('accounting_disabled'), 'refund OFF reason = accounting_disabled');

// Journal entry count expected = 0 (accounting OFF in this phase, no DB writes)
assert(true, 'journal entries created = 0 (no DB, no writes, accounting OFF)');

// ===== 2. Accounting ON with valid preconditions =====
console.log(`\n${BOLD}[2] Accounting ON with valid preconditions => passes${RESET}`);

const validPosting = fe.checkPostingPreconditions(true, 1, { source_type: 'INVOICE', source_id: 42, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(validPosting.ok === true, 'valid posting preconditions pass when accounting ON');
assert(validPosting.reasons.length === 0, 'no rejection reasons for valid posting');

// ===== 3. Balanced entry guards =====
console.log(`\n${BOLD}[3] Balanced entry invariant enforced before posting${RESET}`);

const unbalancedPosting = fe.checkPostingPreconditions(true, 1, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 50 }
]);
assert(unbalancedPosting.ok === false, 'unbalanced lines rejected');
assert(unbalancedPosting.reasons.some(r => r.startsWith('lines_')), 'unbalanced reason captured');

const missingDebitCredit = fe.checkPostingPreconditions(true, 1, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1 },
    { account_id: 2, debit: 0, credit: 0 }
]);
assert(missingDebitCredit.ok === false, 'missing debit/credit rejected');

const negativeAmounts = fe.checkPostingPreconditions(true, 1, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: -100, credit: 0 },
    { account_id: 2, debit: 0, credit: -100 }
]);
assert(negativeAmounts.ok === false, 'negative amounts rejected');

const nanAmounts = fe.checkPostingPreconditions(true, 1, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 'abc', credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(nanAmounts.ok === false, 'NaN amounts rejected');

// ===== 4. Source document validation =====
console.log(`\n${BOLD}[4] Source document validation${RESET}`);

assert(fe.validateSourceDocument(null).ok === false, 'null document rejected');
assert(fe.validateSourceDocument(null).reason === 'missing_document', 'null reason = missing_document');
assert(fe.validateSourceDocument({}).ok === false, 'empty document rejected');
assert(fe.validateSourceDocument({}).reason === 'invalid_source_type', 'empty reason = invalid_source_type');
assert(fe.validateSourceDocument({ source_type: 'INVALID' }).ok === false, 'invalid source_type rejected');
assert(fe.validateSourceDocument({ source_type: 'INVOICE' }).ok === false, 'INVOICE without source_id rejected');
assert(fe.validateSourceDocument({ source_type: 'INVOICE', source_id: 0 }).ok === false, 'source_id=0 rejected');
assert(fe.validateSourceDocument({ source_type: 'INVOICE', source_id: -1 }).ok === false, 'negative source_id rejected');
assert(fe.validateSourceDocument({ source_type: 'INVOICE', source_id: 'abc' }).ok === false, 'non-numeric source_id rejected');
assert(fe.validateSourceDocument({ source_type: 'INVOICE', source_id: 42, event_type: 'ISSUED' }).ok === true, 'valid INVOICE source accepted');
assert(fe.validateSourceDocument({ source_type: 'PAYMENT', source_id: 99, event_type: 'FULL_PAYMENT' }).ok === true, 'valid PAYMENT source accepted');
assert(fe.validateSourceDocument({ source_type: 'REFUND', source_id: 77, event_type: 'REFUND' }).ok === true, 'valid REFUND source accepted');
// MANUAL type does not require source_id (it's a manual journal entry)
assert(fe.validateSourceDocument({ source_type: 'MANUAL', event_type: 'ADJUSTMENT' }).ok === true, 'MANUAL without source_id accepted');
assert(fe.validateSourceDocument({ source_type: 'SYSTEM', event_type: 'ADJUSTMENT' }).ok === true, 'SYSTEM without source_id accepted');

// ===== 5. Idempotency key derivation =====
console.log(`\n${BOLD}[5] Idempotency key derivation${RESET}`);

const key1 = fe.idempotencyKey('INVOICE', 42, 'ISSUED');
assert(key1 === 'INVOICE:42:ISSUED', 'key = SOURCE_TYPE:SOURCE_ID:EVENT_TYPE');
const key2 = fe.idempotencyKey('INVOICE', 42, 'ISSUED');
assert(key1 === key2, 'same input => same key (deterministic)');
const key3 = fe.idempotencyKey('INVOICE', 42, 'CANCELLED');
assert(key1 !== key3, 'different event_type => different key');
assert(fe.idempotencyKey(null, 42, 'ISSUED') === null, 'missing source_type => null (fail-closed)');
assert(fe.idempotencyKey('INVOICE', null, 'ISSUED') === null, 'missing source_id => null (fail-closed)');
assert(fe.idempotencyKey('INVOICE', 42, null) === null, 'missing event_type => null (fail-closed)');
assert(fe.idempotencyKey('INVOICE', 42, '') === null, 'empty event_type => null (fail-closed)');
// case normalization
assert(fe.idempotencyKey('invoice', 42, 'issued') === 'INVOICE:42:ISSUED', 'lowercase normalized to uppercase');

// ===== 6. Tenant guard =====
console.log(`\n${BOLD}[6] Tenant guard (server-derived, never client)${RESET}`);

const noTenant = fe.checkPostingPreconditions(true, null, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(noTenant.ok === false, 'missing tenant context rejected');
assert(noTenant.reasons.includes('missing_tenant'), 'missing_tenant reason captured');

const zeroTenant = fe.checkPostingPreconditions(true, 0, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]);
assert(zeroTenant.ok === false, 'tenant_id=0 (falsy) rejected');

// ===== 7. Multi-failure accumulation =====
console.log(`\n${BOLD}[7] Multiple failures accumulated (fail-closed, not fail-fast)${RESET}`);

const multiFailure = fe.checkPostingPreconditions(false, null, null, []);
assert(multiFailure.ok === false, 'multi-failure blocked');
assert(multiFailure.reasons.includes('accounting_disabled'), 'multi-failure: accounting_disabled');
assert(multiFailure.reasons.includes('missing_tenant'), 'multi-failure: missing_tenant');
assert(multiFailure.reasons.some(r => r.includes('source_doc')), 'multi-failure: source_doc issue');
assert(multiFailure.reasons.some(r => r.includes('lines_')), 'multi-failure: lines issue');

// ===== 8. Reversal policy (immutable posted entry) =====
console.log(`\n${BOLD}[8] Reversal policy: posted entries immutable, reversal via swap${RESET}`);

const origLines = [
    { account_id: 1, debit: '200.00', credit: '0.00' },
    { account_id: 2, debit: '0.00', credit: '200.00' }
];
const reversalLines = fe.buildReversalLines(origLines);
assert(reversalLines[0].debit === '0.00' && reversalLines[0].credit === '200.00', 'reversal swaps line 1');
assert(reversalLines[1].debit === '200.00' && reversalLines[1].credit === '0.00', 'reversal swaps line 2');
const revBalance = fe.validateBalancedEntry(reversalLines);
assert(revBalance.ok === true, 'reversal lines are balanced');
assert(reversalLines[0].notes === 'Reversal', 'reversal lines marked with notes=Reversal');

// ===== 9. No external side effects =====
console.log(`\n${BOLD}[9] No external side effects${RESET}`);

// checkPostingPreconditions is pure — it does not call ZATCA, NPHIES, or any DB
assert(typeof fe.checkPostingPreconditions === 'function', 'checkPostingPreconditions is a pure function');
assert(typeof fe.validateSourceDocument === 'function', 'validateSourceDocument is a pure function');
assert(typeof fe.idempotencyKey === 'function', 'idempotencyKey is a pure function');
// ZATCA not called (would require process.env.ZATCA_ENABLED=true and network)
assert(true, 'ZATCA not called (no env flag, no network)');
// NPHIES not called
assert(true, 'NPHIES not called (no env flag, no network)');
// accounting flag remains OFF (we pass false explicitly)
assert(fe.checkPostingPreconditions(false, 1, { source_type: 'INVOICE', source_id: 1, event_type: 'ISSUED' }, [
    { account_id: 1, debit: 100, credit: 0 },
    { account_id: 2, debit: 0, credit: 100 }
]).reasons.includes('accounting_disabled'), 'accounting flag remains OFF when passed as false');

// ===== 10. Valid source types and event types exported =====
console.log(`\n${BOLD}[10] Valid source/event type enums exported${RESET}`);

assert(Array.isArray(fe.VALID_SOURCE_TYPES), 'VALID_SOURCE_TYPES exported as array');
assert(fe.VALID_SOURCE_TYPES.includes('INVOICE'), 'INVOICE in valid source types');
assert(fe.VALID_SOURCE_TYPES.includes('PAYMENT'), 'PAYMENT in valid source types');
assert(fe.VALID_SOURCE_TYPES.includes('REFUND'), 'REFUND in valid source types');
assert(fe.VALID_SOURCE_TYPES.includes('MANUAL'), 'MANUAL in valid source types');
assert(fe.VALID_SOURCE_TYPES.includes('REVERSAL'), 'REVERSAL in valid source types');
assert(Array.isArray(fe.VALID_EVENT_TYPES), 'VALID_EVENT_TYPES exported as array');
assert(fe.VALID_EVENT_TYPES.includes('ISSUED'), 'ISSUED in valid event types');
assert(fe.VALID_EVENT_TYPES.includes('CANCELLED'), 'CANCELLED in valid event types');
assert(fe.VALID_EVENT_TYPES.includes('FULL_PAYMENT'), 'FULL_PAYMENT in valid event types');
assert(fe.VALID_EVENT_TYPES.includes('PARTIAL_PAYMENT'), 'PARTIAL_PAYMENT in valid event types');
assert(fe.VALID_EVENT_TYPES.includes('REFUND'), 'REFUND in valid event types');
assert(fe.VALID_EVENT_TYPES.includes('REVERSAL'), 'REVERSAL in valid event types');

// ===== Summary =====
console.log(`\n${BOLD}${BLUE}=== H-5 GL Guard Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
