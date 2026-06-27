/**
 * bloodbank_compat_test.js — PURE-ENGINE unit test for E13 ABO/Rh compatibility.
 * Run: node bloodbank_compat_test.js   (no DB; deterministic)
 *
 * Verifies the critical safety invariant: ABO/Rh-incompatible pairings are
 * reported incompatible (so routes fail-closed 422), and incomplete typing is
 * NEVER reported compatible.
 */
'use strict';
const C = require('./bloodbank_compat');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}

console.log(`${BOLD}E13 Blood Bank — ABO/Rh compatibility engine (pure unit test)${RESET}\n`);

// ---- parseBloodType ----
console.log('[1] parseBloodType normalization');
assert(JSON.stringify(C.parseBloodType('A+')) === JSON.stringify({ abo: 'A', rh: '+' }), 'A+ -> {A,+}');
assert(JSON.stringify(C.parseBloodType('O-')) === JSON.stringify({ abo: 'O', rh: '-' }), 'O- -> {O,-}');
assert(JSON.stringify(C.parseBloodType('AB Negative')) === JSON.stringify({ abo: 'AB', rh: '-' }), 'AB Negative -> {AB,-}');
assert(JSON.stringify(C.parseBloodType('B', '+')) === JSON.stringify({ abo: 'B', rh: '+' }), 'B + sep rh -> {B,+}');
assert(C.parseBloodType('A').rh === null, 'A (no rh) -> rh null');
assert(C.parseBloodType('Z+').abo === null, 'garbage abo -> null');
assert(C.parseBloodType('').abo === null, 'empty -> abo null');
assert(C.parseBloodType(null).abo === null, 'null -> abo null');
assert(JSON.stringify(C.parseBloodType({ blood_type: 'AB', rh_factor: '+' })) === JSON.stringify({ abo: 'AB', rh: '+' }), 'object form');

// ---- RBC ABO matrix (recipient receives donor RBC) ----
console.log('\n[2] RBC ABO compatibility matrix (Packed RBC)');
const rbc = (pa, da) => C.isABORhCompatible(pa + '+', null, da + '+', null, 'Packed RBC').compatible;
assert(rbc('O', 'O') === true,  'O recipient <- O donor OK');
assert(rbc('O', 'A') === false, 'O recipient <- A donor BLOCKED');
assert(rbc('O', 'B') === false, 'O recipient <- B donor BLOCKED');
assert(rbc('A', 'A') === true,  'A recipient <- A OK');
assert(rbc('A', 'O') === true,  'A recipient <- O OK');
assert(rbc('A', 'B') === false, 'A recipient <- B BLOCKED');
assert(rbc('A', 'AB') === false,'A recipient <- AB BLOCKED');
assert(rbc('B', 'B') === true,  'B recipient <- B OK');
assert(rbc('B', 'O') === true,  'B recipient <- O OK');
assert(rbc('B', 'A') === false, 'B recipient <- A BLOCKED');
assert(rbc('AB', 'A') === true, 'AB recipient <- A OK (universal recipient)');
assert(rbc('AB', 'B') === true, 'AB recipient <- B OK');
assert(rbc('AB', 'O') === true, 'AB recipient <- O OK');
assert(rbc('AB', 'AB') === true,'AB recipient <- AB OK');

// ---- Rh rule (RBC): Rh-neg recipient must NOT get Rh-pos RBC ----
console.log('\n[3] Rh rule for RBC');
assert(C.isABORhCompatible('O-', null, 'O+', null, 'Packed RBC').compatible === false, 'O- recipient <- O+ RBC BLOCKED');
assert(C.isABORhCompatible('O-', null, 'O-', null, 'Packed RBC').compatible === true,  'O- recipient <- O- RBC OK');
assert(C.isABORhCompatible('O+', null, 'O-', null, 'Packed RBC').compatible === true,  'O+ recipient <- O- RBC OK');
assert(C.isABORhCompatible('O+', null, 'O+', null, 'Packed RBC').compatible === true,  'O+ recipient <- O+ RBC OK');
assert(C.isABORhCompatible('A-', null, 'O+', null, 'Whole Blood').reason.indexOf('RH_INCOMPATIBLE') === 0, 'A- <- O+ reason is RH_INCOMPATIBLE');

