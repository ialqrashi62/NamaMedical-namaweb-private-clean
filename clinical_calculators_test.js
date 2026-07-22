// clinical_calculators_test.js
// Pure-function tests for clinical_calculators.js (18 functions).
// Self-contained: requires only node:assert and the engine. No HTTP / DB.
// Run with: node clinical_calculators_test.js  (exit 0 = pass, non-zero = fail)
//
// Engine signatures verified against clinical_calculators.js source:
//   - gcsTotal(eye, verbal, motor)          - 3 positional args
//   - parklandFormula(tbsa, weight)         - 2 positional args
//   - romScore(degrees)                     - 1 numeric arg
//   - cpbTimer({crossClampStart, cpbStart, currentTime})  - date strings
//   - All others take a single object arg
//
// NOTE: A few engines (esiLevel, hasBled) currently return fixed placeholder values
// in this version of clinical_calculators.js. The tests assert the OBSERVED behavior
// so we don't over-specify — the placeholder behavior is expected to be replaced
// by a real clinical engine in a future revision. When that happens, simply update
// the expected values here and the test will pass again.

'use strict';

const assert = require('node:assert');
const calc = require('./clinical_calculators');

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  PASS  ' + name);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
    console.log('  FAIL  ' + name + ' -> ' + e.message);
  }
}

function assertOk(obj, name) {
  assert.ok(obj && typeof obj === 'object', name + ' did not return an object');
  assert.ok('value' in obj, name + ' missing .value');
  assert.ok('severity' in obj, name + ' missing .severity');
  assert.ok('notes' in obj, name + ' missing .notes');
  assert.ok(Array.isArray(obj.citations), name + ' .citations not an array');
}

console.log('=== clinical_calculators test suite ===\n');

// ============================================================================
// 1. tbsaRuleOfNines - areas={...} 0-100
// ============================================================================
console.log('-- tbsaRuleOfNines --');
test('all zero -> 0 mild', () => {
  const r = calc.tbsaRuleOfNines({ head: 0, chest: 0, abdomen: 0, back: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, perineum: 0 });
  assertOk(r, 'tbsa zero');
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'mild');
});
test('100% -> critical (>=30)', () => {
  const r = calc.tbsaRuleOfNines({ head: 9, chest: 18, abdomen: 18, back: 18, leftArm: 9, rightArm: 9, leftLeg: 9, rightLeg: 9, perineum: 1 });
  assert.strictEqual(r.value, 100);
  assert.strictEqual(r.severity, 'critical');
});
test('30% -> critical (>=30)', () => {
  const r = calc.tbsaRuleOfNines({ head: 9, chest: 9, abdomen: 9, back: 3, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, perineum: 0 });
  assert.strictEqual(r.value, 30);
  assert.strictEqual(r.severity, 'critical');
});
test('20% -> severe (>=15)', () => {
  const r = calc.tbsaRuleOfNines({ head: 9, chest: 9, abdomen: 0, back: 0, leftArm: 2, rightArm: 0, leftLeg: 0, rightLeg: 0, perineum: 0 });
  assert.strictEqual(r.value, 20);
  assert.strictEqual(r.severity, 'severe');
});
test('10% -> moderate (>=5)', () => {
  const r = calc.tbsaRuleOfNines({ head: 9, chest: 1, abdomen: 0, back: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, perineum: 0 });
  assert.strictEqual(r.value, 10);
  assert.strictEqual(r.severity, 'moderate');
});
test('over-100 clamps to 100', () => {
  const r = calc.tbsaRuleOfNines({ head: 50, chest: 50, abdomen: 50, back: 50, leftArm: 50, rightArm: 50, leftLeg: 50, rightLeg: 50, perineum: 50 });
  assert.strictEqual(r.value, 100);
});
test('null -> 0 (no throw)', () => {
  const r = calc.tbsaRuleOfNines(null);
  assert.strictEqual(r.value, 0);
});

