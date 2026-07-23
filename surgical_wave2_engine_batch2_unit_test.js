// surgical_wave2_engine_batch2_unit_test.js
'use strict';
const assert = require('assert');
const engine = require('./surgical_wave2_engine_batch2');

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}: ${e.message}`); failed++; fails.push(name); }
}

console.log('surgical_wave2_engine_batch2 unit tests\n');

// Bariatric
test('BMI 42 no comorbidity = eligible (class III)', () => {
    const r = engine.calculateBariatricEligibility({ bmi: 42, priorWeightLossAttempts: 3, psychiatricControlled: true, substanceFree: true });
    assert.strictEqual(r.value.eligible, true);
    assert.strictEqual(r.value.category, 'class_III_morbid');
});

test('BMI 36 + T2D = eligible (class II with comorbidity)', () => {
    const r = engine.calculateBariatricEligibility({ bmi: 36, t2d: true, priorWeightLossAttempts: 2, psychiatricControlled: true, substanceFree: true });
    assert.strictEqual(r.value.eligible, true);
    assert.strictEqual(r.value.category, 'class_II_with_comorbidity');
});

test('BMI 32 + T2D = eligible (2018 ASMBS)', () => {
    const r = engine.calculateBariatricEligibility({ bmi: 32, t2d: true, priorWeightLossAttempts: 5, psychiatricControlled: true, substanceFree: true });
    assert.strictEqual(r.value.eligible, true);
    assert.strictEqual(r.value.category, 'class_I_with_T2D_2018ASMBS');
});

test('Substance not free = not eligible', () => {
    const r = engine.calculateBariatricEligibility({ bmi: 42, substanceFree: false, psychiatricControlled: true });
    assert.strictEqual(r.value.eligible, false);
    assert.strictEqual(r.value.reason, 'psychiatric_or_substance_uncontrolled');
});

// NAC breast cancer
test('HER2+ tumor >= 2cm = high response', () => {
    const r = engine.calculateNACBenefit({ tumorSizeCm: 3, nodalStatus: 'positive', her2: 'positive', er: 'negative', pr: 'negative', ki67: 30, grade: 'grade_3' });
    assert.ok(r.value.responseRate >= 70);
    assert.strictEqual(r.value.subtype, 'HER2+');
});

test('TNBC = high response, recommend platinum + pembro', () => {
    const r = engine.calculateNACBenefit({ tumorSizeCm: 4, her2: 'negative', er: 'negative', pr: 'negative', ki67: 80, grade: 'grade_3' });
    assert.strictEqual(r.value.subtype, 'TNBC');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.includes('pembrolizumab')));
});

test('ER+ HER2- with low Ki67 = low benefit, recommend Oncotype', () => {
    const r = engine.calculateNACBenefit({ tumorSizeCm: 2, her2: 'negative', er: 'positive', pr: 'positive', ki67: 10 });
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.includes('Oncotype')));
});

// Trauma
test('SBP < 90 = Level I trauma', () => {
    const r = engine.calculateTraumaActivation({ mechanism: 'MVC', sbp: 80, hr: 130, gcs: 13, intubation: true });
    assert.strictEqual(r.value.activationLevel, 'level_1');
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'massive_transfusion_protocol'));
});

test('GCS <= 8 = Level I', () => {
    const r = engine.calculateTraumaActivation({ mechanism: 'fall', gcs: 6 });
    assert.strictEqual(r.value.activationLevel, 'level_1');
});

test('Penetrating head = Level I', () => {
    const r = engine.calculateTraumaActivation({ mechanism: 'stab', penetrating: 'head_neck_torso' });
    assert.strictEqual(r.value.activationLevel, 'level_1');
});

test('Fall 30 ft = Level II', () => {
    const r = engine.calculateTraumaActivation({ mechanism: 'fall', fall: 30 });
    assert.strictEqual(r.value.activationLevel, 'level_2');
});

// ISS
test('ISS = 1+1+1 = 3 (mild)', () => {
    const r = engine.calculateISS({ regions: { head: 1, chest: 1, abdomen: 1 } });
    assert.strictEqual(r.value.iss, 3);
    assert.strictEqual(r.severity, 'low');
});

test('ISS 4+4+4 = 48 (critical, mortality ~25%)', () => {
    const r = engine.calculateISS({ regions: { head: 4, chest: 4, abdomen: 4 } });
    assert.strictEqual(r.value.iss, 48);
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'ICU_admission'));
});

test('ISS with only 2 regions = invalid', () => {
    const r = engine.calculateISS({ regions: { head: 3, chest: 3 } });
    assert.strictEqual(r.value.valid, false);
});

// Clavien-Dindo
test('Death = grade V', () => {
    const r = engine.calculateClavienDindo({ mortality: true });
    assert.strictEqual(r.value.grade, 'V');
    assert.strictEqual(r.severity, 'critical');
});

test('GA intervention = grade IIIb', () => {
    const r = engine.calculateClavienDindo({ interventionNeeded: 'general_anesthesia' });
    assert.strictEqual(r.value.grade, 'IIIb');
    assert.strictEqual(r.severity, 'high');
});

test('TPN = grade II', () => {
    const r = engine.calculateClavienDindo({ complication: 'tpn' });
    assert.strictEqual(r.value.grade, 'II');
});

test('Multi organ failure = IVb', () => {
    const r = engine.calculateClavienDindo({ organFailure: 'multi' });
    assert.strictEqual(r.value.grade, 'IVb');
});

// ASA
test('Normal healthy = ASA I', () => {
    const r = engine.calculateASA({ healthy: true });
    assert.strictEqual(r.value.asa, 'I');
});

test('Severe systemic = ASA III', () => {
    const r = engine.calculateASA({ severeSystemic: true });
    assert.strictEqual(r.value.asa, 'III');
});

test('Emergency = ASA IE', () => {
    const r = engine.calculateASA({ healthy: true, emergency: true });
    assert.strictEqual(r.value.asa, 'IE');
});

// RCRI
test('RCRI 0 = low risk', () => {
    const r = engine.calculateRCRI({});
    assert.strictEqual(r.value.score, 0);
    assert.strictEqual(r.value.riskCategory, 'low');
});

test('RCRI 3 (IHD + CHF + DM) = high risk, recommend preop cardiology', () => {
    const r = engine.calculateRCRI({ highRiskSurgery: true, ischemicHeartDisease: true, chf: true, diabetes: true });
    assert.ok(r.value.score >= 3);
    assert.strictEqual(r.value.riskCategory, 'high');
    assert.ok(r.recommendations.some(rec => rec.action === 'preop_cardiology_consult'));
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures: ' + fails.join(', ')); process.exit(1); }
process.exit(0);
