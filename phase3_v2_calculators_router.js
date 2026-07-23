// phase3_calculators_router_wave5678_extension.js
// Auto-mounted into phase3_calculators_router.js at /api/phase3.
// Adds 47 new clinical engine endpoints from Waves 1 batch5, 2 batch2, 3 batch2, 4 batch2,
// 5 batch2, 6, 7, 8. All routes are requireAuth + requireTenantScope (inherited from parent).
//
// Mounted at /api/phase3/v2/* so existing routes are not shadowed.

'use strict';

const express = require('express');

// Wave 1 Internal Medicine batch 5 (6 functions)
const imWave1b5 = require('./internal_medicine_wave1_engine_batch5');
// Wave 2 Surgical batch 2 (7 functions)
const surgWave2b2 = require('./surgical_wave2_engine_batch2');
// Wave 3 OBGYN & Peds batch 2 (7 functions)
const obgynWave3b2 = require('./obgyn_peds_wave3_engine_batch2');
// Wave 4 Diagnostics batch 2 (6 functions)
const wave4dxb2 = require('./diagnostics_wave4_engine_batch2');
// Wave 5 Critical Care batch 2 (5 functions)
const wave5ccb2 = require('./critical_care_wave5_engine_batch2');
// Wave 6 Therapeutic & Rehab (7 functions)
const wave6rehab = require('./therapeutic_rehab_wave6_engine');
// Wave 7 Support Services (5 functions)
const wave7sup = require('./support_services_wave7_engine');
// Wave 8 Admin & Academic (4 functions)
const wave8adm = require('./admin_academic_wave8_engine');

function runOr400(res, fn, args, functionName) {
  try {
    const r = typeof fn === 'function' ? fn(args || {}) : null;
    if (!r || typeof r !== 'object') {
      return res.status(500).json({ ok: false, code: 'bad_engine_output' });
    }
    const { value, score, ...rest } = r;
    const merged = { value: (value !== undefined ? value : score), ...rest };
    return res.json({ ok: true, function: functionName, input: args, ...merged });
  } catch (e) {
    return res.status(400).json({ ok: false, code: 'engine_error', error: e.message });
  }
}

