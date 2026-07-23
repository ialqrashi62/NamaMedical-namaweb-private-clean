// ============================================================================
// rare_specialized_engine_unit_test.js — DB-free unit tests for the 12 Wave 10
// (Rare & Super-Specialized) safety/compliance gates. Each test mirrors the exact
// "Testing & QA" acceptance case stated in the corresponding blueprint file under
// Enterprise_Blueprint_2026/domains/rare/*.md.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./rare_specialized_engine');

function runTests() {
    // 1) Space & Dive Medicine — neuro signs must force immediate recompression.
    {
        const r = eng.dcsRiskAssessment({ hasNeuroSigns: true, rapidAscent: true, depthMeters: 40 });
        assert.strictEqual(r.severity, 'severe');
        assert.strictEqual(r.requiresImmediateRecompression, true);
    }
    {
        const r = eng.dcsRiskAssessment({ hasNeuroSigns: false, rapidAscent: false, depthMeters: 10 });
        assert.strictEqual(r.requiresImmediateRecompression, false);
    }

    // 2) Complex Sleep — REM Behavior Disorder pattern must trigger neurology referral.
    {
        const r = eng.classifyParasomnia({ remAtoniaLoss: true, dreamEnactmentBehavior: true });
        assert.strictEqual(r.pattern, 'REM_Behavior_Disorder');
        assert.strictEqual(r.requiresNeurologyReferral, true);
    }
    {
        const r = eng.classifyParasomnia({ remAtoniaLoss: false, dreamEnactmentBehavior: false });
        assert.strictEqual(r.requiresNeurologyReferral, false);
    }

    // 3) Epilepsy Monitoring — discordant EEG/imaging localization must hold candidacy.
    {
        const r = eng.verifySurgicalCandidacy({ eegOnsetZone: 'left_temporal', imagingOnsetZone: 'right_frontal' });
        assert.strictEqual(r.candidacyStatus, 'hold');
    }
    {
        const r = eng.verifySurgicalCandidacy({ eegOnsetZone: 'left_temporal', imagingOnsetZone: 'left_temporal' });
        assert.strictEqual(r.candidacyStatus, 'eligible');
    }

    // 4) Stem Cell Therapy — must hard-block outside an approved trial/compassionate-use.
    {
        const r = eng.verifyProtocolCompliance({});
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.verifyProtocolCompliance({ approvedTrialId: 'TRIAL-001' });
        assert.strictEqual(r.allowed, true);
    }

    // 5) Fetal Surgery — must hard-block without full 4-party consensus (incl. Ethics).
    {
        const r = eng.verifyFetalSurgeryConsensus({ mfmSignoff: true, fetalSurgeonSignoff: true, neonatologySignoff: true, ethicsSignoff: false });
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.verifyFetalSurgeryConsensus({ mfmSignoff: true, fetalSurgeonSignoff: true, neonatologySignoff: true, ethicsSignoff: true });
        assert.strictEqual(r.allowed, true);
    }

    // 6) Fetal Medicine — complex CHD + skeletal anomaly must require genetics consult.
    {
        const r = eng.recognizeSyndromicPattern({ chdDetected: true, skeletalAnomalyDetected: true });
        assert.strictEqual(r.requiresGeneticsConsult, true);
    }

    // 7) DBS — trajectory within unsafe distance of a vessel must be blocked.
    {
        const r = eng.verifyTrajectorySafety({ distanceToVesselMm: 1, minSafeMarginMm: 3 });
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.verifyTrajectorySafety({ distanceToVesselMm: 5, minSafeMarginMm: 3 });
        assert.strictEqual(r.allowed, true);
    }

    // 8) Nuclear Medicine Therapy — isolation-requiring dose without a room must be blocked.
    {
        const r = eng.verifyIsolationGate({ requiresIsolation: true, isolationRoomAvailable: false });
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.verifyIsolationGate({ requiresIsolation: true, isolationRoomAvailable: true });
        assert.strictEqual(r.allowed, true);
    }

    // 9) Cryotherapy — 80% margin coverage must require an additional freeze cycle.
    {
        const r = eng.verifyMarginCoverage({ coveragePercent: 80, requiredPercent: 100 });
        assert.strictEqual(r.requiresAdditionalCycle, true);
    }
    {
        const r = eng.verifyMarginCoverage({ coveragePercent: 100, requiredPercent: 100 });
        assert.strictEqual(r.requiresAdditionalCycle, false);
    }

    // 10) Confocal Endomicroscopy — result must always be labeled advisory-only.
    {
        const r = eng.classifyConfocalPattern({ suspiciousPattern: true });
        assert.ok(r.label.includes('ADVISORY ONLY'));
        assert.strictEqual(r.pattern, 'suspicious');
    }

    // 11) Pharmacogenomics — HLA-B*15:02 + carbamazepine must be blocked without override.
    {
        const r = eng.checkGenotypeDrugInteraction({ allele: 'HLA-B*15:02', drug: 'carbamazepine' });
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.checkGenotypeDrugInteraction({ allele: 'HLA-B*15:02', drug: 'carbamazepine', physicianOverride: true });
        assert.strictEqual(r.allowed, true);
    }
    {
        const r = eng.checkGenotypeDrugInteraction({ allele: 'HLA-A*01:01', drug: 'ibuprofen' });
        assert.strictEqual(r.allowed, true);
    }

    // 12) Nanomedicine — must hard-block outside an approved IRB research protocol.
    {
        const r = eng.verifyNanomedicineProtocolCompliance({});
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.verifyNanomedicineProtocolCompliance({ approvedTrialId: 'NANO-TRIAL-01' });
        assert.strictEqual(r.allowed, true);
    }

    console.log('rare_specialized_engine_unit_test: all 12 department gates verified (24 assertions)');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
