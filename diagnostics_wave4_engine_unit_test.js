// ============================================================================
// diagnostics_wave4_engine_unit_test.js — DB-free unit tests for the 9 Wave 4
// (Diagnostics) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./diagnostics_wave4_engine');

function runTests() {
    // 1) Nuclear Medicine — childbearing age without negative pregnancy test must block.
    assert.strictEqual(eng.checkRadioisotopePregnancyGate({ childbearingAge: true, pregnancyTestNegative: false }).allowed, false);
    assert.strictEqual(eng.checkRadioisotopePregnancyGate({ childbearingAge: true, pregnancyTestNegative: true }).allowed, true);
    assert.strictEqual(eng.checkRadioisotopePregnancyGate({ childbearingAge: false }).allowed, true);

    // 2) Immunology — result must always carry advisory-only disclaimer.
    assert.ok(eng.labelImmunologyPatternResult({ patternDetected: 'Speckled ANA' }).disclaimer.includes('ADVISORY ONLY'));
    assert.ok(eng.labelImmunologyPatternResult({ patternDetected: 'Speckled ANA' }).label.startsWith('supportive of'));

    // 3) Medical Genetics — Pathogenic classification must require geneticist sign-off.
    assert.strictEqual(eng.checkVariantReportReleaseGate({ classification: 'Pathogenic', geneticistSignoff: false }).releaseAllowed, false);
    assert.strictEqual(eng.checkVariantReportReleaseGate({ classification: 'Pathogenic', geneticistSignoff: true }).releaseAllowed, true);
    assert.strictEqual(eng.checkVariantReportReleaseGate({ classification: 'Benign' }).releaseAllowed, true);

    // 4) Toxicology — level above nomogram treatment line must trigger urgent NAC.
    assert.strictEqual(eng.checkAcetaminophenNomogramAlert({ levelMcgMl: 150, hoursPostIngestion: 6 }).urgentNacAlert, true);
    assert.strictEqual(eng.checkAcetaminophenNomogramAlert({ levelMcgMl: 10, hoursPostIngestion: 6 }).urgentNacAlert, false);

    // 5) EEG — continuous electrographic seizure without convulsions must trigger NCSE alert.
    assert.strictEqual(eng.checkNcseAlert({ continuousElectrographicSeizure: true, noMotorConvulsions: true }).ncseEmergencyAlert, true);
    assert.strictEqual(eng.checkNcseAlert({ continuousElectrographicSeizure: false }).ncseEmergencyAlert, false);

    // 6) EMG/NCS — rapid progression + demyelinating features must trigger GBS consult.
    assert.strictEqual(eng.checkGuillainBarreAlert({ rapidProgression: true, demyelinatingFeatures: true }).urgentNeurologyConsult, true);
    assert.strictEqual(eng.checkGuillainBarreAlert({ rapidProgression: true, demyelinatingFeatures: false }).urgentNeurologyConsult, false);

    // 7) Cerebral Angiography — extravasation must trigger immediate neurosurgical backup.
    assert.strictEqual(eng.checkContrastExtravasationAlert({ contrastExtravasationDetected: true }).immediateNeurosurgicalBackup, true);
    assert.strictEqual(eng.checkContrastExtravasationAlert({ contrastExtravasationDetected: false }).immediateNeurosurgicalBackup, false);

    // 8) Bronchial Angiography — >300mL/24h + dropping BP must trigger immediate IR activation.
    assert.strictEqual(eng.checkMassiveHemoptysisAlert({ bloodVolumeMl24h: 350, droppingBp: true }).immediateIrActivation, true);
    assert.strictEqual(eng.checkMassiveHemoptysisAlert({ bloodVolumeMl24h: 100, droppingBp: false }).immediateIrActivation, false);

    // 9) Sweat/Allergy Testing — insufficient volume must be non-diagnostic.
    assert.strictEqual(eng.checkSweatTestValidity({ sweatVolumeMicroliters: 5 }).diagnostic, false);
    assert.strictEqual(eng.checkSweatTestValidity({ sweatVolumeMicroliters: 20 }).diagnostic, true);

    console.log('diagnostics_wave4_engine_unit_test: all 9 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
