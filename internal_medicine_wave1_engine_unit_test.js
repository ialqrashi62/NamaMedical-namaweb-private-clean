// ============================================================================
// internal_medicine_wave1_engine_unit_test.js — DB-free unit tests for the 8
// Wave 1 (Internal Medicine, batch 1) safety/alert gates. Each test mirrors the
// exact "Business Logic" / "Critical Alert" rule stated in the corresponding
// blueprint file under Enterprise_Blueprint_2026/domains/internal_medicine/*.md.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./internal_medicine_wave1_engine');

function runTests() {
    // 1) Heart Failure — weight gain >2kg/48h + SPO2<90% must trigger immediate admission.
    {
        const r = eng.checkHeartFailureDecompensation({ weightGainKg48h: 2.5, spo2Percent: 88 });
        assert.strictEqual(r.immediateAdmission, true);
    }
    {
        const r = eng.checkHeartFailureDecompensation({ weightGainKg48h: 1, spo2Percent: 95 });
        assert.strictEqual(r.immediateAdmission, false);
    }

    // 2) Peripheral Vascular — ABI < 0.4 must trigger urgent surgery referral.
    {
        const r = eng.checkCriticalLimbIschemia({ abiValue: 0.35 });
        assert.strictEqual(r.urgentSurgeryReferral, true);
    }
    {
        const r = eng.checkCriticalLimbIschemia({ abiValue: 0.9 });
        assert.strictEqual(r.urgentSurgeryReferral, false);
    }

    // 3) Sleep Medicine — SPO2<80% for extended duration must trigger urgent review.
    {
        const r = eng.checkNocturnalHypoxemia({ spo2NadirPercent: 75, extendedDurationMinutes: 10 });
        assert.strictEqual(r.urgentReview, true);
    }
    {
        const r = eng.checkNocturnalHypoxemia({ spo2NadirPercent: 92, extendedDurationMinutes: 10 });
        assert.strictEqual(r.urgentReview, false);
    }

    // 4) GI Motility — achalasia + severe dilation must recommend surgical consult.
    {
        const r = eng.checkAchalasiaSurgicalConsult({ achalasiaDetected: true, severeEsophagealDilation: true });
        assert.strictEqual(r.surgicalConsultRecommended, true);
    }
    {
        const r = eng.checkAchalasiaSurgicalConsult({ achalasiaDetected: true, severeEsophagealDilation: false });
        assert.strictEqual(r.surgicalConsultRecommended, false);
    }

    // 5) Nuclear Cardiology — high creatinine must block the scan (fail-closed on missing data too).
    {
        const r = eng.checkNuclearScanSafetyLock({ creatinineMgDl: 2.0 });
        assert.strictEqual(r.allowed, false);
    }
    {
        const r = eng.checkNuclearScanSafetyLock({ creatinineMgDl: 0.9 });
        assert.strictEqual(r.allowed, true);
    }
    {
        const r = eng.checkNuclearScanSafetyLock({});
        assert.strictEqual(r.allowed, false);
    }

    // 6) Preventive Cardiology — LDL>190 or HbA1c>7% must trigger high-risk intervention.
    {
        const r = eng.checkPreventiveCardiologyHighRisk({ ldlMgDl: 200, hba1cPercent: 5.5 });
        assert.strictEqual(r.highRiskInterventionTriggered, true);
    }
    {
        const r = eng.checkPreventiveCardiologyHighRisk({ ldlMgDl: 100, hba1cPercent: 8 });
        assert.strictEqual(r.highRiskInterventionTriggered, true);
    }
    {
        const r = eng.checkPreventiveCardiologyHighRisk({ ldlMgDl: 100, hba1cPercent: 5.5 });
        assert.strictEqual(r.highRiskInterventionTriggered, false);
    }

    // 7) Allergic Pulmonology — suspected anaphylaxis must trigger immediate epinephrine alert.
    {
        const r = eng.checkAnaphylaxisAlert({ anaphylaxisSuspected: true });
        assert.strictEqual(r.immediateEpinephrineAlert, true);
    }

    // 8) Respiratory Care — pH<7.2 or PaCO2>60 must trigger urgent ventilator review.
    {
        const r = eng.checkRespiratoryCriticalABG({ pH: 7.15, paCO2MmHg: 45 });
        assert.strictEqual(r.urgentVentilatorReview, true);
    }
    {
        const r = eng.checkRespiratoryCriticalABG({ pH: 7.4, paCO2MmHg: 65 });
        assert.strictEqual(r.urgentVentilatorReview, true);
    }
    {
        const r = eng.checkRespiratoryCriticalABG({ pH: 7.4, paCO2MmHg: 40 });
        assert.strictEqual(r.urgentVentilatorReview, false);
    }

    console.log('internal_medicine_wave1_engine_unit_test: all 8 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
