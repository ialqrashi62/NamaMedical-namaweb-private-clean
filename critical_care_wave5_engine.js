// ============================================================================
// Critical Care & Emergency — Wave 5 PURE ENGINE (no DB, no I/O)
// Converts Enterprise_Blueprint_2026 Wave 5 C-classified department specs into
// real, unit-testable decision-support gates. Same conventions as prior waves.
// ============================================================================

'use strict';

// 1) Stroke Unit — tPA contraindication gate.
// Blueprint rule: patient on therapeutic anticoagulation (or other contraindication) within
// window must block tPA administration (zero-tolerance safety rule).
function checkTpaEligibility({ onTherapeuticAnticoagulation, otherContraindication } = {}) {
    const contraindicated = onTherapeuticAnticoagulation === true || otherContraindication === true;
    return {
        tpaAllowed: !contraindicated,
        reason: contraindicated ? 'BLOCKED — contraindication present (e.g. therapeutic anticoagulation)' : 'no contraindications identified — tPA may proceed if otherwise eligible'
    };
}

// 2) Toxicology Emergency — toxidrome-antidote matching.
// Blueprint rule: pinpoint pupils + respiratory depression -> naloxone match (opioid toxidrome).
function matchToxidromeAntidote({ pinpointPupils, respiratoryDepression } = {}) {
    if (pinpointPupils === true && respiratoryDepression === true) {
        return { toxidrome: 'opioid', antidote: 'naloxone', pharmacyPageRequired: true };
    }
    return { toxidrome: 'unclassified', antidote: null, pharmacyPageRequired: false };
}

// 3) Observation Unit — 23-hour disposition compliance gate.
// Blueprint rule: hard alert at 20-hour mark requiring a documented disposition decision
// before the 23-hour billing/regulatory limit.
function checkObservationDispositionAlert({ hoursInUnit, dispositionDocumented } = {}) {
    if (hoursInUnit === undefined || hoursInUnit === null) {
        return { mandatoryAlert: false, reason: 'time-in-unit missing — cannot assess' };
    }
    const alertDue = Number(hoursInUnit) >= 20 && dispositionDocumented !== true;
    return {
        mandatoryAlert: alertDue,
        reason: alertDue
            ? `${hoursInUnit}h in unit (>=20h) without documented disposition — mandatory alert before 23h limit`
            : 'within compliance window or disposition already documented'
    };
}

// 4) Minor Surgery ER — tendon/nerve involvement routing gate.
// Blueprint rule: suspected tendon/nerve/joint involvement must route to surgical consult
// rather than bedside closure.
function checkWoundComplexityRouting({ suspectedTendonNerveJointInvolvement } = {}) {
    const requiresSurgicalConsult = suspectedTendonNerveJointInvolvement === true;
    return {
        surgicalConsultRequired: requiresSurgicalConsult,
        bedsideClosureAllowed: !requiresSurgicalConsult,
        reason: requiresSurgicalConsult
            ? 'suspected tendon/nerve/joint involvement — surgical consult required, not bedside closure'
            : 'no complex structure involvement suspected — bedside repair may proceed'
    };
}

// 5) Neuro ICU — Cushing's Triad herniation alert.
// Blueprint rule: hypertension + bradycardia + irregular respirations -> immediate herniation emergency.
function checkCushingsTriad({ hypertension, bradycardia, irregularRespirations } = {}) {
    const triad = hypertension === true && bradycardia === true && irregularRespirations === true;
    return {
        herniationEmergencyAlert: triad,
        reason: triad ? "Cushing's Triad present — immediate herniation emergency, neurosurgery + hyperosmolar therapy" : "Cushing's Triad criteria not met"
    };
}

// 6) Oncology ICU — dual surveillance (febrile neutropenia + tumor lysis syndrome).
// Blueprint rule: ANC low + fever -> 1-hour antibiotic SLA; TLS criteria (uric acid/potassium
// shifts) -> urgent rasburicase/hydration.
function checkOncologyIcuDualSurveillance({ ancValue, temperatureCelsius, uricAcidHigh, potassiumHigh } = {}) {
    const febrileNeutropenia = ancValue !== undefined && ancValue !== null && Number(ancValue) < 500
        && temperatureCelsius !== undefined && temperatureCelsius !== null && Number(temperatureCelsius) >= 38.3;
    const tumorLysisSyndrome = uricAcidHigh === true || potassiumHigh === true;
    return {
        febrileNeutropeniaAlert: febrileNeutropenia,
        oneHourAntibioticSla: febrileNeutropenia,
        tumorLysisSyndromeAlert: tumorLysisSyndrome,
        urgentRasburicaseHydration: tumorLysisSyndrome,
        reason: `${febrileNeutropenia ? 'febrile neutropenia — 1h antibiotic SLA. ' : ''}${tumorLysisSyndrome ? 'TLS criteria met — urgent rasburicase/hydration.' : ''}`.trim() || 'no dual-surveillance criteria met'
    };
}

// 7) Transplant ICU — mandatory dual rejection/infection workup.
// Blueprint rule: fever in the first 30 days post-transplant -> mandatory simultaneous
// rejection AND infection workup (not either/or).
function checkTransplantFeverWorkup({ daysPostTransplant, feverPresent } = {}) {
    if (daysPostTransplant === undefined || daysPostTransplant === null) {
        return { mandatoryDualWorkup: false, reason: 'transplant date data missing — cannot assess' };
    }
    const mandatory = feverPresent === true && Number(daysPostTransplant) <= 30;
    return {
        mandatoryDualWorkup: mandatory,
        reason: mandatory
            ? `fever on day ${daysPostTransplant} post-transplant (<=30) — mandatory simultaneous rejection + infection workup`
            : 'dual-workup criteria not met'
    };
}

// 8) HBOT — pneumothorax safety gate.
// Blueprint rule: hard block session for any patient with an unresolved pneumothorax
// (or undocumented chest X-ray status).
function checkHbotSafetyGate({ chestXrayStatus } = {}) {
    if (chestXrayStatus === undefined || chestXrayStatus === null || chestXrayStatus === 'undocumented') {
        return { sessionAllowed: false, reason: 'BLOCKED — chest X-ray status undocumented, session held until cleared' };
    }
    const blocked = chestXrayStatus === 'unresolved_pneumothorax';
    return {
        sessionAllowed: !blocked,
        reason: blocked ? 'BLOCKED — unresolved pneumothorax, absolute HBOT contraindication' : 'chest X-ray cleared — session may proceed'
    };
}

// 9) Trauma Center — Level I activation classifier.
// Blueprint rule: anatomic criteria (e.g. gunshot wound to chest) must trigger Full activation
// even with stable vitals (zero-tolerance under-triage rule).
function checkTraumaActivationLevel({ penetratingTorsoInjury, stableVitals, physiologicCriteriaMet } = {}) {
    const fullActivation = penetratingTorsoInjury === true || physiologicCriteriaMet === true;
    return {
        activationLevel: fullActivation ? 'Full' : 'Partial',
        reason: fullActivation
            ? (penetratingTorsoInjury === true
                ? 'penetrating torso injury (anatomic criteria) — Full activation regardless of stable vitals'
                : 'physiologic criteria met — Full activation')
            : 'criteria for Full activation not met'
    };
}

module.exports = {
    checkTpaEligibility,
    matchToxidromeAntidote,
    checkObservationDispositionAlert,
    checkWoundComplexityRouting,
    checkCushingsTriad,
    checkOncologyIcuDualSurveillance,
    checkTransplantFeverWorkup,
    checkHbotSafetyGate,
    checkTraumaActivationLevel
};
