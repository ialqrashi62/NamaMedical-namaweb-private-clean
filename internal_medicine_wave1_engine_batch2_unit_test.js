// ============================================================================
// internal_medicine_wave1_engine_batch2_unit_test.js — DB-free unit tests for
// Wave 1 (Internal Medicine, batch 2) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./internal_medicine_wave1_engine_batch2');

function runTests() {
    // 1) Hepatology — bilirubin>5 or INR>2.0 must trigger liver failure alert.
    assert.strictEqual(eng.checkLiverFailureAlert({ bilirubinMgDl: 6, inr: 1.0 }).urgentLiverFailureAlert, true);
    assert.strictEqual(eng.checkLiverFailureAlert({ bilirubinMgDl: 1, inr: 2.5 }).urgentLiverFailureAlert, true);
    assert.strictEqual(eng.checkLiverFailureAlert({ bilirubinMgDl: 1, inr: 1.0 }).urgentLiverFailureAlert, false);

    // 2) Pancreato-Biliary — lipase > 3x ULN must trigger acute pancreatitis alert.
    assert.strictEqual(eng.checkAcutePancreatitisAlert({ lipaseValue: 400, upperLimitNormal: 100 }).acutePancreatitisAlert, true);
    assert.strictEqual(eng.checkAcutePancreatitisAlert({ lipaseValue: 200, upperLimitNormal: 100 }).acutePancreatitisAlert, false);

    // 3) Renal Transplant — creatinine rise > 20% must trigger rejection workup.
    assert.strictEqual(eng.checkTransplantRejectionRisk({ currentCreatinineMgDl: 1.5, baselineCreatinineMgDl: 1.0 }).urgentRejectionWorkup, true);
    assert.strictEqual(eng.checkTransplantRejectionRisk({ currentCreatinineMgDl: 1.05, baselineCreatinineMgDl: 1.0 }).urgentRejectionWorkup, false);

    // 4) Medical Oncology — ANC<1000 must block chemo unless physician override.
    assert.strictEqual(eng.checkChemoSafetyLock({ ancValue: 500 }).allowed, false);
    assert.strictEqual(eng.checkChemoSafetyLock({ ancValue: 500, physicianOverride: true }).allowed, true);
    assert.strictEqual(eng.checkChemoSafetyLock({ ancValue: 2000 }).allowed, true);

    // 5) Hematology — WBC>100,000 must trigger leukapheresis consideration.
    assert.strictEqual(eng.checkHyperleukocytosisAlert({ wbcCount: 150000 }).urgentLeukapheresisConsideration, true);
    assert.strictEqual(eng.checkHyperleukocytosisAlert({ wbcCount: 8000 }).urgentLeukapheresisConsideration, false);

    // 6) Coagulation/Anemia — Hgb<7 or INR>5.0 must trigger urgent transfusion/reversal.
    assert.strictEqual(eng.checkTransfusionReversalAlert({ hemoglobinGdl: 6, inr: 1.0 }).urgentTransfusionReversalAlert, true);
    assert.strictEqual(eng.checkTransfusionReversalAlert({ hemoglobinGdl: 12, inr: 6.0 }).urgentTransfusionReversalAlert, true);
    assert.strictEqual(eng.checkTransfusionReversalAlert({ hemoglobinGdl: 12, inr: 1.0 }).urgentTransfusionReversalAlert, false);

    // 7) BMT Unit — fever>38.3C during neutropenic phase must trigger protocol.
    assert.strictEqual(eng.checkFebrileNeutropeniaProtocol({ temperatureCelsius: 38.5, inNeutropenicPhase: true }).protocolTriggered, true);
    assert.strictEqual(eng.checkFebrileNeutropeniaProtocol({ temperatureCelsius: 38.5, inNeutropenicPhase: false }).protocolTriggered, false);

    // 8) Gynecologic Oncology — significant CA-125 rise must trigger recurrence workup.
    assert.strictEqual(eng.checkGynOncRecurrenceRisk({ currentCA125: 60, nadirCA125: 20 }).recurrenceWorkupAlert, true);
    assert.strictEqual(eng.checkGynOncRecurrenceRisk({ currentCA125: 22, nadirCA125: 20 }).recurrenceWorkupAlert, false);

    console.log('internal_medicine_wave1_engine_batch2_unit_test: all 8 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
