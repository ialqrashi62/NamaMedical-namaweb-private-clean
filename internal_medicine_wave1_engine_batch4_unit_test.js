// ============================================================================
// internal_medicine_wave1_engine_batch4_unit_test.js — DB-free unit tests for
// Wave 1 (Internal Medicine, batch 4, FINAL batch) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./internal_medicine_wave1_engine_batch4');

function runTests() {
    // 1) Clinical Nutrition — severe malnutrition + rapid feeding must trigger alert.
    assert.strictEqual(eng.checkRefeedingSyndromeRisk({ severeMalnutrition: true, rapidFeedingRate: true }).urgentElectrolyteCheckAlert, true);
    assert.strictEqual(eng.checkRefeedingSyndromeRisk({ severeMalnutrition: true, rapidFeedingRate: false }).urgentElectrolyteCheckAlert, false);

    // 2) Travel Medicine — <10 days before travel must block certificate.
    assert.strictEqual(eng.checkYellowFeverCertificateValidity({ daysBetweenVaccineAndTravel: 5 }).certificateValid, false);
    assert.strictEqual(eng.checkYellowFeverCertificateValidity({ daysBetweenVaccineAndTravel: 15 }).certificateValid, true);

    // 3) Cosmetic Dermatology — high-risk zone without cannula flag must block.
    assert.strictEqual(eng.checkInjectionVascularSafety({ highVascularRiskZone: true, cannulaTechniqueFlag: false }).allowed, false);
    assert.strictEqual(eng.checkInjectionVascularSafety({ highVascularRiskZone: true, cannulaTechniqueFlag: true }).allowed, true);
    assert.strictEqual(eng.checkInjectionVascularSafety({ highVascularRiskZone: false }).allowed, true);

    // 4) Dermatosurgery — reconstruction blocked until all margins clear.
    assert.strictEqual(eng.checkMohsReconstructionGate({ allMarginsClear: false }).allowed, false);
    assert.strictEqual(eng.checkMohsReconstructionGate({ allMarginsClear: true }).allowed, true);

    // 5) Dermato-Oncology — Breslow depth > 0.8mm must trigger SLNB referral.
    assert.strictEqual(eng.checkSentinelNodeBiopsyReferral({ breslowDepthMm: 1.2 }).sentinelNodeBiopsyReferral, true);
    assert.strictEqual(eng.checkSentinelNodeBiopsyReferral({ breslowDepthMm: 0.5 }).sentinelNodeBiopsyReferral, false);

    // 6) Phototherapy — erythema in previous session must block a dose increase.
    assert.strictEqual(eng.checkPhototherapyDoseGate({ erythemaInPreviousSession: true, requestedAction: 'increase' }).allowed, false);
    assert.strictEqual(eng.checkPhototherapyDoseGate({ erythemaInPreviousSession: true, requestedAction: 'hold' }).allowed, true);
    assert.strictEqual(eng.checkPhototherapyDoseGate({ erythemaInPreviousSession: false, requestedAction: 'increase' }).allowed, true);

    console.log('internal_medicine_wave1_engine_batch4_unit_test: all 6 department gates verified — Wave 1 C-departments 100% complete');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
