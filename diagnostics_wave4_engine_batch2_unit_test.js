// diagnostics_wave4_engine_batch2_unit_test.js
'use strict';
const assert = require('assert');
const engine = require('./diagnostics_wave4_engine_batch2');

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}: ${e.message}`); failed++; fails.push(name); }
}

console.log('diagnostics_wave4_engine_batch2 unit tests\n');

// BI-RADS
test('BI-RADS 1 = negative, routine screening', () => {
    const r = engine.interpretBIRADS({ birads: '1' });
    assert.strictEqual(r.value.management, 'continue_routine_screening');
    assert.strictEqual(r.value.riskMalignancy, '~0%');
});

test('BI-RADS 3 = 6mo followup, low risk', () => {
    const r = engine.interpretBIRADS({ birads: '3' });
    assert.strictEqual(r.value.management, '6_month_followup');
});

test('BI-RADS 4A = biopsy, 2-10% risk', () => {
    const r = engine.interpretBIRADS({ birads: '4A' });
    assert.strictEqual(r.value.management, 'tissue_diagnosis_biopsy');
    assert.ok(r.recommendations.some(rec => rec.action === 'core_needle_biopsy'));
});

test('BI-RADS 5 = highly suspicious, biopsy + treatment', () => {
    const r = engine.interpretBIRADS({ birads: '5' });
    assert.strictEqual(r.value.riskMalignancy, '>95%');
    assert.strictEqual(r.severity, 'critical');
});

// Bacterial sensitivities
test('E. coli urine susceptible to nitrofurantoin = de-escalate', () => {
    const r = engine.interpretBacterialSensitivities({
        organism: 'E. coli', source: 'urine',
        sensitivities: [
            { antibiotic: 'nitrofurantoin', susceptibility: 'S' },
            { antibiotic: 'ciprofloxacin', susceptibility: 'R' },
            { antibiotic: 'TMP-SMX', susceptibility: 'I' }
        ]
    });
    assert.strictEqual(r.value.recommended[0], 'nitrofurantoin');
});

test('MRSA pattern (oxacillin R + vancomycin S)', () => {
    const r = engine.interpretBacterialSensitivities({
        organism: 'Staph aureus', source: 'blood',
        sensitivities: [
            { antibiotic: 'oxacillin', susceptibility: 'R' },
            { antibiotic: 'vancomycin', susceptibility: 'S' }
        ]
    });
    assert.ok(r.value.resistanceNotes.includes('MRSA pattern'));
});

test('ESBL pattern (ceftriaxone + cefepime R)', () => {
    const r = engine.interpretBacterialSensitivities({
        organism: 'E. coli', source: 'urine',
        sensitivities: [
            { antibiotic: 'ceftriaxone', susceptibility: 'R' },
            { antibiotic: 'cefepime', susceptibility: 'R' },
            { antibiotic: 'aztreonam', susceptibility: 'R' },
            { antibiotic: 'meropenem', susceptibility: 'S' }
        ]
    });
    assert.ok(r.value.resistanceNotes.includes('ESBL'));
});

// PFT
test('Obstructive pattern: FEV1/FVC 0.6, FEV1 60% = moderate', () => {
    const r = engine.interpretPFT({ fev1Actual: 1.8, fev1Predicted: 3.0, fvcActual: 3.0, fvcPredicted: 3.8, fev1FvcRatio: 0.6, tlcActual: 5.5, tlcPredicted: 6.0, dlcoActual: 20, dlcoPredicted: 25 });
    assert.strictEqual(r.value.pattern, 'obstructive');
    assert.strictEqual(r.value.severity, 'moderate');
});

test('Restrictive pattern: FEV1/FVC 0.85, TLC 70% = mild restrictive', () => {
    const r = engine.interpretPFT({ fev1Actual: 2.0, fev1Predicted: 3.0, fvcActual: 2.4, fvcPredicted: 3.5, fev1FvcRatio: 0.85, tlcActual: 4.0, tlcPredicted: 6.0 });
    assert.strictEqual(r.value.pattern, 'restrictive');
});

// GCS
test('GCS 6 (E2V2M2) = severe, intubate + ICU', () => {
    const r = engine.interpretGCS({ eye: 2, verbal: 2, motor: 2 });
    assert.strictEqual(r.value.score, 6);
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'intubate_if_not_already'));
});

test('GCS 15 = normal, CT if trauma', () => {
    const r = engine.interpretGCS({ eye: 4, verbal: 5, motor: 6 });
    assert.strictEqual(r.value.score, 15);
    assert.strictEqual(r.severity, 'low');
});

test('GCS intubated = verbal 1T', () => {
    const r = engine.interpretGCS({ eye: 3, motor: 4, intubated: true });
    assert.strictEqual(r.value.score, 8);
    assert.strictEqual(r.severity, 'critical');
});

// Cardiac biomarkers
test('Troponin 0.5 + chest pain = ACS pathway, high severity', () => {
    const r = engine.interpretCardiacBiomarkers({ troponin: 0.5, presentation: 'chest_pain' });
    assert.ok(r.value.interpretations.includes('troponin_elevated'));
    assert.strictEqual(r.severity, 'high');
    assert.ok(r.recommendations.some(rec => rec.action === 'echocardiogram_within_24h'));
});

test('BNP 1500 = severe HF, critical', () => {
    const r = engine.interpretCardiacBiomarkers({ bnp: 1500, presentation: 'dyspnea' });
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'emergent_cardiologist_consult'));
});

test('All normal = low severity', () => {
    const r = engine.interpretCardiacBiomarkers({ troponin: 0.01, bnp: 50, dDimer: 0.3, presentation: 'routine' });
    assert.strictEqual(r.severity, 'low');
});

// Sleep
test('AHI 35 = severe OSA, PAP titration', () => {
    const r = engine.interpretSleepStudy({ ahi: 35, lowestSpO2: 75, odi: 30 });
    assert.strictEqual(r.value.diagnosis, 'severe_OSA');
    assert.strictEqual(r.severity, 'critical');
    assert.ok(r.recommendations.some(rec => rec.action === 'PAP_titration_study'));
});

test('AHI 8 = mild OSA, lifestyle', () => {
    const r = engine.interpretSleepStudy({ ahi: 8, lowestSpO2: 88, odi: 5 });
    assert.strictEqual(r.value.diagnosis, 'mild_OSA');
});

test('AHI 2 = normal', () => {
    const r = engine.interpretSleepStudy({ ahi: 2, lowestSpO2: 94, odi: 1 });
    assert.strictEqual(r.value.diagnosis, 'normal');
});

test('Positional OSA: supine 40, non-supine 10 = positional', () => {
    const r = engine.interpretSleepStudy({ ahi: 25, supineAhi: 40, nremAhi: 10, lowestSpO2: 82 });
    assert.ok(r.recommendations.some(rec => rec.action === 'positional_therapy'));
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures: ' + fails.join(', ')); process.exit(1); }
process.exit(0);
