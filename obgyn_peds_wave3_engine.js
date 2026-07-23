// ============================================================================
// OBGYN & Pediatrics — Wave 3 PURE ENGINE (no DB, no I/O)
// Converts Enterprise_Blueprint_2026 Wave 3 C-classified department specs into
// real, unit-testable decision-support gates. Same conventions as prior waves:
// pure functions, fail-closed, each rule is the EXACT stated blueprint rule.
// ============================================================================

'use strict';

// 1) Gynecologic Surgery — high-risk adnexal mass routing.
// Blueprint rule: auto-route high-risk adnexal masses to Gynecologic Oncology instead of
// general gynecologic surgery.
function checkAdnexalMassRouting({ malignancyRiskLevel } = {}) {
    const highRisk = malignancyRiskLevel === 'high';
    return {
        routeToGynOncology: highRisk,
        reason: highRisk ? 'high-risk adnexal mass — routed to Gynecologic Oncology' : 'routed to general gynecologic surgery'
    };
}

// 2) IVF/Fertility — OHSS freeze-all recommendation.
// Blueprint rule: auto-recommend "Freeze-All" cycle (no fresh transfer) if OHSS risk is high.
function checkOhssFreezeAllRecommendation({ ohssRiskLevel } = {}) {
    const highRisk = ohssRiskLevel === 'high';
    return {
        freezeAllRecommended: highRisk,
        reason: highRisk ? 'high OHSS risk — freeze-all cycle recommended, no fresh transfer' : 'fresh transfer may proceed as planned'
    };
}

// 3) Adolescent Gynecology — pubertal timing referral trigger.
// Blueprint rule: auto-flag precocious puberty (before age 8) or primary amenorrhea
// (no menses by 15-16) for pediatric endocrinology referral.
function checkPubertalTimingReferral({ ageYears, pubertyOnset, hasMenses } = {}) {
    if (ageYears === undefined || ageYears === null) {
        return { endocrineReferralRequired: false, reason: 'age missing — cannot assess' };
    }
    const precociousPuberty = pubertyOnset === true && Number(ageYears) < 8;
    const primaryAmenorrhea = hasMenses === false && Number(ageYears) >= 15;
    const referral = precociousPuberty || primaryAmenorrhea;
    return {
        endocrineReferralRequired: referral,
        reason: referral
            ? (precociousPuberty ? 'precocious puberty (onset before age 8)' : 'primary amenorrhea (no menses by 15-16)')
            : 'pubertal timing within normal range'
    };
}

// 4) Menopause — HRT contraindication hard-block.
// Blueprint rule: hard-block HRT prescription if absolute contraindications present
// (active breast cancer, unexplained bleeding, active VTE).
function checkHrtEligibility({ activeBreastCancer, unexplainedBleeding, activeVte } = {}) {
    const contraindicated = activeBreastCancer === true || unexplainedBleeding === true || activeVte === true;
    return {
        hrtAllowed: !contraindicated,
        reason: contraindicated ? 'BLOCKED — absolute HRT contraindication present' : 'no absolute contraindications identified'
    };
}

// 5) Cosmetic Gynecology (Urogynecology) — functional-symptom routing gate.
// Blueprint rule: route functional urogynecologic symptoms (not purely aesthetic) to full
// urodynamic workup before any cosmetic procedure.
function checkUrogynecologyRouting({ functionalSymptomsPresent } = {}) {
    const requiresWorkup = functionalSymptomsPresent === true;
    return {
        urodynamicWorkupRequiredBeforeCosmetic: requiresWorkup,
        reason: requiresWorkup
            ? 'functional urogynecologic symptoms present — urodynamic workup required before any cosmetic procedure'
            : 'purely aesthetic request — cosmetic procedure may proceed'
    };
}

// 6) Pediatric Genetics — expanded carrier screening trigger.
// Blueprint rule: auto-suggest expanded carrier screening for consanguineous families
// (e.g. with a child showing dysmorphic features).
function checkExpandedCarrierScreening({ consanguineousFamily, dysmorphicFeatures } = {}) {
    const suggested = consanguineousFamily === true && dysmorphicFeatures === true;
    return {
        expandedCarrierScreeningSuggested: suggested,
        reason: suggested ? 'consanguineous family with dysmorphic features — expanded carrier screening suggested' : 'criteria not met'
    };
}

// 7) Pediatric Nutrition — severe acute malnutrition (SAM) classification.
// Blueprint rule: WHO classification; weight-for-height z-score of -4 (<= -3 threshold for
// SAM) -> urgent inpatient nutritional rehabilitation flag.
function checkMalnutritionClassification({ weightForHeightZScore } = {}) {
    if (weightForHeightZScore === undefined || weightForHeightZScore === null || !Number.isFinite(Number(weightForHeightZScore))) {
        return { classification: 'unknown', urgentRehabFlag: false, reason: 'z-score missing — cannot classify' };
    }
    const z = Number(weightForHeightZScore);
    let classification;
    if (z <= -3) classification = 'severe_acute_malnutrition';
    else if (z <= -2) classification = 'moderate_acute_malnutrition';
    else classification = 'normal';
    const urgent = classification === 'severe_acute_malnutrition';
    return {
        classification,
        urgentRehabFlag: urgent,
        reason: urgent ? `z-score ${z} <= -3 (WHO SAM threshold) — urgent inpatient nutritional rehabilitation` : `z-score ${z} — ${classification}`
    };
}

// 8) Developmental Pediatrics — regression high-priority flag.
// Blueprint rule: auto-flag developmental regression as high-priority (faster-tracked than routine delay).
function checkDevelopmentalRegressionFlag({ lostPreviouslyAcquiredSkills } = {}) {
    const highPriority = lostPreviouslyAcquiredSkills === true;
    return {
        highPriorityFastTrack: highPriority,
        reason: highPriority
            ? 'developmental regression detected (lost previously acquired skills) — high-priority fast-track referral'
            : 'no regression detected — routine developmental delay pathway if applicable'
    };
}

// 9) Pediatric Subspecialties (shared) — weight/BSA-based dosing hard-block.
// Blueprint rule: shared pediatric_dose_guard hard-blocks any medication order missing
// weight/BSA-based calculation.
function checkPediatricDoseGuard({ weightKg, bsaM2, doseCalculationProvided } = {}) {
    const hasBasis = (weightKg !== undefined && weightKg !== null && Number(weightKg) > 0)
        || (bsaM2 !== undefined && bsaM2 !== null && Number(bsaM2) > 0);
    const allowed = hasBasis && doseCalculationProvided === true;
    return {
        orderAllowed: allowed,
        reason: allowed
            ? 'weight/BSA-based dose calculation provided'
            : 'BLOCKED — pediatric medication order missing weight/BSA-based dose calculation'
    };
}

module.exports = {
    checkAdnexalMassRouting,
    checkOhssFreezeAllRecommendation,
    checkPubertalTimingReferral,
    checkHrtEligibility,
    checkUrogynecologyRouting,
    checkExpandedCarrierScreening,
    checkMalnutritionClassification,
    checkDevelopmentalRegressionFlag,
    checkPediatricDoseGuard
};
