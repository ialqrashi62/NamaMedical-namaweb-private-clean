// ============================================================================
// surgical_wave2_engine_unit_test.js — DB-free unit tests for the 10 Wave 2
// (Surgical) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./surgical_wave2_engine');

function runTests() {
    // 1) Surgical Oncology — borderline resectable must require tumor board before OR.
    assert.strictEqual(eng.checkTumorBoardSchedulingGate({ resectabilityStatus: 'borderline_resectable' }).tumorBoardRequiredBeforeOr, true);
    assert.strictEqual(eng.checkTumorBoardSchedulingGate({ resectabilityStatus: 'resectable' }).tumorBoardRequiredBeforeOr, false);

    // 2) Endocrine Surgery — nerve signal loss must trigger critical alert.
    assert.strictEqual(eng.checkNerveMonitoringAlert({ nerveSignalLost: true }).criticalAlert, true);
    assert.strictEqual(eng.checkNerveMonitoringAlert({ nerveSignalLost: false }).criticalAlert, false);

    // 3) Robotic Surgery — large docking angle deviation must trigger alert.
    assert.strictEqual(eng.checkDockingAngleSafety({ dockingAngleDegrees: 60, optimalAngleDegrees: 30 }).armCollisionRiskAlert, true);
    assert.strictEqual(eng.checkDockingAngleSafety({ dockingAngleDegrees: 32, optimalAngleDegrees: 30 }).armCollisionRiskAlert, false);

    // 4) Bariatric Surgery — missing clearance must block OR scheduling.
    assert.strictEqual(eng.checkBariatricOrSchedulingGate({ psychClearance: true, nutritionClearance: false }).orSchedulingAllowed, false);
    assert.strictEqual(eng.checkBariatricOrSchedulingGate({ psychClearance: true, nutritionClearance: true }).orSchedulingAllowed, true);

    // 5) Breast Surgery — high-suspicion imaging + benign pathology must flag discordance.
    assert.strictEqual(eng.checkBreastImagingPathologyConcordance({ imagingSuspicionLevel: 'high', pathologyResult: 'benign' }).tumorBoardRequired, true);
    assert.strictEqual(eng.checkBreastImagingPathologyConcordance({ imagingSuspicionLevel: 'high', pathologyResult: 'malignant' }).tumorBoardRequired, false);

    // 6) Trauma Surgery — shock physiology + positive FAST must activate MTP.
    assert.strictEqual(eng.checkMassiveTransfusionProtocol({ systolicBp: 80, heartRate: 130, positiveFast: true }).mtpActivated, true);
    assert.strictEqual(eng.checkMassiveTransfusionProtocol({ systolicBp: 120, heartRate: 80 }).mtpActivated, false);

    // 7) Colorectal Surgery — high leak risk score must suggest diverting ostomy.
    assert.strictEqual(eng.checkAnastomoticLeakRisk({ leakRiskScore: 9 }).divertingOstomyRecommended, true);
    assert.strictEqual(eng.checkAnastomoticLeakRisk({ leakRiskScore: 3 }).divertingOstomyRecommended, false);

    // 8) Neurosurgery — lesion near eloquent cortex must require IONM.
    assert.strictEqual(eng.checkIonmRequirement({ eloquentCortexProximityMm: 5 }).ionmOrAwakeMappingRequired, true);
    assert.strictEqual(eng.checkIonmRequirement({ eloquentCortexProximityMm: 25 }).ionmOrAwakeMappingRequired, false);

    // 9) Spine Surgery — Cauda Equina criteria must trigger emergency OR activation.
    assert.strictEqual(eng.checkCaudaEquinaEmergency({ saddleAnesthesia: true, bowelBladderDysfunction: true }).emergencyOrActivation, true);
    assert.strictEqual(eng.checkCaudaEquinaEmergency({ saddleAnesthesia: false }).emergencyOrActivation, false);

    // 10) Maxillofacial — panfacial trauma + airway compromise must trigger alert.
    assert.strictEqual(eng.checkAirwayCompromiseAlert({ panfacialTrauma: true, airwayCompromiseSigns: true }).immediateEntAnesthesiaCoManagement, true);
    assert.strictEqual(eng.checkAirwayCompromiseAlert({ panfacialTrauma: true, airwayCompromiseSigns: false }).immediateEntAnesthesiaCoManagement, false);

    console.log('surgical_wave2_engine_unit_test: all 10 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
