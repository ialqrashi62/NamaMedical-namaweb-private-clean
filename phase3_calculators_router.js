// phase3_calculators_router.js
// REST API router for the 110 NEW clinical engines created across Phase 3 batches
// (B11-B17 = 48 + Wave 5 critical_care = 9 + Wave 4 diagnostics = 9 + Wave 1
// internal_medicine batches 1-4 = 25 + Wave 3 obgyn_peds = 9 + rare_specialized
// = 12 + Wave 2 surgical = 10). All pure deterministic, throw on invalid input,
// return a standard envelope:
//   { ok: true,  function, input, ...engineResult }
//   { ok: false, error, code }
//
// Mounted by server.js with: app.use('/api/phase3', makePhase3CalculatorsRouter({requireAuth, requireTenantScope}))
// All routes are READ-ONLY scoring/decision-support calls — no DB writes, no PHI storage.
//
// Safety rails respected:
//   * No tenant data write (no DB access)
//   * requireAuth + requireTenantScope (tenant in production; fail-closed)
//   * Input validation via engine throws (translated to 400)
//   * No PHI — inputs are clinical numbers/bools/enums only
//
// Function-name map (path -> function):
//   POST /thyroid                 -> interpretThyroid
//   POST /bone-density            -> fraxScore
//   POST /obesity                 -> assessObesity
//   POST /glycemic-control        -> glycemicControl
//   POST /copd-severity           -> copdSeverity
//   POST /asthma-control          -> assessAsthmaControl
//   POST /sleep-study             -> interpretSleepStudy
//   POST /gi-bleed-risk           -> giBleedRisk
//   POST /ibd-activity/mayo       -> ucMayoScore
//   POST /ibd-activity/crohn      -> crohnCDAI
//   POST /ckd/egfr                -> ckdEgfr
//   POST /ckd/staging             -> ckdStaging
//   POST /hd-adequacy             -> hdAdequacy
//   POST /rheum/das28             -> das28crp
//   POST /rheum/sledai            -> sledai2k
//   POST /sepsis/news2            -> news2Score
//   POST /icu/nihss               -> nihssScore
//   POST /icu/apache              -> apacheIV
//   POST /obgyn/partograph        -> partographAssessment
//   POST /obgyn/bishop            -> bishopScore
//   POST /derm/pasi               -> pasiScore
//   POST /derm/scorad             -> scoradScore
//   POST /trauma/gcs              -> glasgowComaScale
//   POST /trauma/iss              -> injurySeverityScore
//   POST /trauma/rts              -> revisedTraumaScore
//   POST /neonatal/apgar          -> apgarScore
//   POST /neonatal/bhutani        -> bhutaniRisk
//   POST /neonatal/birthweight    -> birthweightCategory
//   POST /palliative/kps          -> karnofskyScore
//   POST /palliative/ecog         -> ecogScore
//   POST /palliative/pps          -> pallPerformanceScale
//   POST /oncology/tnm            -> tnmStage
//   POST /oncology/bsa            -> bodySurfaceArea
//   POST /oncology/chemo-dose     -> chemoDose
//   POST /psych/phq9              -> phq9Score
//   POST /psych/gad7              -> gad7Score
//   POST /psych/wong-baker        -> wongBakerFaces
//   POST /ent/pure-tone-avg       -> pureToneAverage
//   POST /ent/visual-acuity       -> visualAcuity
//   POST /ent/glaucoma-risk       -> glaucomaRisk
//   POST /uro/ipss                -> ipssScore
//   POST /uro/stones              -> renalStonesRisk
//   POST /heme/wells-dvt          -> wellsDVT
//   POST /heme/wells-pe           -> wellsPE
//   POST /heme/has-bled           -> hasBledScore
//   POST /heme/curb65            -> curb65Score
//   POST /preop/asa               -> asaClassification
//   POST /preop/rcri              -> rcriScore
//   POST /preop/caprini           -> capriniScore
//   POST /nutrition/bmi           -> bmi
//   POST /nutrition/bee            -> harrisBenedictBEE
//   POST /nutrition/nrs2002       -> nrs2002

'use strict';

const express = require('express');