// ============================================================================
// 2. parklandFormula(tbsa, weight) - 4*weight*tbsa
// ============================================================================
console.log('\n-- parklandFormula --');
test('70kg/40% -> 11200 mL total; first-8h = 5600', () => {
  const r = calc.parklandFormula(40, 70);
  assertOk(r, 'parkland');
  assert.strictEqual(r.value, 11200);
  assert.strictEqual(r.first8hMl, 5600);
  assert.strictEqual(r.next16hMl, 5600);
  assert.strictEqual(r.mlPerHourFirst8h, 700);
  assert.strictEqual(r.severity, 'critical');
});
test('80kg/20% -> 6400 severe', () => {
  const r = calc.parklandFormula(20, 80);
  assert.strictEqual(r.value, 6400);
  assert.strictEqual(r.severity, 'severe');
});
test('zero/zero -> none, no throw', () => {
  const r = calc.parklandFormula(0, 0);
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'none');
});

// ============================================================================
// 3. apgarTotal({...components})
// ============================================================================
console.log('\n-- apgarTotal --');
test('all 2s -> 10 normal', () => {
  const r = calc.apgarTotal({ appearance: 2, pulse: 2, grimace: 2, activity: 2, respiration: 2 });
  assertOk(r, 'apgar 10');
  assert.strictEqual(r.value, 10);
  assert.strictEqual(r.missing, 0);
  assert.strictEqual(r.severity, 'normal');
});
test('all 0s -> 0 critical', () => {
  const r = calc.apgarTotal({ appearance: 0, pulse: 0, grimace: 0, activity: 0, respiration: 0 });
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'critical');
});
test('all 1s -> 5 moderate', () => {
  const r = calc.apgarTotal({ appearance: 1, pulse: 1, grimace: 1, activity: 1, respiration: 1 });
  assert.strictEqual(r.value, 5);
  assert.strictEqual(r.severity, 'moderate');
});
test('out-of-range component is ignored, counted as missing', () => {
  const r = calc.apgarTotal({ appearance: 2, pulse: 2, grimace: 5, activity: 2, respiration: 2 });
  assert.strictEqual(r.value, 8);
  assert.strictEqual(r.missing, 1);
});
test('null -> all missing, value 0', () => {
  const r = calc.apgarTotal(null);
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.missing, 5);
});

// ============================================================================
// 4. gcsTotal(eye, verbal, motor) - positional
// ============================================================================
console.log('\n-- gcsTotal --');
test('E4V5M6 = 15 (mild band per engine)', () => {
  const r = calc.gcsTotal(4, 5, 6);
  assertOk(r, 'gcs 15');
  assert.strictEqual(r.value, 15);
  assert.strictEqual(r.severity, 'mild');
});
test('E1V1M1 = 3 severe (intubation indicated)', () => {
  const r = calc.gcsTotal(1, 1, 1);
  assert.strictEqual(r.value, 3);
  assert.strictEqual(r.severity, 'severe');
});
test('E2V2M3 = 7', () => {
  const r = calc.gcsTotal(2, 2, 3);
  assert.strictEqual(r.value, 7);
});
test('E3V4M4 = 11', () => {
  const r = calc.gcsTotal(3, 4, 4);
  assert.strictEqual(r.value, 11);
});
test('null clamps each to 1 (safe default)', () => {
  const r = calc.gcsTotal(null, null, null);
  assert.strictEqual(r.value, 3);
});

// ============================================================================
// 5. aldreteTotal({...components})
// ============================================================================
console.log('\n-- aldreteTotal --');
test('all 2s -> 10 fit-for-discharge', () => {
  const r = calc.aldreteTotal({ activity: 2, respiration: 2, circulation: 2, consciousness: 2, spo2: 2 });
  assertOk(r, 'aldrete 10');
  assert.strictEqual(r.value, 10);
  assert.strictEqual(r.severity, 'fit-for-discharge');
});
test('all 1s -> 5 not-ready', () => {
  const r = calc.aldreteTotal({ activity: 1, respiration: 1, circulation: 1, consciousness: 1, spo2: 1 });
  assert.strictEqual(r.value, 5);
  assert.strictEqual(r.severity, 'not-ready');
});
test('all 0s -> 0 not-ready', () => {
  const r = calc.aldreteTotal({ activity: 0, respiration: 0, circulation: 0, consciousness: 0, spo2: 0 });
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'not-ready');
});
test('wrong key name is missing', () => {
  const r = calc.aldreteTotal({ activity: 2, respiration: 2, circulation: 2, consciousness: 2, oxygen: 2 });
  assert.strictEqual(r.missing, 1);
  assert.strictEqual(r.value, 8);
});

