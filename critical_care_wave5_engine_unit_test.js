// ============================================================================
// critical_care_wave5_engine_unit_test.js — DB-free unit tests for the 9 Wave 5
// (Critical Care & Emergency) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./critical_care_wave5_engine');

function runTests() {
    // 1) Stroke Unit — anticoagulation must block tPA.
    assert.strictEqual(eng.checkTpaEligibility({ onTherapeuticAnticoagulation: true }).tpaAllowed, false);
    assert.strictEqual(eng.checkTpaEligibility({}).tpaAllowed, true);

    // 2) Toxicology Emergency — pinpoint pupils + resp depression must match naloxone.
    assert.strictEqual(eng.matchToxidromeAntidote({ pinpointPupils: true, respiratoryDepression: true }).antidote, 'naloxone');
    assert.strictEqual(eng.matchToxidromeAntidote({ pinpointPupils: false }).antidote, null);

    // 3) Observation Unit — 21h without disposition must trigger mandatory alert.
    assert.strictEqual(eng.checkObservationDispositionAlert({ hoursInUnit: 21, dispositionDocumented: false }).mandatoryAlert, true);
    assert.strictEqual(eng.checkObservationDispositionAlert({ hoursInUnit: 10 }).mandatoryAlert, false);

    // 4) Minor Surgery ER — tendon/nerve involvement must require surgical consult.
    assert.strictEqual(eng.checkWoundComplexityRouting({ suspectedTendonNerveJointInvolvement: true }).surgicalConsultRequired, true);
    assert.strictEqual(eng.checkWoundComplexityRouting({ suspectedTendonNerveJointInvolvement: false }).bedsideClosureAllowed, true);

    // 5) Neuro ICU — full Cushing's Triad must trigger herniation alert.
    assert.strictEqual(eng.checkCushingsTriad({ hypertension: true, bradycardia: true, irregularRespirations: true }).herniationEmergencyAlert, true);
    assert.strictEqual(eng.checkCushingsTriad({ hypertension: true, bradycardia: false }).herniationEmergencyAlert, false);

    // 6) Oncology ICU — ANC<500 + fever must trigger 1h antibiotic SLA.
    assert.strictEqual(eng.checkOncologyIcuDualSurveillance({ ancValue: 200, temperatureCelsius: 38.5 }).oneHourAntibioticSla, true);
    assert.strictEqual(eng.checkOncologyIcuDualSurveillance({ uricAcidHigh: true }).urgentRasburicaseHydration, true);
    assert.strictEqual(eng.checkOncologyIcuDualSurveillance({ ancValue: 3000, temperatureCelsius: 37 }).oneHourAntibioticSla, false);

    // 7) Transplant ICU — fever within 30 days must trigger mandatory dual workup.
    assert.strictEqual(eng.checkTransplantFeverWorkup({ daysPostTransplant: 10, feverPresent: true }).mandatoryDualWorkup, true);
    assert.strictEqual(eng.checkTransplantFeverWorkup({ daysPostTransplant: 40, feverPresent: true }).mandatoryDualWorkup, false);

    // 8) HBOT — undocumented or unresolved pneumothorax must block session.
    assert.strictEqual(eng.checkHbotSafetyGate({}).sessionAllowed, false);
    assert.strictEqual(eng.checkHbotSafetyGate({ chestXrayStatus: 'unresolved_pneumothorax' }).sessionAllowed, false);
    assert.strictEqual(eng.checkHbotSafetyGate({ chestXrayStatus: 'clear' }).sessionAllowed, true);

    // 9) Trauma Center — penetrating torso injury must trigger Full activation despite stable vitals.
    assert.strictEqual(eng.checkTraumaActivationLevel({ penetratingTorsoInjury: true, stableVitals: true }).activationLevel, 'Full');
    assert.strictEqual(eng.checkTraumaActivationLevel({ penetratingTorsoInjury: false, physiologicCriteriaMet: false }).activationLevel, 'Partial');

    console.log('critical_care_wave5_engine_unit_test: all 9 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
