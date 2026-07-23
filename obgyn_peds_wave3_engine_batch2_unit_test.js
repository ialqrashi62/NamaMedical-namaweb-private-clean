// obgyn_peds_wave3_engine_batch2_unit_test.js
'use strict';
const assert = require('assert');
const engine = require('./obgyn_peds_wave3_engine_batch2');

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}: ${e.message}`); failed++; fails.push(name); }
}

console.log('obgyn_peds_wave3_engine_batch2 unit tests\n');

// EDD
test('Naegele EDD: LMP 2026-01-01 = EDD 2026-10-08', () => {
    const r = engine.calculateEDDFromLMP({ lmpDate: '2026-01-01' });
    assert.strictEqual(r.value.edd, '2026-10-08');
});

// GA by CRL
test('CRL 10mm = ~9w5d', () => {
    const r = engine.calculateGAFromUS({ crl_mm: 10 });
    assert.ok(r.value.gaWeeks >= 8 && r.value.gaWeeks <= 10);
});

// Pre-eclampsia
test('SBP 165, DBP 110, GA 32w = severe preeclampsia, deliver', () => {
    const r = engine.assessPreEclampsia({ sbp: 165, dbp: 110, gestationalAgeWeeks: 32, proteinuria: true });
    assert.strictEqual(r.value.diagnosis, 'preeclampsia_with_severe_features');
    assert.ok(r.recommendations.some(rec => rec.action === 'magnesium_sulfate_seizure_prophylaxis'));
});

test('SBP 145, proteinuria, GA 30w = preeclampsia, not severe', () => {
    const r = engine.assessPreEclampsia({ sbp: 145, dbp: 95, gestationalAgeWeeks: 30, proteinuria: true });
    assert.strictEqual(r.value.diagnosis, 'preeclampsia');
    assert.strictEqual(r.severity, 'moderate');
});

// IVF
test('Age 38, AMH 0.3 = low success, recommend donor oocytes', () => {
    const r = engine.assessIVFCycleOutcome({ age: 38, amh: 0.3 });
    assert.ok(r.value.successRate < 25);
    assert.ok(r.recommendations.some(rec => rec.action === 'consider_donor_oocytes'));
});

test('Age 32, AMH 3 = success ~40%', () => {
    const r = engine.assessIVFCycleOutcome({ age: 32, amh: 3 });
    assert.ok(r.value.successRate >= 35);
});

// Adolescent GYN
test('Age 15 no menses = primary amenorrhea, karyotype + US', () => {
    const r = engine.assessAdolescentGyneProblem({ age: 15, lastPeriod: null });
    assert.strictEqual(r.value.diagnosis, 'primary_amenorrhea');
    assert.ok(r.recommendations.some(rec => rec.action === 'karyotype'));
});

test('PCOS suspect: irregular cycles + hirsutism + acne', () => {
    const r = engine.assessAdolescentGyneProblem({ age: 16, menarcheAge: 12, lastPeriod: '3 months ago', cycleRegularity: 'irregular', hirsutism: true, acne: true, bmi: 28 });
    assert.strictEqual(r.value.diagnosis, 'PCOS_suspect_Rotterdam');
});

test('Precocious puberty: age 8 with periods', () => {
    const r = engine.assessAdolescentGyneProblem({ age: 8, lastPeriod: '1 month ago' });
    assert.strictEqual(r.value.diagnosis, 'precocious_puberty');
    assert.ok(r.recommendations.some(rec => rec.action === 'brain_MRI'));
});

// Peds dehydration
test('Severe dehydration: 12% loss + cap refill 4s + dry = IV bolus', () => {
    const r = engine.assessPedsDehydration({ weightLossPercent: 12, ageMonths: 24, capillaryRefillSec: 4, skinTurgor: 'reduced', mucousMembranes: 'dry' });
    assert.strictEqual(r.value.severity, 'severe');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('IV_fluid')));
});

test('Mild dehydration: 3% loss, normal vitals = ORS', () => {
    const r = engine.assessPedsDehydration({ weightLossPercent: 3, ageMonths: 24, capillaryRefillSec: 1, skinTurgor: 'normal', mucousMembranes: 'moist' });
    assert.strictEqual(r.value.severity, 'mild');
    assert.ok(r.recommendations.some(rec => rec.action && rec.action.startsWith('oral_rehydration')));
});

// PEWS
test('PEWS 7 (behavior 3, cardio 2, resp 2) = high risk, rapid response', () => {
    const r = engine.assessPEWSPediatric({ ageYears: 5, behavior: 3, cardiovascular: 2, respiratory: 2 });
    assert.strictEqual(r.value.total, 7);
    assert.ok(r.recommendations.some(rec => rec.action === 'rapid_response_team_PICU_consult'));
});

test('PEWS 2 = low risk, no action needed', () => {
    const r = engine.assessPEWSPediatric({ ageYears: 5, behavior: 1, cardiovascular: 1, respiratory: 0 });
    assert.strictEqual(r.value.total, 2);
    assert.strictEqual(r.value.riskCategory, 'low_risk');
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures: ' + fails.join(', ')); process.exit(1); }
process.exit(0);