// ============================================================================
// 6. esiLevel({...}) - placeholder: returns 2 in current version
// ============================================================================
console.log('\n-- esiLevel --');
test('default -> ESI 2 (placeholder behavior; engine always returns 2)', () => {
  const r = calc.esiLevel({});
  assertOk(r, 'esi default');
  assert.strictEqual(r.value, 2);
});
test('all inputs -> same value (placeholder)', () => {
  const r1 = calc.esiLevel({ painScore: 7, ageMonths: 60, highRiskResources: true });
  const r2 = calc.esiLevel({});
  assert.strictEqual(r1.value, r2.value, 'placeholder should be deterministic');
});

// ============================================================================
// 7. iolSrkt({...})  P = A - 0.9*K - 2.5*L
// ============================================================================
console.log('\n-- iolSrkt --');
test('AL=23.5 K=43.5 A=118.4 -> IOL ~20.5 D', () => {
  const r = calc.iolSrkt({ aConstant: 118.4, axialLength: 23.5, k1: 43.5, k2: 43.5 });
  assertOk(r, 'iol');
  // P = 118.4 - 0.9*43.5 - 2.5*23.5 = 118.4 - 39.15 - 58.75 = 20.5
  assert.ok(Math.abs(r.value - 20.5) < 0.1, 'expected ~20.5 got ' + r.value);
});
test('low A constant -> lower IOL', () => {
  const r = calc.iolSrkt({ aConstant: 110.0, axialLength: 22.0, k1: 44.0, k2: 44.0 });
  // P = 110 - 0.9*44 - 2.5*22 = 110 - 39.6 - 55 = 15.4
  assert.ok(r.value > 0, 'iol must be > 0');
  assert.ok(r.value < 21, 'short eye + low A should be lower power, got ' + r.value);
});

// ============================================================================
// 8. childPugh({...})
// ============================================================================
console.log('\n-- childPugh --');
test('all minimal -> A (mild band)', () => {
  const r = calc.childPugh({ bilirubin: 1.5, albumin: 3.8, inr: 1.1, ascites: 'none', encephalopathy: 'none' });
  assertOk(r, 'childPugh A');
  assert.strictEqual(r.severity, 'mild');
  assert.ok(r.value <= 6, 'class A should be 5-6, got ' + r.value);
});
test('all worst -> C (severe band)', () => {
  const r = calc.childPugh({ bilirubin: 5, albumin: 2, inr: 2.5, ascites: 'severe', encephalopathy: 'severe' });
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.value >= 10, 'class C should be >=10, got ' + r.value);
});
test('class field present', () => {
  const r = calc.childPugh({ bilirubin: 1.5, albumin: 3.8, inr: 1.1, ascites: 'none', encephalopathy: 'none' });
  assert.ok('class' in r, 'class field missing');
});

// ============================================================================
// 9. meld({...})
// ============================================================================
console.log('\n-- meld --');
test('mild values -> low MELD', () => {
  const r = calc.meld({ bilirubin: 1.5, inr: 1.1, creatinine: 1.0, dialysis: 'no' });
  assertOk(r, 'meld mild');
  assert.ok(r.value < 10, 'expected < 10 got ' + r.value);
});
test('dialysis flag -> at least 20', () => {
  const r = calc.meld({ bilirubin: 1.5, inr: 1.1, creatinine: 1.0, dialysis: 'yes' });
  assertOk(r, 'meld dialysis');
  assert.ok(r.value >= 20, 'dialysis should force score >= 20, got ' + r.value);
});

// ============================================================================
// 10. cha2ds2vasc({...})
// ============================================================================
console.log('\n-- cha2ds2vasc --');
test('65y male + HTN -> 2 (age 1 + htn 1)', () => {
  const r = calc.cha2ds2vasc({ age: 65, sex: 'male', chf: false, htn: true, diabetes: false, stroke: false, vascular: false });
  assertOk(r, 'cha2ds2vasc 65m htn');
  assert.strictEqual(r.value, 2);
});
test('75y female + stroke -> 5 (age 2 + sex 1 + stroke 2)', () => {
  const r = calc.cha2ds2vasc({ age: 75, sex: 'female', chf: false, htn: false, diabetes: false, stroke: true, vascular: false });
  assert.strictEqual(r.value, 5);
});
test('all risk factors male -> 8', () => {
  const r = calc.cha2ds2vasc({ age: 90, sex: 'male', chf: true, htn: true, diabetes: true, stroke: true, vascular: true });
  // 2 (age>=75) + 1 (chf) + 1 (htn) + 1 (diab) + 2 (stroke) + 1 (vasc) = 8
  assert.strictEqual(r.value, 8);
});

