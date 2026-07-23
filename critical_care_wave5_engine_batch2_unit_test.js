// critical_care_wave5_engine_batch2_unit_test.js
'use strict';
const assert = require('assert');
const engine = require('./critical_care_wave5_engine_batch2');

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}: ${e.message}`); failed++; fails.push(name); }
}

console.log('critical_care_wave5_engine_batch2 unit tests\n');

// SOFA
test('SOFA: normal all = 0', () => {
    const r = engine.calculateSOFA({ pao2Fio2: 450, platelets: 200, bilirubin: 0.8, map: 80, gcs: 15, creatinine: 0.8 });
    assert.strictEqual(r.value.sofaScore, 0);
    assert.strictEqual(r.severity, 'low');
});

test('SOFA: high vasopressors + low GCS + low platelets = high score', () => {
    const r = engine.calculateSOFA({ pao2Fio2: 150, platelets: 30, bilirubin: 4, map: 60, norepinephrine: 0.2, gcs: 8, creatinine: 2.5 });
    assert.ok(r.value.sofaScore >= 12);
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'goals_of_care_discussion'));
});

test('SOFA: low urine output escalates score', () => {
    const r = engine.calculateSOFA({ pao2Fio2: 400, platelets: 150, bilirubin: 0.8, map: 80, gcs: 15, creatinine: 1.0, urineOutput24h: 150 });
    assert.ok(r.value.sofaScore >= 4);
});

// RASS
test('RASS 0 = alert, low severity', () => {
    const r = engine.assessRASS({ rassScore: 0 });
    assert.strictEqual(r.severity, 'low');
});

test('RASS -3 ventilated = lightening recommended', () => {
    const r = engine.assessRASS({ rassScore: -3, onVentilator: true });
    assert.ok(r.recommendations.some(rec => rec.action === 'daily_sedation_holiday'));
});

test('RASS +3 = agitated, evaluate for cause', () => {
    const r = engine.assessRASS({ rassScore: 3 });
    assert.strictEqual(r.severity, 'high');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('evaluate_for')));
});

test('RASS -5 = unarousable, critical, rule out oversedation', () => {
    const r = engine.assessRASS({ rassScore: -5 });
    assert.strictEqual(r.severity, 'critical');
});

// Vent
test('PBW male 180cm = 75.4 kg, TV 452-603 mL', () => {
    const r = engine.calculateVentSettings({ sex: 'male', heightCm: 180, currentTV: 500, currentPEEP: 5, currentFiO2: 0.4 });
    assert.strictEqual(r.value.pbw, 75);
    assert.ok(r.value.targetTVRange[0] >= 450 && r.value.targetTVRange[0] <= 460);
    assert.ok(r.value.targetTVRange[1] >= 600 && r.value.targetTVRange[1] <= 610);
    assert.strictEqual(r.value.lungProtective, 'optimal');
});

test('TV too high = volutrauma risk', () => {
    const r = engine.calculateVentSettings({ sex: 'male', heightCm: 180, currentTV: 800, currentPEEP: 5, currentFiO2: 0.4 });
    assert.strictEqual(r.value.lungProtective, 'too_high_risk_volutrauma');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('reduce_TV')));
});

test('Driving pressure > 15 = recommend reduction', () => {
    const r = engine.calculateVentSettings({ sex: 'male', heightCm: 180, currentTV: 500, currentPEEP: 5, currentFiO2: 0.4, plateauPressure: 30 });
    assert.strictEqual(r.value.drivingPressure, 25);
    assert.strictEqual(r.value.dpOptimal, false);
});

// Transfusion
test('Hb 6.5 general = transfuse, critical', () => {
    const r = engine.assessTransfusion({ hemoglobin: 6.5, clinicalContext: 'general' });
    assert.strictEqual(r.value.transfusionRecommended, true);
    assert.strictEqual(r.severity, 'critical');
});

test('Hb 9.5 general = no transfusion (restrictive)', () => {
    const r = engine.assessTransfusion({ hemoglobin: 9.5, clinicalContext: 'general' });
    assert.strictEqual(r.value.transfusionRecommended, false);
});

test('Hb 9.0 ACS = transfuse, threshold 10', () => {
    const r = engine.assessTransfusion({ hemoglobin: 9.0, clinicalContext: 'ACS' });
    assert.strictEqual(r.value.transfusionThreshold, 10);
    assert.strictEqual(r.value.transfusionRecommended, true);
});

test('Active bleeding with INR 2.0 = recommend FFP/PCC', () => {
    const r = engine.assessTransfusion({ hemoglobin: 9.0, clinicalContext: 'general', activeBleeding: 'moderate', inr: 2.0 });
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.includes('FFP')));
});

// Nutrition
test('BMI 30 weight 100 height 180 male = adjusted weight 85 kg, target cal 2125', () => {
    const r = engine.calculateNutrition({ bmi: 30, weightKg: 100, age: 60, heightCm: 180, sex: 'male' });
    assert.ok(r.value.targetKcal >= 2100 && r.value.targetKcal <= 2150);
});

test('Cal delivery 50% = high severity, increase feeding', () => {
    const r = engine.calculateNutrition({ bmi: 25, weightKg: 70, calDelivered: 800, proteinDelivered: 50 });
    assert.ok(r.value.calPct < 60);
    assert.strictEqual(r.severity, 'high');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('increase_enteral')));
});

test('Underweight BMI 17 = recommend high protein', () => {
    const r = engine.calculateNutrition({ bmi: 17, weightKg: 50, calDelivered: 1500, proteinDelivered: 70 });
    assert.strictEqual(r.value.bmiClass, 'underweight');
    assert.ok(r.recommendations.some(rec => rec.action === 'high_protein_high_calorie_nutrition'));
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures: ' + fails.join(', ')); process.exit(1); }
process.exit(0);
