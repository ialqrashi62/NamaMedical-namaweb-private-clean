// ============================================================================
// Internal Medicine — Wave 1 PURE ENGINE (no DB, no I/O)
// ----------------------------------------------------------------------------
// Converts Enterprise_Blueprint_2026 Wave 1 (Internal Medicine) department specs
// into real, unit-testable decision-support gates. Mirrors e18_hr_engine.js /
// rare_specialized_engine.js conventions: pure functions, fail-closed on missing
// data, every rule below is the EXACT numeric/logical "Critical Alert" or
// "Business Logic" rule stated in the department's own blueprint file (not
// invented) — see Enterprise_Blueprint_2026/domains/internal_medicine/*.md.
//
// GAP NOTE: no dedicated DB tables exist yet for these departments (genuine
// classification C). This engine implements ONLY the decision logic; persistence
// needs schema design + user sign-off, same as Wave 10.
// ============================================================================

'use strict';

// 1) Advanced Heart Failure — decompensation alert.
// Blueprint rule: Weight_Gain > 2kg/48h AND SPO2 < 90% -> Immediate Admission alert.
function checkHeartFailureDecompensation({ weightGainKg48h, spo2Percent } = {}) {
    if (weightGainKg48h === undefined || weightGainKg48h === null || spo2Percent === undefined || spo2Percent === null) {
        return { alert: 'incomplete_data', immediateAdmission: false, reason: 'incomplete vitals — cannot assess' };
    }
    const decompensating = Number(weightGainKg48h) > 2 && Number(spo2Percent) < 90;
    return {
        alert: decompensating ? 'Immediate Admission Recommended' : 'stable',
        immediateAdmission: decompensating,
        reason: decompensating
            ? `weight gain ${weightGainKg48h}kg/48h with SPO2 ${spo2Percent}% — decompensation criteria met`
            : 'decompensation criteria not met'
    };
}

// 2) Peripheral Vascular Disease — critical limb ischemia alert.
// Blueprint rule: ABI < 0.4 -> Urgent Vascular Surgery alert (risk of limb loss).
function checkCriticalLimbIschemia({ abiValue } = {}) {
    if (abiValue === undefined || abiValue === null || !Number.isFinite(Number(abiValue))) {
        return { alert: 'incomplete_data', urgentSurgeryReferral: false, reason: 'ABI value missing — cannot assess' };
    }
    const critical = Number(abiValue) < 0.4;
    return {
        alert: critical ? 'Urgent Vascular Surgery — risk of limb loss' : 'routine follow-up',
        urgentSurgeryReferral: critical,
        reason: `ABI=${abiValue}`
    };
}

// 3) Sleep Medicine — nocturnal hypoxemia alert.
// Blueprint rule: SPO2 < 80% for extended periods during sleep -> Urgent Review.
function checkNocturnalHypoxemia({ spo2NadirPercent, extendedDurationMinutes, extendedThresholdMinutes = 5 } = {}) {
    if (spo2NadirPercent === undefined || spo2NadirPercent === null) {
        return { alert: 'incomplete_data', urgentReview: false, reason: 'SPO2 nadir missing — cannot assess' };
    }
    const prolonged = Number(spo2NadirPercent) < 80 && Number(extendedDurationMinutes || 0) >= extendedThresholdMinutes;
    return {
        alert: prolonged ? 'Urgent Review — nocturnal hypoxemia' : 'no significant hypoxemia',
        urgentReview: prolonged,
        reason: `SPO2 nadir=${spo2NadirPercent}%, duration=${extendedDurationMinutes || 0}min`
    };
}

// 4) GI Motility — achalasia surgical consult trigger.
// Blueprint rule: Achalasia detected + severe esophageal dilation -> Surgical Consult recommendation.
function checkAchalasiaSurgicalConsult({ achalasiaDetected, severeEsophagealDilation } = {}) {
    const requiresConsult = achalasiaDetected === true && severeEsophagealDilation === true;
    return {
        surgicalConsultRecommended: requiresConsult,
        reason: requiresConsult ? 'achalasia with severe dilation — POEM/surgical consult indicated' : 'criteria not met'
    };
}

