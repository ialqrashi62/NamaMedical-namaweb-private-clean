// ============================================================================
// obgyn_peds_wave3_engine_unit_test.js — DB-free unit tests for the 9 Wave 3
// (OBGYN/Pediatrics) safety/alert gates.
// ============================================================================
'use strict';
const assert = require('assert');
const eng = require('./obgyn_peds_wave3_engine');

function runTests() {
    // 1) Gynecologic Surgery — high-risk mass must route to Gyn-Onc.
    assert.strictEqual(eng.checkAdnexalMassRouting({ malignancyRiskLevel: 'high' }).routeToGynOncology, true);
    assert.strictEqual(eng.checkAdnexalMassRouting({ malignancyRiskLevel: 'low' }).routeToGynOncology, false);

    // 2) IVF/Fertility — high OHSS risk must recommend freeze-all.
    assert.strictEqual(eng.checkOhssFreezeAllRecommendation({ ohssRiskLevel: 'high' }).freezeAllRecommended, true);
    assert.strictEqual(eng.checkOhssFreezeAllRecommendation({ ohssRiskLevel: 'low' }).freezeAllRecommended, false);

    // 3) Adolescent Gynecology — precocious puberty/primary amenorrhea must trigger referral.
    assert.strictEqual(eng.checkPubertalTimingReferral({ ageYears: 7, pubertyOnset: true }).endocrineReferralRequired, true);
    assert.strictEqual(eng.checkPubertalTimingReferral({ ageYears: 16, hasMenses: false }).endocrineReferralRequired, true);
    assert.strictEqual(eng.checkPubertalTimingReferral({ ageYears: 12, pubertyOnset: true }).endocrineReferralRequired, false);

    // 4) Menopause — absolute contraindication must block HRT.
    assert.strictEqual(eng.checkHrtEligibility({ activeBreastCancer: true }).hrtAllowed, false);
    assert.strictEqual(eng.checkHrtEligibility({}).hrtAllowed, true);

    // 5) Cosmetic Gynecology — functional symptoms must require urodynamic workup first.
    assert.strictEqual(eng.checkUrogynecologyRouting({ functionalSymptomsPresent: true }).urodynamicWorkupRequiredBeforeCosmetic, true);
    assert.strictEqual(eng.checkUrogynecologyRouting({ functionalSymptomsPresent: false }).urodynamicWorkupRequiredBeforeCosmetic, false);

    // 6) Pediatric Genetics — consanguinity + dysmorphic features must suggest screening.
    assert.strictEqual(eng.checkExpandedCarrierScreening({ consanguineousFamily: true, dysmorphicFeatures: true }).expandedCarrierScreeningSuggested, true);
    assert.strictEqual(eng.checkExpandedCarrierScreening({ consanguineousFamily: true, dysmorphicFeatures: false }).expandedCarrierScreeningSuggested, false);

    // 7) Pediatric Nutrition — z-score -4 must classify as SAM with urgent flag.
    assert.strictEqual(eng.checkMalnutritionClassification({ weightForHeightZScore: -4 }).classification, 'severe_acute_malnutrition');
    assert.strictEqual(eng.checkMalnutritionClassification({ weightForHeightZScore: -4 }).urgentRehabFlag, true);
    assert.strictEqual(eng.checkMalnutritionClassification({ weightForHeightZScore: -1 }).urgentRehabFlag, false);

    // 8) Developmental Pediatrics — regression must be high-priority fast-tracked.
    assert.strictEqual(eng.checkDevelopmentalRegressionFlag({ lostPreviouslyAcquiredSkills: true }).highPriorityFastTrack, true);
    assert.strictEqual(eng.checkDevelopmentalRegressionFlag({ lostPreviouslyAcquiredSkills: false }).highPriorityFastTrack, false);

    // 9) Pediatric Subspecialties — order without weight/BSA dose calc must be blocked.
    assert.strictEqual(eng.checkPediatricDoseGuard({ weightKg: 20, doseCalculationProvided: false }).orderAllowed, false);
    assert.strictEqual(eng.checkPediatricDoseGuard({ weightKg: 20, doseCalculationProvided: true }).orderAllowed, true);
    assert.strictEqual(eng.checkPediatricDoseGuard({ doseCalculationProvided: true }).orderAllowed, false);

    console.log('obgyn_peds_wave3_engine_unit_test: all 9 department gates verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
