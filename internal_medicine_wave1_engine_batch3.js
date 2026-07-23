// ============================================================================
// Internal Medicine — Wave 1 PURE ENGINE, batch 3 (no DB, no I/O)
// Same conventions: pure functions, fail-closed, each rule is the EXACT
// "Critical Alert"/"Business Logic" rule stated in the department's blueprint.
// ============================================================================

'use strict';

// 1) Cardio-Obstetrics — preeclampsia alert.
// Blueprint rule: BP > 160/110 -> immediate "Urgent OBGYN + Cardiology" alert.
function checkPreeclampsiaAlert({ systolicBp, diastolicBp } = {}) {
    if (systolicBp === undefined || systolicBp === null || diastolicBp === undefined || diastolicBp === null) {
        return { alert: false, reason: 'incomplete BP data — cannot assess' };
    }
    const alert = Number(systolicBp) > 160 && Number(diastolicBp) > 110;
    return {
        urgentObgynCardiologyAlert: alert,
        reason: alert ? `BP ${systolicBp}/${diastolicBp} exceeds 160/110 (preeclampsia risk)` : 'BP within safe range'
    };
}

// 2) Allergy/Asthma — step-up therapy recommendation.
// Blueprint rule: rescue inhaler use > 2x/week WITH declining PFT -> Step-Up Therapy Recommendation.
function checkStepUpTherapyNeeded({ rescueInhalerUsesPerWeek, pftDeclining } = {}) {
    if (rescueInhalerUsesPerWeek === undefined || rescueInhalerUsesPerWeek === null) {
        return { stepUpRecommended: false, reason: 'rescue inhaler usage data missing — cannot assess' };
    }
    const stepUp = Number(rescueInhalerUsesPerWeek) > 2 && pftDeclining === true;
    return {
        stepUpRecommended: stepUp,
        reason: stepUp
            ? `rescue inhaler used ${rescueInhalerUsesPerWeek}x/week with declining PFT`
            : 'asthma control criteria for step-up not met'
    };
}

// 3) Metabolic Bone Disease — hypercalcemic crisis alert.
// Blueprint rule: Calcium > 12 mg/dL -> Urgent Endocrinology Review alert.
function checkHypercalcemicCrisis({ calciumMgDl } = {}) {
    if (calciumMgDl === undefined || calciumMgDl === null || !Number.isFinite(Number(calciumMgDl))) {
        return { alert: false, reason: 'calcium value missing — cannot assess' };
    }
    const alert = Number(calciumMgDl) > 12;
    return {
        urgentEndocrinologyReview: alert,
        reason: alert ? `calcium ${calciumMgDl} mg/dL > 12 (hypercalcemic crisis risk)` : 'calcium within safe range'
    };
}

// 4) Obesity Medicine — weight-loss plateau regimen re-evaluation.
// Blueprint rule: weight loss plateau for 4+ weeks on medication -> Regimen Re-evaluation task.
function checkWeightLossPlateau({ plateauDurationWeeks } = {}) {
    if (plateauDurationWeeks === undefined || plateauDurationWeeks === null) {
        return { regimenReevaluationTriggered: false, reason: 'plateau duration missing — cannot assess' };
    }
    const triggered = Number(plateauDurationWeeks) >= 4;
    return {
        regimenReevaluationTriggered: triggered,
        reason: triggered ? `weight-loss plateau for ${plateauDurationWeeks} weeks (>=4 week threshold)` : 'no sustained plateau detected'
    };
}

// 5) Clinical Immunology — primary immunodeficiency (PID) referral trigger.
// Blueprint rule: "10 Warning Signs of PID" criteria met (e.g. 8+ ear infections/year) -> Urgent Immunology Referral.
function checkPidReferral({ warningSignsMetCount, earInfectionsPerYear } = {}) {
    const earInfectionFlag = earInfectionsPerYear !== undefined && earInfectionsPerYear !== null && Number(earInfectionsPerYear) >= 8;
    const warningSignFlag = warningSignsMetCount !== undefined && warningSignsMetCount !== null && Number(warningSignsMetCount) >= 2;
    const referral = earInfectionFlag || warningSignFlag;
    return {
        urgentImmunologyReferral: referral,
        reason: referral
            ? `${earInfectionFlag ? `${earInfectionsPerYear} ear infections/year (>=8)` : ''}${earInfectionFlag && warningSignFlag ? '; ' : ''}${warningSignFlag ? `${warningSignsMetCount} PID warning signs met` : ''}`
            : 'PID warning-sign criteria not met'
    };
}

// 6) Autoimmune (Lupus) — nephritis workup trigger.
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

// 7) Tropical Medicine — severe malaria emergency trigger.
// Blueprint rule: "Severe Malaria" criteria met -> Urgent ICU + IV Artesunate.
function checkSevereMalariaCriteria({ impairedConsciousness, severeAnemia, acuteKidneyInjury, respiratoryDistress, parasitemiaPercent } = {}) {
    const highParasitemia = parasitemiaPercent !== undefined && parasitemiaPercent !== null && Number(parasitemiaPercent) > 5;
    const severe = impairedConsciousness === true || severeAnemia === true || acuteKidneyInjury === true || respiratoryDistress === true || highParasitemia;
    return {
        severeMalaria: severe,
        urgentIcuIvArtesunate: severe,
        reason: severe ? 'severe malaria criteria met — urgent ICU admission + IV Artesunate' : 'uncomplicated malaria presentation'
    };
}

// 8) Vaccination — contraindication hard-block.
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

// 9) Gynecologic Oncology — recurrence risk surveillance trigger.
// Blueprint rule: post-treatment surveillance marker rise OR symptom recurrence ->
// urgent gyn-onc tumor board review.
function checkGynOncRecurrenceRisk({ surveillanceMarkerRise, symptomRecurrence, monthsSinceTreatment } = {}) {
    if (surveillanceMarkerRise === undefined && symptomRecurrence === undefined) {
        return { urgentTumorBoardReview: false, reason: 'no surveillance data — cannot assess' };
    }
    const markerFlag = surveillanceMarkerRise === true;
    const symptomFlag = symptomRecurrence === true;
    const withinTwoYears = Number(monthsSinceTreatment) >= 0 && Number(monthsSinceTreatment) <= 24;
    const triggered = (markerFlag || symptomFlag) && withinTwoYears;
    return {
        urgentTumorBoardReview: triggered,
        reason: triggered
            ? `${markerFlag ? 'surveillance marker rising' : ''}${markerFlag && symptomFlag ? ' + ' : ''}${symptomFlag ? 'symptom recurrence' : ''} within ${monthsSinceTreatment} months of treatment`
            : 'no high-risk recurrence pattern detected'
    };
}

module.exports = {
    checkPreeclampsiaAlert,
    checkStepUpTherapyNeeded,
    checkHypercalcemicCrisis,
    checkWeightLossPlateau,
    checkPidReferral,
    checkLupusNephritisRisk,
    checkSevereMalariaCriteria,
    checkVaccinationContraindication,
    checkGynOncRecurrenceRisk
};