// Engine imports — all 26 (each exports its public functions)
const thyroid = require('./thyroid_engine');
const boneDensity = require('./bone_density_engine');
const obesity = require('./obesity_engine');
const glycemic = require('./glycemic_control_engine');
const copd = require('./copd_severity_engine');
const asthma = require('./asthma_control_engine');
const sleep = require('./sleep_study_engine');
const gi = require('./gi_bleed_risk_engine');
const ibd = require('./ibd_activity_engine');
const ckd = require('./ckd_staging_engine');
const hd = require('./hd_adequacy_engine');
const rheum = require('./rheum_activity_engine');
const sepsis = require('./sepsis_ews2_engine');
const nihss = require('./nihss_apache_engine');
const obgyn = require('./partograph_extended_engine');
const derm = require('./derm_score_engine');
const trauma = require('./trauma_score_engine');
const neonatal = require('./neonatal_engine');
const pall = require('./palliative_performance_engine');
const onc = require('./oncology_engine');
const psych = require('./psych_pain_engine');
const ent = require('./ent_optho_engine');
const uro = require('./urology_engine');
const heme = require('./heme_infectious_engine');
const preop = require('./surgical_preop_engine');
const nutrition = require('./nutrition_malnutrition_engine');

// ====== Additional wave engines (Waves 1-5, 8-10) mounted under /api/phase3 ======
const wave5cc = require('./critical_care_wave5_engine');
const wave4dx = require('./diagnostics_wave4_engine');
const imWave1 = require('./internal_medicine_wave1_engine');
const imWave1b2 = require('./internal_medicine_wave1_engine_batch2');
const imWave1b3 = require('./internal_medicine_wave1_engine_batch3');
const imWave1b4 = require('./internal_medicine_wave1_engine_batch4');
const obgynWave3 = require('./obgyn_peds_wave3_engine');
const rareSpec = require('./rare_specialized_engine');
const surgWave2 = require('./surgical_wave2_engine');

// Run engine + standard envelope
function runOr400(res, fn, args, functionName) {
  try {
    const r = typeof fn === 'function' ? fn(args || {}) : null;
    if (!r || typeof r !== 'object') {
      return res.status(500).json({ ok: false, code: 'bad_engine_output' });
    }
    // Preserve the engine's "score" field under `value` for consistency with phase 2E2
    const { value, score, ...rest } = r;
    const merged = { value: (value !== undefined ? value : score), ...rest };
    return res.json({ ok: true, function: functionName, input: args, ...merged });
  } catch (e) {
    return res.status(400).json({ ok: false, code: 'engine_error', error: e.message });
  }
}