function makePhase3V2Router({ requireAuth, requireTenantScope }) {
  const router = express.Router();
  router.use(requireAuth, requireTenantScope);

  // ====== Wave 1 Internal Medicine batch 5 ======
  router.post('/im/hf-aha-stage', (req, res) => runOr400(res, imWave1b5.calculateHFAHAStage, req.body, 'calculateHFAHAStage'));
  router.post('/im/chadsvasc-refined', (req, res) => runOr400(res, imWave1b5.calculateCHADSVAScRefined, req.body, 'calculateCHADSVAScRefined'));
  router.post('/im/lvad-eligibility', (req, res) => runOr400(res, imWave1b5.calculateLVADEligibility, req.body, 'calculateLVADEligibility'));
  router.post('/im/ascvd-risk', (req, res) => runOr400(res, imWave1b5.stratifyAccAhaRisk, req.body, 'stratifyAccAhaRisk'));
  router.post('/im/cardio-obstetric-risk', (req, res) => runOr400(res, imWave1b5.assessCardioObstetricRisk, req.body, 'assessCardioObstetricRisk'));
  router.post('/im/syntax-score', (req, res) => runOr400(res, imWave1b5.calculateSyntaxScore, req.body, 'calculateSyntaxScore'));

  // ====== Wave 2 Surgical batch 2 ======
  router.post('/surg/bariatric-eligibility', (req, res) => runOr400(res, surgWave2b2.calculateBariatricEligibility, req.body, 'calculateBariatricEligibility'));
  router.post('/surg/nac-benefit', (req, res) => runOr400(res, surgWave2b2.calculateNACBenefit, req.body, 'calculateNACBenefit'));
  router.post('/surg/trauma-activation', (req, res) => runOr400(res, surgWave2b2.calculateTraumaActivation, req.body, 'calculateTraumaActivation'));
  router.post('/surg/iss', (req, res) => runOr400(res, surgWave2b2.calculateISS, req.body, 'calculateISS'));
  router.post('/surg/clavien-dindo', (req, res) => runOr400(res, surgWave2b2.calculateClavienDindo, req.body, 'calculateClavienDindo'));
  router.post('/surg/asa', (req, res) => runOr400(res, surgWave2b2.calculateASA, req.body, 'calculateASA'));
  router.post('/surg/rcri', (req, res) => runOr400(res, surgWave2b2.calculateRCRI, req.body, 'calculateRCRI'));

  // ====== Wave 3 OBGYN & Peds batch 2 ======
  router.post('/obgyn/edd-from-lmp', (req, res) => runOr400(res, obgynWave3b2.calculateEDDFromLMP, req.body, 'calculateEDDFromLMP'));
  router.post('/obgyn/ga-from-us', (req, res) => runOr400(res, obgynWave3b2.calculateGAFromUS, req.body, 'calculateGAFromUS'));
  router.post('/obgyn/preeclampsia', (req, res) => runOr400(res, obgynWave3b2.assessPreEclampsia, req.body, 'assessPreEclampsia'));
  router.post('/obgyn/ivf-outcome', (req, res) => runOr400(res, obgynWave3b2.assessIVFCycleOutcome, req.body, 'assessIVFCycleOutcome'));
  router.post('/obgyn/adolescent-gyn', (req, res) => runOr400(res, obgynWave3b2.assessAdolescentGyneProblem, req.body, 'assessAdolescentGyneProblem'));
  router.post('/peds/dehydration', (req, res) => runOr400(res, obgynWave3b2.assessPedsDehydration, req.body, 'assessPedsDehydration'));
  router.post('/peds/pews', (req, res) => runOr400(res, obgynWave3b2.assessPEWSPediatric, req.body, 'assessPEWSPediatric'));

  // ====== Wave 4 Diagnostics batch 2 ======
  router.post('/dx/birads', (req, res) => runOr400(res, wave4dxb2.interpretBIRADS, req.body, 'interpretBIRADS'));
  router.post('/dx/bacterial-sensitivities', (req, res) => runOr400(res, wave4dxb2.interpretBacterialSensitivities, req.body, 'interpretBacterialSensitivities'));
  router.post('/dx/pft', (req, res) => runOr400(res, wave4dxb2.interpretPFT, req.body, 'interpretPFT'));
  router.post('/dx/gcs', (req, res) => runOr400(res, wave4dxb2.interpretGCS, req.body, 'interpretGCS'));
  router.post('/dx/cardiac-biomarkers', (req, res) => runOr400(res, wave4dxb2.interpretCardiacBiomarkers, req.body, 'interpretCardiacBiomarkers'));
  router.post('/dx/sleep-study', (req, res) => runOr400(res, wave4dxb2.interpretSleepStudy, req.body, 'interpretSleepStudy'));

  // ====== Wave 5 Critical Care batch 2 ======
  router.post('/cc/sofa', (req, res) => runOr400(res, wave5ccb2.calculateSOFA, req.body, 'calculateSOFA'));
  router.post('/cc/rass', (req, res) => runOr400(res, wave5ccb2.assessRASS, req.body, 'assessRASS'));
  router.post('/cc/vent-settings', (req, res) => runOr400(res, wave5ccb2.calculateVentSettings, req.body, 'calculateVentSettings'));
  router.post('/cc/transfusion', (req, res) => runOr400(res, wave5ccb2.assessTransfusion, req.body, 'assessTransfusion'));
  router.post('/cc/nutrition', (req, res) => runOr400(res, wave5ccb2.calculateNutrition, req.body, 'calculateNutrition'));

  // ====== Wave 6 Therapeutic & Rehab ======
  router.post('/rehab/berg-balance', (req, res) => runOr400(res, wave6rehab.assessBergBalance, req.body, 'assessBergBalance'));
  router.post('/rehab/tinetti', (req, res) => runOr400(res, wave6rehab.assessTinetti, req.body, 'assessTinetti'));
  router.post('/rehab/fim', (req, res) => runOr400(res, wave6rehab.assessFIM, req.body, 'assessFIM'));
  router.post('/rehab/pain-nrs', (req, res) => runOr400(res, wave6rehab.assessPainNRS, req.body, 'assessPainNRS'));
  router.post('/rehab/swallow-screen', (req, res) => runOr400(res, wave6rehab.assessSwallowScreening, req.body, 'assessSwallowScreening'));
  router.post('/rehab/cardiac-rehab', (req, res) => runOr400(res, wave6rehab.assessCardiacRehabPhase, req.body, 'assessCardiacRehabPhase'));
  router.post('/rehab/pulmonary-rehab', (req, res) => runOr400(res, wave6rehab.assessPulmonaryRehabEligibility, req.body, 'assessPulmonaryRehabEligibility'));

  // ====== Wave 7 Support Services ======
  router.post('/support/nutrition-nrs', (req, res) => runOr400(res, wave7sup.screenNutritionNRS, req.body, 'screenNutritionNRS'));
  router.post('/support/malnutrition-must', (req, res) => runOr400(res, wave7sup.screenMalnutritionMUST, req.body, 'screenMalnutritionMUST'));
  router.post('/support/social-work', (req, res) => runOr400(res, wave7sup.screenSocialWork, req.body, 'screenSocialWork'));
  router.post('/support/biomed-pm', (req, res) => runOr400(res, wave7sup.planBiomedPM, req.body, 'planBiomedPM'));
  router.post('/support/device-failure', (req, res) => runOr400(res, wave7sup.assessMedicalDeviceFailure, req.body, 'assessMedicalDeviceFailure'));

  // ====== Wave 8 Admin & Academic ======
  router.post('/admin/hai-sir', (req, res) => runOr400(res, wave8adm.calculateHAI, req.body, 'calculateHAI'));
  router.post('/admin/research-eligibility', (req, res) => runOr400(res, wave8adm.screenResearchEligibility, req.body, 'screenResearchEligibility'));
  router.post('/admin/provider-credential', (req, res) => runOr400(res, wave8adm.assessProviderCredential, req.body, 'assessProviderCredential'));
  router.post('/admin/cme', (req, res) => runOr400(res, wave8adm.trackCME, req.body, 'trackCME'));

  // Endpoint index
  router.get('/', (req, res) => {
    res.json({
      ok: true,
      count: 47,
      waves: {
        wave1_internal_medicine_batch5: 6,
        wave2_surgical_batch2: 7,
        wave3_obgyn_peds_batch2: 7,
        wave4_diagnostics_batch2: 6,
        wave5_critical_care_batch2: 5,
        wave6_therapeutic_rehab: 7,
        wave7_support_services: 5,
        wave8_admin_academic: 4
      }
    });
  });

  return router;
}

module.exports = { makePhase3V2Router };
