// ============================================================================
// internal_medicine_wave1_engine_batch3_unit_test.js — DB-free unit tests for
// Wave 1 (Internal Medicine, batch 3) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./internal_medicine_wave1_engine_batch3');

function runTests() {
    // 1) Cardio-Obstetrics — BP>160/110 must trigger urgent OBGYN+Cardiology alert.
    assert.strictEqual(eng.checkPreeclampsiaAlert({ systolicBp: 170, diastolicBp: 115 }).urgentObgynCardiologyAlert, true);
    assert.strictEqual(eng.checkPreeclampsiaAlert({ systolicBp: 120, diastolicBp: 80 }).urgentObgynCardiologyAlert, false);

    // 2) Allergy/Asthma — rescue inhaler >2x/week + declining PFT must trigger step-up.
    assert.strictEqual(eng.checkStepUpTherapyNeeded({ rescueInhalerUsesPerWeek: 4, pftDeclining: true }).stepUpRecommended, true);
    assert.strictEqual(eng.checkStepUpTherapyNeeded({ rescueInhalerUsesPerWeek: 4, pftDeclining: false }).stepUpRecommended, false);

    // 3) Metabolic Bone — calcium>12 must trigger urgent endocrinology review.
    assert.strictEqual(eng.checkHypercalcemicCrisis({ calciumMgDl: 13 }).urgentEndocrinologyReview, true);
    assert.strictEqual(eng.checkHypercalcemicCrisis({ calciumMgDl: 9.5 }).urgentEndocrinologyReview, false);

    // 4) Obesity Medicine — plateau >=4 weeks must trigger regimen re-evaluation.
    assert.strictEqual(eng.checkWeightLossPlateau({ plateauDurationWeeks: 5 }).regimenReevaluationTriggered, true);
    assert.strictEqual(eng.checkWeightLossPlateau({ plateauDurationWeeks: 2 }).regimenReevaluationTriggered, false);

    // 5) Clinical Immunology — 8+ ear infections/year must trigger urgent referral.
    assert.strictEqual(eng.checkPidReferral({ earInfectionsPerYear: 9 }).urgentImmunologyReferral, true);
    assert.strictEqual(eng.checkPidReferral({ earInfectionsPerYear: 2 }).urgentImmunologyReferral, false);

    // 6) Autoimmune — full lupus nephritis triad must trigger urgent workup.
    assert.strictEqual(eng.checkLupusNephritisRisk({ antiDsDnaRising: true, lowComplement: true, newProteinuria: true }).urgentLupusNephritisWorkup, true);
    assert.strictEqual(eng.checkLupusNephritisRisk({ antiDsDnaRising: true, lowComplement: true, newProteinuria: false }).urgentLupusNephritisWorkup, false);

    // 7) Tropical Medicine — severe malaria criteria must trigger urgent ICU+artesunate.
    assert.strictEqual(eng.checkSevereMalariaCriteria({ impairedConsciousness: true }).urgentIcuIvArtesunate, true);
    assert.strictEqual(eng.checkSevereMalariaCriteria({ parasitemiaPercent: 8 }).urgentIcuIvArtesunate, true);
    assert.strictEqual(eng.checkSevereMalariaCriteria({}).urgentIcuIvArtesunate, false);

    // 8) Vaccination — documented contraindication must hard-block unless overridden.
    assert.strictEqual(eng.checkVaccinationContraindication({ documentedContraindication: true }).allowed, false);
    assert.strictEqual(eng.checkVaccinationContraindication({ documentedContraindication: true, physicianOverride: true }).allowed, true);
    assert.strictEqual(eng.checkVaccinationContraindication({ documentedContraindication: false }).allowed, true);

    console.log('internal_medicine_wave1_engine_batch3_unit_test: all 8 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