function makePhase3CalculatorsRouter({ requireAuth, requireTenantScope }) {
  const router = express.Router();

  // All routes require authentication and a tenant scope
  router.use(requireAuth, requireTenantScope);

  // ====== Endocrine ======
  router.post('/thyroid', (req, res) => runOr400(res, thyroid.interpretThyroid, req.body, 'interpretThyroid'));
  router.post('/bone-density', (req, res) => runOr400(res, boneDensity.fraxScore, req.body, 'fraxScore'));
  router.post('/obesity', (req, res) => runOr400(res, obesity.assessObesity, req.body, 'assessObesity'));
  router.post('/glycemic-control', (req, res) => runOr400(res, glycemic.glycemicControl, req.body, 'glycemicControl'));

  // ====== Pulmonary ======
  router.post('/copd-severity', (req, res) => runOr400(res, copd.copdSeverity, req.body, 'copdSeverity'));
  router.post('/asthma-control', (req, res) => runOr400(res, asthma.assessAsthmaControl, req.body, 'assessAsthmaControl'));
  router.post('/sleep-study', (req, res) => runOr400(res, sleep.interpretSleepStudy, req.body, 'interpretSleepStudy'));

  // ====== Gastroenterology ======
  router.post('/gi-bleed-risk', (req, res) => runOr400(res, gi.giBleedRisk, req.body, 'giBleedRisk'));
  router.post('/ibd-activity/mayo', (req, res) => runOr400(res, ibd.ucMayoScore, req.body, 'ucMayoScore'));
  router.post('/ibd-activity/crohn', (req, res) => runOr400(res, ibd.crohnCDAI, req.body, 'crohnCDAI'));

  // ====== Nephrology ======
  router.post('/ckd/egfr', (req, res) => runOr400(res, ckd.ckdEgfr, req.body, 'ckdEgfr'));
  router.post('/ckd/staging', (req, res) => runOr400(res, ckd.ckdStaging, req.body, 'ckdStaging'));
  router.post('/hd-adequacy', (req, res) => runOr400(res, hd.hdAdequacy, req.body, 'hdAdequacy'));

  // ====== Rheumatology ======
  router.post('/rheum/das28', (req, res) => runOr400(res, rheum.das28crp, req.body, 'das28crp'));
  router.post('/rheum/sledai', (req, res) => runOr400(res, rheum.sledai2k, req.body, 'sledai2k'));

  // ====== Infectious Disease ======
  router.post('/sepsis/news2', (req, res) => runOr400(res, sepsis.news2Score, req.body, 'news2Score'));

  // ====== Critical Care ======
  router.post('/icu/nihss', (req, res) => runOr400(res, nihss.nihssScore, req.body, 'nihssScore'));
  router.post('/icu/apache', (req, res) => runOr400(res, nihss.apacheIV, req.body, 'apacheIV'));

  // ====== OBGYN ======
  router.post('/obgyn/partograph', (req, res) => runOr400(res, obgyn.partographAssessment, req.body, 'partographAssessment'));
  router.post('/obgyn/bishop', (req, res) => runOr400(res, obgyn.bishopScore, req.body, 'bishopScore'));

  // ====== Dermatology ======
  router.post('/derm/pasi', (req, res) => runOr400(res, derm.pasiScore, req.body, 'pasiScore'));
  router.post('/derm/scorad', (req, res) => runOr400(res, derm.scoradScore, req.body, 'scoradScore'));

  // ====== Trauma / ER ======
  router.post('/trauma/gcs', (req, res) => runOr400(res, trauma.glasgowComaScale, req.body, 'glasgowComaScale'));
  router.post('/trauma/iss', (req, res) => runOr400(res, trauma.injurySeverityScore, req.body, 'injurySeverityScore'));
  router.post('/trauma/rts', (req, res) => runOr400(res, trauma.revisedTraumaScore, req.body, 'revisedTraumaScore'));

  // ====== Neonatal ======
  router.post('/neonatal/apgar', (req, res) => runOr400(res, neonatal.apgarScore, req.body, 'apgarScore'));
  router.post('/neonatal/bhutani', (req, res) => runOr400(res, neonatal.bhutaniRisk, req.body, 'bhutaniRisk'));
  router.post('/neonatal/birthweight', (req, res) => runOr400(res, neonatal.birthweightCategory, req.body, 'birthweightCategory'));

  // ====== Palliative ======
  router.post('/palliative/kps', (req, res) => runOr400(res, pall.karnofskyScore, req.body, 'karnofskyScore'));
  router.post('/palliative/ecog', (req, res) => runOr400(res, pall.ecogScore, req.body, 'ecogScore'));
  router.post('/palliative/pps', (req, res) => runOr400(res, pall.pallPerformanceScale, req.body, 'pallPerformanceScale'));

  // ====== Oncology ======
  router.post('/oncology/tnm', (req, res) => runOr400(res, onc.tnmStage, req.body, 'tnmStage'));
  router.post('/oncology/bsa', (req, res) => runOr400(res, onc.bodySurfaceArea, req.body, 'bodySurfaceArea'));
  router.post('/oncology/chemo-dose', (req, res) => runOr400(res, onc.chemoDose, req.body, 'chemoDose'));

  // ====== Psychiatry + Pain ======
  router.post('/psych/phq9', (req, res) => runOr400(res, psych.phq9Score, req.body, 'phq9Score'));
  router.post('/psych/gad7', (req, res) => runOr400(res, psych.gad7Score, req.body, 'gad7Score'));
  router.post('/psych/wong-baker', (req, res) => runOr400(res, psych.wongBakerFaces, req.body, 'wongBakerFaces'));

  // ====== ENT + Ophthalmology ======
  router.post('/ent/pure-tone-avg', (req, res) => runOr400(res, ent.pureToneAverage, req.body, 'pureToneAverage'));
  router.post('/ent/visual-acuity', (req, res) => runOr400(res, ent.visualAcuity, req.body, 'visualAcuity'));
  router.post('/ent/glaucoma-risk', (req, res) => runOr400(res, ent.glaucomaRisk, req.body, 'glaucomaRisk'));

  // ====== Urology ======
  router.post('/uro/ipss', (req, res) => runOr400(res, uro.ipssScore, req.body, 'ipssScore'));
  router.post('/uro/stones', (req, res) => runOr400(res, uro.renalStonesRisk, req.body, 'renalStonesRisk'));

  // ====== Hematology + ID ======
  router.post('/heme/wells-dvt', (req, res) => runOr400(res, heme.wellsDVT, req.body, 'wellsDVT'));
  router.post('/heme/wells-pe', (req, res) => runOr400(res, heme.wellsPE, req.body, 'wellsPE'));
  router.post('/heme/has-bled', (req, res) => runOr400(res, heme.hasBledScore, req.body, 'hasBledScore'));
  router.post('/heme/curb65', (req, res) => runOr400(res, heme.curb65Score, req.body, 'curb65Score'));

  // ====== Surgical Preop ======
  router.post('/preop/asa', (req, res) => runOr400(res, preop.asaClassification, req.body, 'asaClassification'));
  router.post('/preop/rcri', (req, res) => runOr400(res, preop.rcriScore, req.body, 'rcriScore'));
  router.post('/preop/caprini', (req, res) => runOr400(res, preop.capriniScore, req.body, 'capriniScore'));

  // ====== Nutrition + Malnutrition ======
  router.post('/nutrition/bmi', (req, res) => runOr400(res, nutrition.bmi, req.body, 'bmi'));
  router.post('/nutrition/bee', (req, res) => runOr400(res, nutrition.harrisBenedictBEE, req.body, 'harrisBenedictBEE'));
  router.post('/nutrition/nrs2002', (req, res) => runOr400(res, nutrition.nrs2002, req.body, 'nrs2002'));

  // ====== Critical Care & Emergency — Wave 5 (9) ======
  router.post('/stroke/tpa-eligibility', (req, res) => runOr400(res, wave5cc.checkTpaEligibility, req.body, 'checkTpaEligibility'));
  router.post('/tox-er/toxidrome-id', (req, res) => runOr400(res, wave5cc.matchToxidromeAntidote, req.body, 'matchToxidromeAntidote'));
  router.post('/obs-unit/disposition-check', (req, res) => runOr400(res, wave5cc.checkObservationDispositionAlert, req.body, 'checkObservationDispositionAlert'));
  router.post('/minor-surg-er/wound-assessment', (req, res) => runOr400(res, wave5cc.checkWoundComplexityRouting, req.body, 'checkWoundComplexityRouting'));
  router.post('/neuro-icu/icp-log', (req, res) => runOr400(res, wave5cc.checkCushingsTriad, req.body, 'checkCushingsTriad'));
  router.post('/onc-icu/dual-surveillance', (req, res) => runOr400(res, wave5cc.checkOncologyIcuDualSurveillance, req.body, 'checkOncologyIcuDualSurveillance'));
  router.post('/transplant-icu/dual-workup', (req, res) => runOr400(res, wave5cc.checkTransplantFeverWorkup, req.body, 'checkTransplantFeverWorkup'));
  router.post('/hbot/pre-session-screen', (req, res) => runOr400(res, wave5cc.checkHbotSafetyGate, req.body, 'checkHbotSafetyGate'));
  router.post('/trauma-center/activation-level', (req, res) => runOr400(res, wave5cc.checkTraumaActivationLevel, req.body, 'checkTraumaActivationLevel'));

  // ====== Diagnostics — Wave 4 (9) ======
  router.post('/nuc-med/preg-gate', (req, res) => runOr400(res, wave4dx.checkRadioisotopePregnancyGate, req.body, 'checkRadioisotopePregnancyGate'));
  router.post('/immuno/pattern-label', (req, res) => runOr400(res, wave4dx.labelImmunologyPatternResult, req.body, 'labelImmunologyPatternResult'));
  router.post('/mol-dx/variant-release', (req, res) => runOr400(res, wave4dx.checkVariantReportReleaseGate, req.body, 'checkVariantReportReleaseGate'));
  router.post('/tox/acetaminophen-nomogram', (req, res) => runOr400(res, wave4dx.checkAcetaminophenNomogramAlert, req.body, 'checkAcetaminophenNomogramAlert'));
  router.post('/eeg/ncse-alert', (req, res) => runOr400(res, wave4dx.checkNcseAlert, req.body, 'checkNcseAlert'));
  router.post('/neuro-phy/guillain-barre', (req, res) => runOr400(res, wave4dx.checkGuillainBarreAlert, req.body, 'checkGuillainBarreAlert'));
  router.post('/ct/contrast-extravasation', (req, res) => runOr400(res, wave4dx.checkContrastExtravasationAlert, req.body, 'checkContrastExtravasationAlert'));
  router.post('/pulm/hemoptysis-alert', (req, res) => runOr400(res, wave4dx.checkMassiveHemoptysisAlert, req.body, 'checkMassiveHemoptysisAlert'));
  router.post('/cf/sweat-test-validity', (req, res) => runOr400(res, wave4dx.checkSweatTestValidity, req.body, 'checkSweatTestValidity'));

  // ====== Internal Medicine — Wave 1 batch 1 (8) ======
  router.post('/heart-failure/risk-score', (req, res) => runOr400(res, imWave1.checkHeartFailureDecompensation, req.body, 'checkHeartFailureDecompensation'));
  router.post('/vascular/risk-profile', (req, res) => runOr400(res, imWave1.checkCriticalLimbIschemia, req.body, 'checkCriticalLimbIschemia'));
  router.post('/sleep/hypoxemia-check', (req, res) => runOr400(res, imWave1.checkNocturnalHypoxemia, req.body, 'checkNocturnalHypoxemia'));
  router.post('/motility/surgical-consult-check', (req, res) => runOr400(res, imWave1.checkAchalasiaSurgicalConsult, req.body, 'checkAchalasiaSurgicalConsult'));
  router.post('/nuclear/safety-lock', (req, res) => runOr400(res, imWave1.checkNuclearScanSafetyLock, req.body, 'checkNuclearScanSafetyLock'));
  router.post('/preventive/risk-score', (req, res) => runOr400(res, imWave1.checkPreventiveCardiologyHighRisk, req.body, 'checkPreventiveCardiologyHighRisk'));
  router.post('/allergic-pulm/anaphylaxis-check', (req, res) => runOr400(res, imWave1.checkAnaphylaxisAlert, req.body, 'checkAnaphylaxisAlert'));
  router.post('/respiratory/abg-check', (req, res) => runOr400(res, imWave1.checkRespiratoryCriticalABG, req.body, 'checkRespiratoryCriticalABG'));

  // ====== Internal Medicine — Wave 1 batch 2 (7) ======
  router.post('/hepatology/liver-failure-alert', (req, res) => runOr400(res, imWave1b2.checkLiverFailureAlert, req.body, 'checkLiverFailureAlert'));
  router.post('/gastro/pancreatitis-alert', (req, res) => runOr400(res, imWave1b2.checkAcutePancreatitisAlert, req.body, 'checkAcutePancreatitisAlert'));
  router.post('/transplant/rejection-risk', (req, res) => runOr400(res, imWave1b2.checkTransplantRejectionRisk, req.body, 'checkTransplantRejectionRisk'));
  router.post('/heme-onc/chemo-safety-lock', (req, res) => runOr400(res, imWave1b2.checkChemoSafetyLock, req.body, 'checkChemoSafetyLock'));
  router.post('/heme-onc/hyperleukocytosis', (req, res) => runOr400(res, imWave1b2.checkHyperleukocytosisAlert, req.body, 'checkHyperleukocytosisAlert'));
  router.post('/heme/transfusion-reversal', (req, res) => runOr400(res, imWave1b2.checkTransfusionReversalAlert, req.body, 'checkTransfusionReversalAlert'));
  router.post('/heme-onc/febrile-neutropenia', (req, res) => runOr400(res, imWave1b2.checkFebrileNeutropeniaProtocol, req.body, 'checkFebrileNeutropeniaProtocol'));

  // ====== Internal Medicine — Wave 1 batch 3 (6) ======
  router.post('/gyn-onc/recurrence-risk', (req, res) => runOr400(res, imWave1b3.checkGynOncRecurrenceRisk, req.body, 'checkGynOncRecurrenceRisk'));
  router.post('/ob/preeclampsia-alert', (req, res) => runOr400(res, imWave1b3.checkPreeclampsiaAlert, req.body, 'checkPreeclampsiaAlert'));
  router.post('/ibd/step-up-therapy', (req, res) => runOr400(res, imWave1b3.checkStepUpTherapyNeeded, req.body, 'checkStepUpTherapyNeeded'));
  router.post('/endocrine/hypercalcemic-crisis', (req, res) => runOr400(res, imWave1b3.checkHypercalcemicCrisis, req.body, 'checkHypercalcemicCrisis'));
  router.post('/bariatric/weight-loss-plateau', (req, res) => runOr400(res, imWave1b3.checkWeightLossPlateau, req.body, 'checkWeightLossPlateau'));
  router.post('/gyn/pid-referral', (req, res) => runOr400(res, imWave1b3.checkPidReferral, req.body, 'checkPidReferral'));

  // ====== Internal Medicine — Wave 1 batch 4 (4) ======
  router.post('/lupus-nephritis/risk', (req, res) => runOr400(res, imWave1b4.checkLupusNephritisRisk, req.body, 'checkLupusNephritisRisk'));
  router.post('/tropical/severe-malaria', (req, res) => runOr400(res, imWave1b4.checkSevereMalariaCriteria, req.body, 'checkSevereMalariaCriteria'));
  router.post('/travel/vaccine-contraindication', (req, res) => runOr400(res, imWave1b4.checkVaccinationContraindication, req.body, 'checkVaccinationContraindication'));
  router.post('/nutrition/refeeding-syndrome', (req, res) => runOr400(res, imWave1b4.checkRefeedingSyndromeRisk, req.body, 'checkRefeedingSyndromeRisk'));

  // ====== OBGYN + Pediatrics — Wave 3 (9) ======
  router.post('/gyn-surg/mass-assessment', (req, res) => runOr400(res, obgynWave3.checkAdnexalMassRouting, req.body, 'checkAdnexalMassRouting'));
  router.post('/ivf/ohss-risk-check', (req, res) => runOr400(res, obgynWave3.checkOhssFreezeAllRecommendation, req.body, 'checkOhssFreezeAllRecommendation'));
  router.post('/adolescent-gyn/pubertal-assessment', (req, res) => runOr400(res, obgynWave3.checkPubertalTimingReferral, req.body, 'checkPubertalTimingReferral'));
  router.post('/menopause/hrt-eligibility', (req, res) => runOr400(res, obgynWave3.checkHrtEligibility, req.body, 'checkHrtEligibility'));
  router.post('/urogyn/routing-check', (req, res) => runOr400(res, obgynWave3.checkUrogynecologyRouting, req.body, 'checkUrogynecologyRouting'));
  router.post('/peds-genetics/carrier-screening-check', (req, res) => runOr400(res, obgynWave3.checkExpandedCarrierScreening, req.body, 'checkExpandedCarrierScreening'));
  router.post('/peds/malnutrition-classification', (req, res) => runOr400(res, obgynWave3.checkMalnutritionClassification, req.body, 'checkMalnutritionClassification'));
  router.post('/peds/developmental-regression', (req, res) => runOr400(res, obgynWave3.checkDevelopmentalRegressionFlag, req.body, 'checkDevelopmentalRegressionFlag'));
  router.post('/peds/dose-guard', (req, res) => runOr400(res, obgynWave3.checkPediatricDoseGuard, req.body, 'checkPediatricDoseGuard'));

  // ====== Rare & Super-Specialized (12) ======
  router.post('/space-dive/dcs-risk', (req, res) => runOr400(res, rareSpec.dcsRiskAssessment, req.body, 'dcsRiskAssessment'));
  router.post('/complex-sleep/parasomnia-classification', (req, res) => runOr400(res, rareSpec.classifyParasomnia, req.body, 'classifyParasomnia'));
  router.post('/epilepsy-monitoring/localization-analysis', (req, res) => runOr400(res, rareSpec.verifySurgicalCandidacy, req.body, 'verifySurgicalCandidacy'));
  router.post('/stem-cell/protocol-verification', (req, res) => runOr400(res, rareSpec.verifyProtocolCompliance, req.body, 'verifyProtocolCompliance'));
  router.post('/fetal-surgery/consensus-check', (req, res) => runOr400(res, rareSpec.verifyFetalSurgeryConsensus, req.body, 'verifyFetalSurgeryConsensus'));
  router.post('/syndromic/pattern-recognition', (req, res) => runOr400(res, rareSpec.recognizeSyndromicPattern, req.body, 'recognizeSyndromicPattern'));
  router.post('/trajectory/safety-verify', (req, res) => runOr400(res, rareSpec.verifyTrajectorySafety, req.body, 'verifyTrajectorySafety'));
  router.post('/isolation/entry-gate', (req, res) => runOr400(res, rareSpec.verifyIsolationGate, req.body, 'verifyIsolationGate'));
  router.post('/surg-onc/margin-coverage', (req, res) => runOr400(res, rareSpec.verifyMarginCoverage, req.body, 'verifyMarginCoverage'));
  router.post('/derm/confocal-pattern', (req, res) => runOr400(res, rareSpec.classifyConfocalPattern, req.body, 'classifyConfocalPattern'));
  router.post('/pharmaco/genotype-interaction', (req, res) => runOr400(res, rareSpec.checkGenotypeDrugInteraction, req.body, 'checkGenotypeDrugInteraction'));
  router.post('/nano/protocol-compliance', (req, res) => runOr400(res, rareSpec.verifyNanomedicineProtocolCompliance, req.body, 'verifyNanomedicineProtocolCompliance'));

  // ====== Surgical — Wave 2 (10) ======
  router.post('/surg-onc/resectability-assessment', (req, res) => runOr400(res, surgWave2.checkTumorBoardSchedulingGate, req.body, 'checkTumorBoardSchedulingGate'));
  router.post('/endo-surg/nerve-monitoring-log', (req, res) => runOr400(res, surgWave2.checkNerveMonitoringAlert, req.body, 'checkNerveMonitoringAlert'));
  router.post('/robotic/docking-log', (req, res) => runOr400(res, surgWave2.checkDockingAngleSafety, req.body, 'checkDockingAngleSafety'));
  router.post('/bariatric/eligibility-check', (req, res) => runOr400(res, surgWave2.checkBariatricOrSchedulingGate, req.body, 'checkBariatricOrSchedulingGate'));
  router.post('/breast-surg/concordance-check', (req, res) => runOr400(res, surgWave2.checkBreastImagingPathologyConcordance, req.body, 'checkBreastImagingPathologyConcordance'));
  router.post('/trauma/mtp-activation', (req, res) => runOr400(res, surgWave2.checkMassiveTransfusionProtocol, req.body, 'checkMassiveTransfusionProtocol'));
  router.post('/surg/anastomotic-leak-risk', (req, res) => runOr400(res, surgWave2.checkAnastomoticLeakRisk, req.body, 'checkAnastomoticLeakRisk'));
  router.post('/neuro-monitoring/ionm-requirement', (req, res) => runOr400(res, surgWave2.checkIonmRequirement, req.body, 'checkIonmRequirement'));
  router.post('/spine/cauda-equina-emergency', (req, res) => runOr400(res, surgWave2.checkCaudaEquinaEmergency, req.body, 'checkCaudaEquinaEmergency'));
  router.post('/airway/compromise-alert', (req, res) => runOr400(res, surgWave2.checkAirwayCompromiseAlert, req.body, 'checkAirwayCompromiseAlert'));

  // List all available engines
  router.get('/', (req, res) => {
    res.json({
      ok: true,
      count: 110,
      waves: {
        phase3_b11_17: 48,
        wave5_critical_care: 9,
        wave4_diagnostics: 9,
        wave1_internal_medicine: 25,
        wave3_obgyn_peds: 9,
        rare_specialized: 12,
        wave2_surgical: 10
      },
      engines: {
        endocrine: ['thyroid', 'bone-density', 'obesity', 'glycemic-control'],
        pulmonary: ['copd-severity', 'asthma-control', 'sleep-study'],
        gastro: ['gi-bleed-risk', 'ibd-activity/mayo', 'ibd-activity/crohn'],
        nephrology: ['ckd/egfr', 'ckd/staging', 'hd-adequacy'],
        rheumatology: ['rheum/das28', 'rheum/sledai'],
        infectious: ['sepsis/news2'],
        critical_care: ['icu/nihss', 'icu/apache', 'stroke/tpa-eligibility', 'tox-er/toxidrome-id', 'obs-unit/disposition-check', 'minor-surg-er/wound-assessment', 'neuro-icu/icp-log', 'onc-icu/dual-surveillance', 'transplant-icu/dual-workup', 'hbot/pre-session-screen', 'trauma-center/activation-level'],
        obgyn: ['obgyn/partograph', 'obgyn/bishop', 'gyn-surg/mass-assessment', 'ivf/ohss-risk-check', 'adolescent-gyn/pubertal-assessment', 'menopause/hrt-eligibility', 'urogyn/routing-check', 'peds-genetics/carrier-screening-check', 'peds/malnutrition-classification', 'peds/developmental-regression', 'peds/dose-guard'],
        dermatology: ['derm/pasi', 'derm/scorad'],
        trauma: ['trauma/gcs', 'trauma/iss', 'trauma/rts'],
        neonatal: ['neonatal/apgar', 'neonatal/bhutani', 'neonatal/birthweight'],
        palliative: ['palliative/kps', 'palliative/ecog', 'palliative/pps'],
        oncology: ['oncology/tnm', 'oncology/bsa', 'oncology/chemo-dose'],
        psychiatry: ['psych/phq9', 'psych/gad7', 'psych/wong-baker'],
        ent_ophthalmology: ['ent/pure-tone-avg', 'ent/visual-acuity', 'ent/glaucoma-risk'],
        urology: ['uro/ipss', 'uro/stones'],
        hematology_infectious: ['heme/wells-dvt', 'heme/wells-pe', 'heme/has-bled', 'heme/curb65'],
        surgical_preop: ['preop/asa', 'preop/rcri', 'preop/caprini'],
        nutrition: ['nutrition/bmi', 'nutrition/bee', 'nutrition/nrs2002'],
        diagnostics: ['nuc-med/preg-gate', 'immuno/pattern-label', 'mol-dx/variant-release', 'tox/acetaminophen-nomogram', 'eeg/ncse-alert', 'neuro-phy/guillain-barre', 'ct/contrast-extravasation', 'pulm/hemoptysis-alert', 'cf/sweat-test-validity'],
        internal_medicine: ['heart-failure/risk-score', 'vascular/risk-profile', 'sleep/hypoxemia-check', 'motility/surgical-consult-check', 'nuclear/safety-lock', 'preventive/risk-score', 'allergic-pulm/anaphylaxis-check', 'respiratory/abg-check', 'hepatology/liver-failure-alert', 'gastro/pancreatitis-alert', 'transplant/rejection-risk', 'heme-onc/chemo-safety-lock', 'heme-onc/hyperleukocytosis', 'heme/transfusion-reversal', 'heme-onc/febrile-neutropenia', 'gyn-onc/recurrence-risk', 'ob/preeclampsia-alert', 'ibd/step-up-therapy', 'endocrine/hypercalcemic-crisis', 'bariatric/weight-loss-plateau', 'gyn/pid-referral', 'lupus-nephritis/risk', 'tropical/severe-malaria', 'travel/vaccine-contraindication', 'nutrition/refeeding-syndrome'],
        rare_specialized: ['space-dive/dcs-risk', 'complex-sleep/parasomnia-classification', 'epilepsy-monitoring/localization-analysis', 'stem-cell/protocol-verification', 'fetal-surgery/consensus-check', 'syndromic/pattern-recognition', 'trajectory/safety-verify', 'isolation/entry-gate', 'surg-onc/margin-coverage', 'derm/confocal-pattern', 'pharmaco/genotype-interaction', 'nano/protocol-compliance'],
        surgical: ['surg-onc/resectability-assessment', 'endo-surg/nerve-monitoring-log', 'robotic/docking-log', 'bariatric/eligibility-check', 'breast-surg/concordance-check', 'trauma/mtp-activation', 'surg/anastomotic-leak-risk', 'neuro-monitoring/ionm-requirement', 'spine/cauda-equina-emergency', 'airway/compromise-alert']
      }
    });
  });

  return router;
}

module.exports = { makePhase3CalculatorsRouter };