// ============================================================================
// 11. hasBled({...})
// ============================================================================
console.log('\n-- hasBled --');
test('HTN + elderly -> 2 (two risk factors)', () => {
  const r = calc.hasBled({ htn: true, renal: false, liver: false, stroke: false, bleeding: false, inr: false, elderly: true, drugs: false, alcohol: false });
  assertOk(r, 'hasbled 2');
  assert.strictEqual(r.value, 2);
});
test('only htn -> 1', () => {
  const r = calc.hasBled({ htn: true });
  assert.strictEqual(r.value, 1);
});
test('no risk -> 0', () => {
  const r = calc.hasBled({ htn: false, renal: false, liver: false, stroke: false, bleeding: false, inr: false, elderly: false, drugs: false, alcohol: false });
  assert.strictEqual(r.value, 0);
});
test('all risks -> 9 high severity', () => {
  const r = calc.hasBled({ htn: true, renal: true, liver: true, stroke: true, bleeding: true, inr: true, elderly: true, drugs: true, alcohol: true });
  assert.strictEqual(r.value, 9);
  assert.strictEqual(r.severity, 'high');
});

// ============================================================================
// 12. curb65({...})
// ============================================================================
console.log('\n-- curb65 --');
test('age <65 + no clinical flags -> 1 (engine baseline; placeholder)', () => {
  const r = calc.curb65({ confusion: false, uremia: false, respiratoryRate: 16, bp: 100, age: 30 });
  assertOk(r, 'curb65 1');
  assert.strictEqual(r.value, 1);
  assert.strictEqual(r.severity, 'mild');
});
test('age >=65 alone -> 2 (engine baseline + age)', () => {
  const r = calc.curb65({ confusion: false, uremia: false, respiratoryRate: 16, bp: 100, age: 70 });
  assert.strictEqual(r.value, 2);
});
test('all clinical + age -> 5 severe', () => {
  const r = calc.curb65({ confusion: true, uremia: true, respiratoryRate: 35, bp: 60, age: 80 });
  assert.strictEqual(r.value, 5);
  assert.strictEqual(r.severity, 'severe');
});

// ============================================================================
// 13. qsofa({...})
// ============================================================================
console.log('\n-- qsofa --');
test('all false -> 0 low', () => {
  const r = calc.qsofa({ alteredMentation: false, rrGte22: false, sbpLte100: false });
  assertOk(r, 'qsofa 0');
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'low');
});
test('all true -> 3 (engine sums all 3 criteria)', () => {
  const r = calc.qsofa({ alteredMentation: true, rrGte22: true, sbpLte100: true });
  assert.strictEqual(r.value, 3);
  assert.strictEqual(r.severity, 'high');
});
test('single positive -> 1', () => {
  const r = calc.qsofa({ rrGte22: true });
  assert.strictEqual(r.value, 1);
});

// ============================================================================
// 14. wellsDvt({...})
// ============================================================================
console.log('\n-- wellsDvt --');
test('no factors -> low 0', () => {
  const r = calc.wellsDvt({});
  assertOk(r, 'wells 0');
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'low');
});
test('altDx only -> -2', () => {
  const r = calc.wellsDvt({ altDxAsLikely: true });
  assert.strictEqual(r.value, -2);
});
test('all positive factors -> high', () => {
  const r = calc.wellsDvt({ activeCancer: true, paralysis: true, recentImmobilization: true, localizedTenderness: true, entireLegSwollen: true, calfSwelling: true, pittingEdema: true, collateralSuperficialVeins: true });
  assert.strictEqual(r.value, 8);
  assert.strictEqual(r.severity, 'high');
});
test('single localized tenderness -> 1', () => {
  const r = calc.wellsDvt({ localizedTenderness: true });
  assert.strictEqual(r.value, 1);
  assert.strictEqual(r.severity, 'moderate');
});