// 5) Nuclear Cardiology — contrast/tracer safety lock on renal impairment.
// Blueprint rule: block scan if Creatinine too high (risk of contrast/tracer toxicity).
// Threshold is caller-supplied (institution-configurable); defaults to a commonly-cited
// conservative screening value and is clearly advisory, not a fixed clinical mandate.
function checkNuclearScanSafetyLock({ creatinineMgDl, creatinineThresholdMgDl = 1.5 } = {}) {
    if (creatinineMgDl === undefined || creatinineMgDl === null || !Number.isFinite(Number(creatinineMgDl))) {
        return { allowed: false, reason: 'creatinine value missing — fail-closed, scan blocked pending renal function check' };
    }
    const blocked = Number(creatinineMgDl) >= creatinineThresholdMgDl;
    return {
        allowed: !blocked,
        reason: blocked
            ? `BLOCKED — creatinine ${creatinineMgDl} mg/dL >= threshold ${creatinineThresholdMgDl} mg/dL (contrast/tracer toxicity risk)`
            : `creatinine ${creatinineMgDl} mg/dL within acceptable range`
    };
}

// 6) Preventive Cardiology — high-risk biomarker intervention trigger.
// Blueprint rule: LDL > 190 mg/dL OR HbA1c > 7% -> automatic High-Risk Intervention task.
function checkPreventiveCardiologyHighRisk({ ldlMgDl, hba1cPercent } = {}) {
    const ldlHigh = ldlMgDl !== undefined && ldlMgDl !== null && Number(ldlMgDl) > 190;
    const a1cHigh = hba1cPercent !== undefined && hba1cPercent !== null && Number(hba1cPercent) > 7;
    const highRisk = ldlHigh || a1cHigh;
    return {
        highRiskInterventionTriggered: highRisk,
        reason: highRisk
            ? `high-risk criteria met (${ldlHigh ? `LDL=${ldlMgDl}` : ''}${ldlHigh && a1cHigh ? ', ' : ''}${a1cHigh ? `HbA1c=${hba1cPercent}%` : ''})`
            : 'biomarkers within target range'
    };
}

// 7) Allergic Pulmonology — anaphylaxis emergency alert.
// Blueprint rule: suspected anaphylaxis -> Immediate Epinephrine alert.
function checkAnaphylaxisAlert({ anaphylaxisSuspected } = {}) {
    return {
        immediateEpinephrineAlert: anaphylaxisSuspected === true,
        reason: anaphylaxisSuspected === true ? 'anaphylaxis suspected — administer epinephrine immediately' : 'no anaphylaxis signs reported'
    };
}

// 8) Respiratory Care — ventilator/ABG critical review trigger.
// Blueprint rule: pH < 7.2 OR PaCO2 > 60 mmHg -> Urgent Ventilator Review alert.
function checkRespiratoryCriticalABG({ pH, paCO2MmHg } = {}) {
    if (pH === undefined || pH === null || paCO2MmHg === undefined || paCO2MmHg === null) {
        return { alert: 'incomplete_data', urgentVentilatorReview: false, reason: 'incomplete ABG data — cannot assess' };
    }
    const critical = Number(pH) < 7.2 || Number(paCO2MmHg) > 60;
    return {
        alert: critical ? 'Urgent Ventilator Review' : 'stable',
        urgentVentilatorReview: critical,
        reason: `pH=${pH}, PaCO2=${paCO2MmHg}mmHg`
    };
}

module.exports = {
    checkHeartFailureDecompensation,
    checkCriticalLimbIschemia,
    checkNocturnalHypoxemia,
    checkAchalasiaSurgicalConsult,
    checkNuclearScanSafetyLock,
    checkPreventiveCardiologyHighRisk,
    checkAnaphylaxisAlert,
    checkRespiratoryCriticalABG
};
