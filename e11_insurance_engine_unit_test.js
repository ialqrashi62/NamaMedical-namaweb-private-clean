/**
 * e11_insurance_engine_unit_test.js
 * ==========================================
 * E11 Insurance / NPHIES — pure-engine unit test for the co-pay / patient-share calculator
 * (computePatientShare) and the round2 helper. DB-free, no req/res.
 *
 * Conventions: fail-Incomplete (NEVER a falsely-reassuring 0) on invalid/missing input (E6 Braden lesson);
 *   deterministic 2dp halaala rounding; covered base capped at max_limit with the overage patient-borne;
 *   co-pay clamped by co_pay_max; payer share never negative.
 *
 *   NODE_PATH=.../namaweb/node_modules node e11_insurance_engine_unit_test.js
 */
const eng = require('./e11_insurance_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
const cps = eng.computePatientShare;
console.log(`\n${BOLD}${BLUE}=== E11 Insurance Engine — co-pay / patient-share unit tests ===${RESET}\n`);

// ===== 1. round2 — deterministic 2dp halaala rounding =====
console.log(`${BOLD}[1] round2${RESET}`);
assert(eng.round2(10.005) === 10.01, 'round2 rounds half up (10.005 -> 10.01)');
assert(eng.round2(2.675) === 2.68, 'round2 handles float artefact (2.675 -> 2.68)');
assert(eng.round2(100) === 100, 'round2 integer unchanged');
assert(eng.round2(0.1 + 0.2) === 0.3, 'round2 kills 0.1+0.2 float dust');

// ===== 2. fail-CLOSED on bad input — Incomplete, never a reassuring 0 =====
console.log(`\n${BOLD}[2] fail-Incomplete on invalid/missing input${RESET}`);
assert(cps(100, null).status === 'Incomplete', 'missing policy => Incomplete (not 0)');
assert(cps(100, undefined).status === 'Incomplete', 'undefined policy => Incomplete');
assert(cps('abc', { co_pay_percent: 20 }).status === 'Incomplete', 'non-numeric gross => Incomplete');
assert(cps(-50, { co_pay_percent: 20 }).status === 'Incomplete', 'negative gross => Incomplete');
assert(cps(NaN, { co_pay_percent: 20 }).status === 'Incomplete', 'NaN gross => Incomplete');
assert(cps(100, { co_pay_percent: -5 }).status === 'Incomplete', 'negative co_pay_percent => Incomplete');
assert(cps(100, { co_pay_percent: 150 }).status === 'Incomplete', 'co_pay_percent > 100 => Incomplete');
assert(cps(100, { co_pay_percent: 'x' }).status === 'Incomplete', 'non-numeric co_pay_percent => Incomplete');
// crucially: an Incomplete result carries NO money figure (caller must block, not pay 0)
const inc = cps(100, null);
assert(inc.patientShare === undefined && inc.payerShare === undefined, 'Incomplete result exposes NO patientShare/payerShare (anti false-reassurance)');

// ===== 3. straight co-pay percentage (no caps) =====
console.log(`\n${BOLD}[3] simple co-pay percentage${RESET}`);
let r = cps(1000, { co_pay_percent: 20 });
assert(r.status === 'OK', 'valid input => OK');
assert(r.patientShare === 200, '20% of 1000 => patient 200');
assert(r.payerShare === 800, 'payer covers 800');
assert(r.coveredAmount === 1000, 'covered base = full gross when no max_limit');

r = cps(1000, { co_pay_percent: 0 });
assert(r.patientShare === 0 && r.payerShare === 1000, '0% co-pay => payer covers all (legit 0, OK status)');

r = cps(1000, { co_pay_percent: 100 });
assert(r.patientShare === 1000 && r.payerShare === 0, '100% co-pay => patient pays all');

// ===== 4. co_pay_max clamp =====
console.log(`\n${BOLD}[4] co_pay_max clamp${RESET}`);
r = cps(1000, { co_pay_percent: 20, co_pay_max: 150 });
assert(r.patientShare === 150, '20% (=200) clamped to co_pay_max 150');
assert(r.payerShare === 850, 'payer covers the rest (850)');

r = cps(1000, { co_pay_percent: 20, co_pay_max: 0 });
assert(r.patientShare === 200, 'co_pay_max 0 treated as no cap (200 stands)');

// ===== 5. max_limit ceiling — overage is patient-borne in full =====
console.log(`\n${BOLD}[5] max_limit ceiling (uncovered overage)${RESET}`);
r = cps(1200, { co_pay_percent: 10, max_limit: 1000 });
// covered base = 1000; co-pay 10% of 1000 = 100; uncovered overage = 200 => patient = 300
assert(r.coveredAmount === 1000, 'covered base capped at max_limit 1000');
assert(r.patientShare === 300, 'patient = co-pay(100) + uncovered overage(200) = 300');
assert(r.payerShare === 900, 'payer = gross(1200) - patient(300) = 900');

// ===== 6. combined max_limit + co_pay_max =====
console.log(`\n${BOLD}[6] combined ceiling + clamp${RESET}`);
r = cps(2000, { co_pay_percent: 20, co_pay_max: 250, max_limit: 1000 });
// covered base 1000; co-pay 20% = 200 (< 250, no clamp); overage = 1000 => patient = 1200
assert(r.patientShare === 1200, 'patient = co-pay(200) + overage(1000) = 1200');
assert(r.payerShare === 800, 'payer = 2000 - 1200 = 800');

r = cps(2000, { co_pay_percent: 40, co_pay_max: 250, max_limit: 1000 });
// covered base 1000; co-pay 40% = 400 clamped to 250; overage 1000 => patient = 1250
assert(r.patientShare === 1250, 'co-pay 400 clamped to 250; +overage 1000 => 1250');
assert(r.payerShare === 750, 'payer = 2000 - 1250 = 750');

// ===== 7. payer share never negative; zero gross =====
console.log(`\n${BOLD}[7] edge: zero gross / never-negative payer${RESET}`);
r = cps(0, { co_pay_percent: 20 });
assert(r.status === 'OK' && r.patientShare === 0 && r.payerShare === 0, 'zero gross => 0/0 OK');

console.log(`\n${BOLD}${BLUE}=== E11 Engine Unit Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