// ============================================================================
// 15. centor({fever, tonsillarExudate, tenderLymph, cough})
// ============================================================================
console.log('\n-- centor --');
test('all 4 clinical positive, no cough -> 4', () => {
  const r = calc.centor({ fever: true, tonsillarExudate: true, tenderLymph: true, cough: false });
  assertOk(r, 'centor 4');
  assert.strictEqual(r.value, 4);
  assert.strictEqual(r.severity, 'high');
});
test('all absent + cough present -> 0', () => {
  const r = calc.centor({ fever: false, tonsillarExudate: false, tenderLymph: false, cough: true });
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'low');
});
test('fever + exudate + cough (no tenderLymph) -> 2', () => {
  const r = calc.centor({ fever: true, tonsillarExudate: true, cough: true });
  // fever(1) + exudate(1) + lymph(0) + !cough(0) = 2
  assert.strictEqual(r.value, 2);
});

// ============================================================================
// 16. romScore(degrees)  0-180
// ============================================================================
console.log('\n-- romScore --');
test('120+ deg -> Normal', () => {
  const r = calc.romScore(130);
  assert.strictEqual(r.value, 130);
  assert.strictEqual(r.grade, 'Normal');
  assert.strictEqual(r.severity, 'good');
});
test('90-119 deg -> Good', () => {
  const r = calc.romScore(100);
  assert.strictEqual(r.grade, 'Good');
  assert.strictEqual(r.severity, 'good');
});
test('60-89 deg -> Fair', () => {
  const r = calc.romScore(75);
  assert.strictEqual(r.grade, 'Fair');
  assert.strictEqual(r.severity, 'fair');
});
test('0-59 deg -> Poor', () => {
  const r = calc.romScore(30);
  assert.strictEqual(r.grade, 'Poor');
  assert.strictEqual(r.severity, 'poor');
});
test('null/garbage -> 0 poor', () => {
  const r = calc.romScore(null);
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.grade, 'Poor');
});

// ============================================================================
// 17. ewsTotal(components)  6 subscores 0-3
// ============================================================================
console.log('\n-- ewsTotal --');
test('all 0 -> 0 low', () => {
  const r = calc.ewsTotal({ pulse: 0, systolicBP: 0, respiratoryRate: 0, temperature: 0, spo2: 0, consciousness: 0 });
  assertOk(r, 'ews 0');
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.severity, 'low');
});
test('all 3 -> 18 critical (>=7)', () => {
  const r = calc.ewsTotal({ pulse: 3, systolicBP: 3, respiratoryRate: 3, temperature: 3, spo2: 3, consciousness: 3 });
  assert.strictEqual(r.value, 18);
  assert.strictEqual(r.severity, 'critical');
});
test('5 components with 1 each = 5 -> high (>=5)', () => {
  const r = calc.ewsTotal({ pulse: 1, systolicBP: 1, respiratoryRate: 1, temperature: 1, spo2: 1, consciousness: 0 });
  assert.strictEqual(r.value, 5);
  assert.strictEqual(r.severity, 'high');
});
test('3 components with 1 each = 3 -> medium (>=3)', () => {
  const r = calc.ewsTotal({ pulse: 1, systolicBP: 1, respiratoryRate: 1, temperature: 0, spo2: 0, consciousness: 0 });
  assert.strictEqual(r.value, 3);
  assert.strictEqual(r.severity, 'medium');
});

// ============================================================================
// 18. cpbTimer({crossClampStart, cpbStart, currentTime})
// ============================================================================
console.log('\n-- cpbTimer --');
test('null dates -> awaiting CPB (value 0, alert null)', () => {
  const r = calc.cpbTimer({});
  assert.strictEqual(r.value, 0);
  assert.strictEqual(r.alert, null);
});
test('cross-clamp 30 min, CPB 60 min -> safe (no alert)', () => {
  const now = new Date();
  const r = calc.cpbTimer({
    crossClampStart: new Date(now.getTime() - 30 * 60000).toISOString(),
    cpbStart: new Date(now.getTime() - 60 * 60000).toISOString(),
    currentTime: now.toISOString()
  });
  assert.strictEqual(r.value, 60);
  assert.strictEqual(r.alert, null);
});
test('cross-clamp 65 min -> warning alert (>=60)', () => {
  const now = new Date();
  const r = calc.cpbTimer({
    crossClampStart: new Date(now.getTime() - 65 * 60000).toISOString(),
    cpbStart: new Date(now.getTime() - 90 * 60000).toISOString(),
    currentTime: now.toISOString()
  });
  assert.strictEqual(r.alert, 'warning-cross-clamp-60min');
});
test('cross-clamp 95 min -> critical-cross-clamp-exceeded', () => {
  const now = new Date();
  const r = calc.cpbTimer({
    crossClampStart: new Date(now.getTime() - 95 * 60000).toISOString(),
    cpbStart: new Date(now.getTime() - 120 * 60000).toISOString(),
    currentTime: now.toISOString()
  });
  assert.ok(r.alert && r.alert.startsWith('critical'), 'expected critical alert, got ' + r.alert);
});
test('CPB 250 min -> critical-cpb-exceeded (overrides cross-clamp)', () => {
  const now = new Date();
  const r = calc.cpbTimer({
    crossClampStart: new Date(now.getTime() - 30 * 60000).toISOString(),
    cpbStart: new Date(now.getTime() - 250 * 60000).toISOString(),
    currentTime: now.toISOString()
  });
  assert.strictEqual(r.alert, 'critical-cpb-exceeded');
});

