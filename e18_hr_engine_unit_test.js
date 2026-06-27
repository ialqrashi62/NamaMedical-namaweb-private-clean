/**
 * e18_hr_engine_unit_test.js
 * Pure-engine unit tests for E18 (no DB, no I/O): id/number helpers, license-expiry
 * classification (fail-CLOSED on unknown), leave + slip state machines, shift overlap,
 * worked-hours, GOSI payroll computation, posting gate, and PII masking.
 *   node e18_hr_engine_unit_test.js
 */
'use strict';
const e = require('./e18_hr_engine');

let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det) {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; failures.push(name); }
}

console.log('\n=== E18 PURE ENGINE UNIT TESTS ===\n');

// ---- id / number helpers (integer-id, anti-coercion E6) ----
console.log('[1] id/number helpers');
assert(e.e18IntId('5') === 5, 'e18IntId accepts clean numeric string');
assert(e.e18IntId(' 5') === null, 'e18IntId rejects space-padded id (E6 bypass)');
assert(e.e18IntId('5x') === null, 'e18IntId rejects 5x');
assert(e.e18IntId(5.5) === null, 'e18IntId rejects float');
assert(e.e18IntId(0) === null && e.e18IntId(-3) === null, 'e18IntId rejects <=0');
assert(e.e18Num('') === null && e.e18Num(null) === null, 'e18Num rejects empty/null');
assert(e.e18Num('1200.5') === 1200.5, 'e18Num accepts numeric string');

// ---- license expiry classification (server-side, fail-closed) ----
console.log('\n[2] license-expiry classification');
const NOW = Date.UTC(2026, 5, 26); // 2026-06-26
assert(e.licenseStatus('2026-01-01', 30, NOW).status === 'expired', 'past expiry => expired');
assert(e.licenseStatus('2026-07-10', 30, NOW).status === 'expiring', 'within alert window => expiring');
assert(e.licenseStatus('2027-01-01', 30, NOW).status === 'valid', 'far future => valid');
assert(e.licenseStatus(null, 30, NOW).status === 'unknown', 'missing expiry => unknown (NOT valid)');
assert(e.licenseStatus('not-a-date', 30, NOW).status === 'unknown', 'unparseable expiry => unknown');
assert(e.isLicenseCompliant('2026-01-01', 30, NOW) === false, 'expired license is NON-compliant');
assert(e.isLicenseCompliant(null, 30, NOW) === false, 'unknown license is NON-compliant (fail-closed)');
assert(e.isLicenseCompliant('2026-07-10', 30, NOW) === true, 'expiring-but-in-date is still compliant');
assert(e.licenseStatus('2026-06-26', 30, NOW).daysToExpiry === 0, 'expiry today => 0 days, expiring');
// worst-of set
assert(e.worstLicenseStatus([{ expiry_date: '2027-01-01', alert_days: 30 }, { expiry_date: '2026-01-01', alert_days: 30 }], NOW) === 'expired', 'worstLicenseStatus picks expired');
assert(e.worstLicenseStatus([], NOW) === null, 'no licenses => null');

// ---- leave state machine ----
console.log('\n[3] leave state machine');
assert(e.canTransitionLeave('requested', 'approved') === true, 'requested->approved ok');
assert(e.canTransitionLeave('requested', 'denied') === true, 'requested->denied ok');
assert(e.canTransitionLeave('requested', 'cancelled') === true, 'requested->cancelled ok');
assert(e.canTransitionLeave('approved', 'denied') === false, 'approved->denied BLOCKED (terminal)');
assert(e.canTransitionLeave('denied', 'approved') === false, 'denied->approved BLOCKED (terminal)');
assert(e.canTransitionLeave('requested', 'frobnicate') === false, 'unknown target BLOCKED');
assert(e.leaveDays('2026-06-20', '2026-06-22') === 3, 'leaveDays inclusive count');
assert(e.leaveDays('2026-06-22', '2026-06-20') === null, 'leaveDays rejects inverted range');
assert(e.leaveDays('bad', '2026-06-20') === null, 'leaveDays rejects invalid date');

// ---- shift validation + overlap ----
console.log('\n[4] shift validation + overlap');
assert(e.validateShift('08:00', '16:00').ok === true, 'valid shift 08-16');
assert(e.validateShift('16:00', '08:00').ok === false, 'end<=start rejected');
assert(e.validateShift('25:00', '26:00').ok === false, 'invalid hour rejected');
assert(e.shiftsOverlap('08:00', '16:00', '15:00', '20:00') === true, 'overlapping shifts detected');
assert(e.shiftsOverlap('08:00', '16:00', '16:00', '20:00') === false, 'adjacent (touching) shifts do NOT overlap');
assert(e.hasShiftConflict([{ start_time: '08:00', end_time: '16:00' }], { start_time: '12:00', end_time: '20:00' }) === true, 'hasShiftConflict true on overlap');
assert(e.hasShiftConflict([{ start_time: '08:00', end_time: '16:00' }], { start_time: '16:00', end_time: '23:00' }) === false, 'hasShiftConflict false when adjacent');

