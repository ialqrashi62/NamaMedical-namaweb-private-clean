// phase3_calculators_router.js
// REST API router for the 26 NEW clinical engines created in Phase 3 batches 11-17.
// Each engine is pure deterministic, throws on invalid input, and returns a standard envelope:
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

  // List all available engines
  router.get('/', (req, res) => {
    res.json({
      ok: true,
      count: 48,
      engines: {
        endocrine: ['thyroid', 'bone-density', 'obesity', 'glycemic-control'],
        pulmonary: ['copd-severity', 'asthma-control', 'sleep-study'],
        gastro: ['gi-bleed-risk', 'ibd-activity/mayo', 'ibd-activity/crohn'],
        nephrology: ['ckd/egfr', 'ckd/staging', 'hd-adequacy'],
        rheumatology: ['rheum/das28', 'rheum/sledai'],
        infectious: ['sepsis/news2'],
        critical_care: ['icu/nihss', 'icu/apache'],
        obgyn: ['obgyn/partograph', 'obgyn/bishop'],
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
        nutrition: ['nutrition/bmi', 'nutrition/bee', 'nutrition/nrs2002']
      }
    });
  });

  return router;
}

module.exports = { makePhase3CalculatorsRouter };