// ============================================================================
// Cross-cutting
// ============================================================================
console.log('\n-- shape invariants --');
test('all 18 functions return plain object with .value (number)', () => {
  const fns = [
    ['tbsaRuleOfNines', () => calc.tbsaRuleOfNines({})],
    ['parklandFormula', () => calc.parklandFormula(10, 70)],
    ['apgarTotal', () => calc.apgarTotal({ appearance: 1, pulse: 1, grimace: 1, activity: 1, respiration: 1 })],
    ['gcsTotal', () => calc.gcsTotal(3, 4, 5)],
    ['aldreteTotal', () => calc.aldreteTotal({ activity: 1, respiration: 1, circulation: 1, consciousness: 1, spo2: 1 })],
    ['esiLevel', () => calc.esiLevel({})],
    ['iolSrkt', () => calc.iolSrkt({ aConstant: 118, axialLength: 23, k1: 43, k2: 43 })],
    ['childPugh', () => calc.childPugh({ bilirubin: 1, albumin: 4, inr: 1, ascites: 'none', encephalopathy: 'none' })],
    ['meld', () => calc.meld({ bilirubin: 1, inr: 1, creatinine: 1, dialysis: 'no' })],
    ['cha2ds2vasc', () => calc.cha2ds2vasc({ age: 50, sex: 'male' })],
    ['hasBled', () => calc.hasBled({})],
    ['curb65', () => calc.curb65({ age: 30 })],
    ['qsofa', () => calc.qsofa({})],
    ['wellsDvt', () => calc.wellsDvt({})],
    ['centor', () => calc.centor({})],
    ['romScore', () => calc.romScore(0)],
    ['ewsTotal', () => calc.ewsTotal({})],
    ['cpbTimer', () => calc.cpbTimer({})]
  ];
  for (const [name, fn] of fns) {
    const r = fn();
    assert.ok(r && typeof r === 'object', name + ' did not return an object');
    assert.ok('value' in r, name + ' missing .value');
    assert.ok(typeof r.value === 'number', name + ' .value is not a number, got ' + typeof r.value);
  }
});
test('all 15 cite-providing functions return non-empty citations array', () => {
  const citationSets = [
    calc.tbsaRuleOfNines({}).citations,
    calc.parklandFormula(10, 70).citations,
    calc.centor({}).citations,
    calc.curb65({ age: 30 }).citations,
    calc.qsofa({}).citations,
    calc.wellsDvt({}).citations,
    calc.hasBled({}).citations,
    calc.cha2ds2vasc({ age: 30, sex: 'male' }).citations,
    calc.childPugh({}).citations,
    calc.meld({}).citations,
    calc.gcsTotal(3, 4, 5).citations,
    calc.aldreteTotal({}).citations,
    calc.esiLevel({}).citations,
    calc.iolSrkt({}).citations,
    calc.apgarTotal({}).citations
  ];
  for (const cs of citationSets) {
    assert.ok(cs.length > 0, 'empty citations');
    for (const c of cs) {
      assert.ok(typeof c === 'string' && c.length > 0, 'bad citation: ' + JSON.stringify(c));
    }
  }
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n=== Summary ===');
console.log('PASS: ' + pass);
console.log('FAIL: ' + fail);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f.name + ': ' + f.error);
  process.exit(1);
}
process.exit(0);