// ---- worked hours (server authoritative; incomplete -> null) ----
console.log('\n[5] worked hours');
assert(e.computeWorkedHours('08:00', '16:30') === 8.5, 'worked hours 8.5');
assert(e.computeWorkedHours('08:00', null) === null, 'missing check-out => null (not 0)');
assert(e.computeWorkedHours('16:00', '08:00') === null, 'checkout before checkin => null');

// ---- payroll computation (GOSI 9%, server-authoritative net) ----
console.log('\n[6] payroll slip computation');
const slip = e.computePayrollSlip({ basic_salary: 10000, housing_allowance: 2500, transport_allowance: 1000, is_saudi: true });
assert(slip.ok === true, 'slip computes ok');
// GOSI base = basic+housing = 12500 * 0.09 = 1125
assert(slip.gosi_deduction === 1125, 'GOSI 9% of (basic+housing)=1125', 'got ' + slip.gosi_deduction);
assert(slip.gross_earnings === 13500, 'gross = 10000+2500+1000');
assert(slip.net_salary === 12375, 'net = 13500 - 1125', 'got ' + slip.net_salary);
const slipNon = e.computePayrollSlip({ basic_salary: 10000, housing_allowance: 2500, transport_allowance: 1000, is_saudi: false });
assert(slipNon.gosi_deduction === 0, 'non-Saudi => no GOSI employee share');
const slipAdv = e.computePayrollSlip({ basic_salary: 5000, advances_deducted: 500, other_deductions: 100, is_saudi: true });
assert(slipAdv.total_deductions === e.GOSI_EMPLOYEE_RATE * 5000 + 600, 'deductions include advances+other');
assert(e.computePayrollSlip({ basic_salary: 'abc' }).ok === false, 'invalid basic salary rejected');
assert(e.computePayrollSlip({ basic_salary: -100 }).ok === false, 'negative basic salary rejected');
// negative client-supplied advances cannot inflate net (clamped >=0)
const slipNeg = e.computePayrollSlip({ basic_salary: 5000, advances_deducted: -9999, is_saudi: false });
assert(slipNeg.advances_deducted === 0, 'negative advances clamped to 0 (anti-spoof)');
// L2: saudi_status flag — explicit when is_saudi is provided, inferred when national_id blank
assert(slip.saudi_status === 'explicit', 'L2: saudi_status=explicit when is_saudi provided');
const slipInferred = e.computePayrollSlip({ basic_salary: 5000 }); // no is_saudi, no national_id
assert(slipInferred.saudi_status === 'inferred', 'L2: saudi_status=inferred when is_saudi omitted (auditor flag)');
assert(slipInferred.is_saudi === true, 'L2: conservative default is_saudi=true when omitted (GOSI applied)');
const slipBlankId = e.computePayrollSlip({ basic_salary: 5000, national_id: '' }); // blank national_id
assert(slipBlankId.saudi_status === 'inferred', 'L2: saudi_status=inferred with blank national_id');

// ---- payroll posting gate (default OFF) ----
console.log('\n[7] payroll posting gate');
assert(e.isPostingEnabled({}) === false, 'posting OFF by default');
assert(e.isPostingEnabled({ HR_PAYROLL_POSTING_ENABLED: 'false' }) === false, 'explicit false => off');
assert(e.isPostingEnabled({ HR_PAYROLL_POSTING_ENABLED: 'true' }) === true, 'explicit true => on');
assert(e.canTransitionSlip('draft', 'approved') === true, 'slip draft->approved ok');
assert(e.canTransitionSlip('approved', 'posted') === true, 'slip approved->posted allowed (gate enforced at route)');
assert(e.canTransitionSlip('draft', 'posted') === false, 'slip draft->posted BLOCKED (must approve first)');
assert(e.canTransitionSlip('posted', 'draft') === false, 'posted is terminal');

// ---- PII masking ----
console.log('\n[8] PII masking');
const masked = e.maskEmployeePII({ id: 1, name_en: 'X', national_id: '1234', basic_salary: 9000, phone: '050' });
assert(masked.national_id === undefined && masked.basic_salary === undefined && masked.phone === undefined, 'PII fields stripped');
assert(masked.name_en === 'X' && masked._pii_masked === true, 'non-PII retained + flagged');

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
process.exit(0);