// ---- Plasma (inverted ABO, no Rh barrier) ----
console.log('\n[4] Plasma (FFP) inverted ABO rule + Rh not a barrier');
const ffp = (pa, da) => C.isABORhCompatible(pa, null, da, null, 'FFP').compatible;
assert(ffp('AB+', 'AB+') === true,  'AB recipient <- AB plasma OK');
assert(ffp('AB+', 'A+')  === false, 'AB recipient <- A plasma BLOCKED (inverted)');
assert(ffp('O+',  'AB+') === true,  'O recipient <- AB plasma OK (AB universal plasma donor)');
assert(ffp('A+',  'AB+') === true,  'A recipient <- AB plasma OK');
assert(C.isABORhCompatible('O-', null, 'O+', null, 'FFP').compatible === true, 'O- recipient <- O+ FFP OK (Rh not barrier for plasma)');

// ---- Fail-closed on incomplete typing ----
console.log('\n[5] Fail-closed on incomplete / unknown typing');
assert(C.isABORhCompatible('', null, 'O+', null, 'Packed RBC').compatible === false, 'empty recipient -> blocked');
assert(C.isABORhCompatible('A', null, 'O+', null, 'Packed RBC').compatible === false, 'recipient missing Rh -> blocked');
assert(C.isABORhCompatible('A+', null, 'Z+', null, 'Packed RBC').compatible === false, 'garbage donor abo -> blocked');
assert(C.isABORhCompatible('A+', null, '', null, 'Packed RBC').reason === 'INCOMPLETE_DONOR_TYPE', 'empty donor -> INCOMPLETE_DONOR_TYPE');
// unknown component falls back to STRICTER (RBC) rule
assert(C.isABORhCompatible('O-', null, 'O+', null, 'Mystery').compatible === false, 'unknown component uses strict RBC Rh rule');

// ---- isUnitIssuable: expiry + status gate ----
console.log('\n[6] isUnitIssuable expiry/status gate');
const future = '2999-01-01', past = '2000-01-01';
assert(C.isUnitIssuable({ status: 'Available', expiry_date: future }).issuable === true, 'Available + future expiry -> issuable');
assert(C.isUnitIssuable({ status: 'Available', expiry_date: past }).issuable === false, 'expired -> NOT issuable');
assert(C.isUnitIssuable({ status: 'Available', expiry_date: past }).reason === 'UNIT_EXPIRED', 'expired -> reason UNIT_EXPIRED');
assert(C.isUnitIssuable({ status: 'Transfused', expiry_date: future }).issuable === false, 'already transfused -> NOT issuable');
assert(C.isUnitIssuable({ status: 'Reserved', expiry_date: future }).issuable === false, 'reserved -> NOT issuable');
assert(C.isUnitIssuable(null).issuable === false, 'null unit -> NOT issuable');
assert(C.isUnitIssuable({ status: 'Available', expiry_date: '' }).issuable === true, 'no expiry recorded -> issuable (status gate only)');

// ---- daysUntilExpiry ----
console.log('\n[7] daysUntilExpiry');
assert(C.daysUntilExpiry('') === null, 'empty -> null');
assert(C.daysUntilExpiry(past) < 0, 'past -> negative');
assert(C.daysUntilExpiry(future) > 0, 'future -> positive');

console.log(`\n${BOLD}Engine results — PASS:${passed} FAIL:${failed}${RESET}`);
if (failed) { console.log(`${RED}Failures: ${fails.join(', ')}${RESET}`); process.exit(1); }
process.exit(0);
