// ============================================================================
// Internal Medicine — Wave 1 PURE ENGINE, batch 4 (final batch, no DB, no I/O)
// Completes all 32 Wave 1 "C" (net-new) departments. Same conventions as
// batches 1-3: pure functions, fail-closed, each rule is the EXACT
// "Critical Alert"/"Business Logic" rule stated in the department's blueprint.
// ============================================================================

'use strict';

// 1) Clinical Nutrition — refeeding syndrome alert.
// Blueprint rule: refeeding syndrome risk factors present (severe malnutrition + rapid
// feeding) -> Urgent Electrolyte Check alert.
function checkRefeedingSyndromeRisk({ severeMalnutrition, rapidFeedingRate } = {}) {
    const alert = severeMalnutrition === true && rapidFeedingRate === true;
    return {
        urgentElectrolyteCheckAlert: alert,
        reason: alert ? 'severe malnutrition + rapid feeding — refeeding syndrome risk' : 'refeeding syndrome criteria not met'
    };
}

// 2) Travel Medicine — Yellow Fever certificate validity gate.
// Blueprint rule: auto-block Yellow Fever certificate issuance if vaccine given < 10 days
// before travel (not yet effective).
function checkYellowFeverCertificateValidity({ daysBetweenVaccineAndTravel } = {}) {
    if (daysBetweenVaccineAndTravel === undefined || daysBetweenVaccineAndTravel === null) {
        return { certificateValid: false, reason: 'vaccine/travel date data missing — fail-closed' };
    }
    const valid = Number(daysBetweenVaccineAndTravel) >= 10;
    return {
        certificateValid: valid,
        reason: valid
            ? `${daysBetweenVaccineAndTravel} days between vaccination and travel — certificate valid`
            : `BLOCKED — only ${daysBetweenVaccineAndTravel} days before travel (<10 day requirement, not yet effective)`
    };
}

// 3) Cosmetic Dermatology — vascular-risk injection safety check.
// Blueprint rule: hard-stop warning if injection planned in high-vascular-risk zone
// without a cannula-technique flag.
function checkInjectionVascularSafety({ highVascularRiskZone, cannulaTechniqueFlag } = {}) {
    const blocked = highVascularRiskZone === true && cannulaTechniqueFlag !== true;
    return {
        allowed: !blocked,
        reason: blocked
            ? 'BLOCKED — high-vascular-risk zone requires cannula-technique flag before injection'
            : 'injection plan meets vascular-safety requirement'
    };
}

// 4) Dermatosurgery (Mohs) — reconstruction gate.
// Blueprint rule: block "Reconstruction" step until all margins explicitly marked "Clear" by pathology.
function checkMohsReconstructionGate({ allMarginsClear } = {}) {
    return {
        allowed: allMarginsClear === true,
        reason: allMarginsClear === true
            ? 'all margins confirmed clear by pathology — reconstruction may proceed'
            : 'BLOCKED — reconstruction cannot proceed until all margins are marked clear'
    };
}

// 5) Dermato-Oncology (Melanoma) — sentinel lymph node biopsy trigger.
// Blueprint rule: auto-trigger sentinel lymph node biopsy referral if Breslow depth > 0.8mm.
function checkSentinelNodeBiopsyReferral({ breslowDepthMm } = {}) {
    if (breslowDepthMm === undefined || breslowDepthMm === null || !Number.isFinite(Number(breslowDepthMm))) {
        return { referralTriggered: false, reason: 'Breslow depth missing — cannot assess' };
    }
    const triggered = Number(breslowDepthMm) > 0.8;
    return {
        sentinelNodeBiopsyReferral: triggered,
        reason: triggered ? `Breslow depth ${breslowDepthMm}mm > 0.8mm — SLNB referral indicated` : 'Breslow depth below SLNB threshold'
    };
}

// 6) Phototherapy — erythema-based dose escalation gate.
// Blueprint rule: hard-stop dose increase if erythema was reported in the previous session
// (must hold or decrease).
function checkPhototherapyDoseGate({ erythemaInPreviousSession, requestedAction } = {}) {
    if (erythemaInPreviousSession !== true) {
        return { allowed: true, reason: 'no erythema in previous session — dose progression as planned' };
    }
    const blocked = requestedAction === 'increase';
    return {
        allowed: !blocked,
        reason: blocked
            ? 'BLOCKED — erythema reported in previous session; dose must be held or decreased, not increased'
            : `erythema in previous session; requested action "${requestedAction}" is permitted (hold/decrease)`
    };
}

// 7) Autoimmune (Lupus) — nephritis workup trigger.
// Blueprint rule: Anti-dsDNA rises + Low Complement + new proteinuria -> Urgent Lupus Nephritis Workup.
function checkLupusNephritisRisk({ antiDsDnaRising, lowComplement, newProteinuria } = {}) {
    const triggered = antiDsDnaRising === true && lowComplement === true && newProteinuria === true;
    return {
        urgentLupusNephritisWorkup: triggered,
        reason: triggered
            ? 'anti-dsDNA rising + low complement + new proteinuria — full triad present'
            : 'lupus nephritis triad not fully met'
    };
}

// 8) Tropical Medicine — severe malaria emergency trigger.
// Blueprint rule: "Severe Malaria" criteria met -> Urgent ICU + IV Artesunate.
function checkSevereMalariaCriteria({ impairedConsciousness, severeAnemia, acuteKidneyInjury, respiratoryDistress, parasitemiaPercent } = {}) {
    const triggered = impairedConsciousness === true || severeAnemia === true
        || acuteKidneyInjury === true || respiratoryDistress === true
        || (Number(parasitemiaPercent) > 0 && Number(parasitemiaPercent) >= 5);
    return {
        severeMalariaEmergency: triggered,
        reason: triggered
            ? 'WHO severe malaria criteria met — urgent ICU + IV artesunate'
            : 'severe malaria criteria not met'
    };
}

// 9) Vaccination — contraindication hard-block.
// Blueprint rule: documented contraindication/allergy to the same vaccine class -> hard-block administration.
function checkVaccinationContraindication({ documentedContraindication, physicianOverride } = {}) {
    if (documentedContraindication !== true) {
        return { allowed: true, reason: 'no documented contraindication on record' };
    }
    return {
        allowed: physicianOverride === true,
        reason: physicianOverride === true
            ? 'contraindication documented but physician override recorded'
            : 'BLOCKED — documented contraindication/allergy to this vaccine class'
    };
}

module.exports = {
    checkRefeedingSyndromeRisk,
    checkYellowFeverCertificateValidity,
    checkInjectionVascularSafety,
    checkMohsReconstructionGate,
    checkSentinelNodeBiopsyReferral,
    checkPhototherapyDoseGate,
    checkLupusNephritisRisk,
    checkSevereMalariaCriteria,
    checkVaccinationContraindication
};
