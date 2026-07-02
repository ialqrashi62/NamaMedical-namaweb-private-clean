/**
 * result_loop_test.js — PURE-ENGINE unit test for Gate 3 (order↔result closed loop
 * + result acknowledgement requirement).
 * Run: node result_loop_test.js   (no DB; deterministic)
 *
 * Safety invariants:
 *  - A legacy order is closed ONLY when the sample and order agree on the patient
 *    (guard against closing the wrong patient's order) and the order is still open.
 *  - Acknowledgement requirement is fail-closed: a critical result ALWAYS requires
 *    physician acknowledgement; unknown/missing flags never silently mean 'none'.
 */
'use strict';
const R = require('./result_loop');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}

console.log(`${BOLD}Gate 3 — order↔result loop engine (pure unit test)${RESET}\n`);

// ---- shouldCloseLegacyOrder ----
console.log('[1] shouldCloseLegacyOrder — patient guard, open-status guard');
let d = R.shouldCloseLegacyOrder({ patient_id: 7 }, { id: 12, patient_id: 7, status: 'Requested' });
assert(d.close === true, 'same patient + open order -> close', JSON.stringify(d));
d = R.shouldCloseLegacyOrder({ patient_id: 7 }, { id: 12, patient_id: 9, status: 'Requested' });
assert(d.close === false && /patient/i.test(d.reason), 'PATIENT MISMATCH -> never close', JSON.stringify(d));
d = R.shouldCloseLegacyOrder({ patient_id: 7 }, { id: 12, patient_id: 7, status: 'Completed' });
assert(d.close === false, 'already Completed -> no re-close', JSON.stringify(d));
d = R.shouldCloseLegacyOrder({ patient_id: 7 }, { id: 12, patient_id: 7, status: 'Cancelled' });
assert(d.close === false, 'Cancelled -> never close', JSON.stringify(d));
d = R.shouldCloseLegacyOrder({ patient_id: 7 }, null);
assert(d.close === false, 'order not found -> no close', JSON.stringify(d));
d = R.shouldCloseLegacyOrder({ patient_id: null }, { id: 12, patient_id: 7, status: 'Requested' });
assert(d.close === false, 'sample missing patient -> fail-closed no close', JSON.stringify(d));
// status naming variants used by legacy UI
d = R.shouldCloseLegacyOrder({ patient_id: 7 }, { id: 12, patient_id: 7, status: 'In Progress' });
assert(d.close === true, "'In Progress' counts as open", JSON.stringify(d));

// ---- ackRequirement ----
console.log('\n[2] ackRequirement — critical always, abnormal flags, fail-closed');
let a = R.ackRequirement({ is_critical: 1, abnormal_flag: 'HH', status: 'verified' });
assert(a.required === true && a.level === 'critical', 'critical -> required critical', JSON.stringify(a));
a = R.ackRequirement({ is_critical: 0, abnormal_flag: 'H', status: 'verified' });
assert(a.required === true && a.level === 'abnormal', 'H flag -> required abnormal', JSON.stringify(a));
a = R.ackRequirement({ is_critical: 0, abnormal_flag: 'LL', status: 'verified' });
assert(a.required === true && a.level === 'critical', 'LL (critical-low) -> critical level', JSON.stringify(a));
a = R.ackRequirement({ is_critical: 0, abnormal_flag: 'N', status: 'verified' });
assert(a.required === false && a.level === 'none', 'normal -> not required', JSON.stringify(a));
a = R.ackRequirement({ is_critical: false, abnormal_flag: '', status: 'verified' });
assert(a.required === true && a.level === 'unknown', 'MISSING flag -> fail-closed required (unknown)', JSON.stringify(a));
a = R.ackRequirement(null);
assert(a.required === true && a.level === 'unknown', 'null result -> fail-closed required', JSON.stringify(a));
a = R.ackRequirement({ is_critical: 0, abnormal_flag: 'HH', status: 'verified' });
assert(a.required === true && a.level === 'critical', 'HH flag alone -> critical even if is_critical unset', JSON.stringify(a));

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
