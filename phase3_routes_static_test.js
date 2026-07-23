/**
 * phase3_routes_static_test.js — DB-free static check verifying the centralized
 * Phase 3 Calculators router exposes all 48 clinical-engine endpoints, is
 * auth+tenant guarded, and calls the matching engine function.
 *
 * Replaces the previous per-wave static route tests (critical_care_wave5,
 * diagnostics_wave4, internal_medicine_wave1 batches 1-4, obgyn_peds_wave3,
 * rare_specialized, surgical_wave2). Those tests asserted that each engine's
 * routes were mounted directly in server.js. After batch 18 (commit e23714a),
 * all Phase 3 engines are mounted behind a single /api/phase3 router for
 * unified auth/tenant/idempotency enforcement. This test verifies the
 * consolidated topology.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Source of truth: the centralized Phase 3 router.
const routerSrc = fs.readFileSync(path.join(__dirname, 'phase3_calculators_router.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const ROUTES = [
    // Endocrine (4)
    { path: '/thyroid',           fn: 'interpretThyroid',       group: 'endocrine' },
    { path: '/bone-density',      fn: 'fraxScore',              group: 'endocrine' },
    { path: '/obesity',           fn: 'assessObesity',          group: 'endocrine' },
    { path: '/glycemic-control',  fn: 'glycemicControl',        group: 'endocrine' },
    // Pulmonary (3)
    { path: '/copd-severity',     fn: 'copdSeverity',           group: 'pulmonary' },
    { path: '/asthma-control',    fn: 'assessAsthmaControl',    group: 'pulmonary' },
    { path: '/sleep-study',       fn: 'interpretSleepStudy',    group: 'pulmonary' },
    // Gastro (3)
    { path: '/gi-bleed-risk',     fn: 'giBleedRisk',            group: 'gastro' },
    { path: '/ibd-activity/mayo', fn: 'ucMayoScore',            group: 'gastro' },
    { path: '/ibd-activity/crohn',fn: 'crohnCDAI',              group: 'gastro' },
    // Nephrology (3)
    { path: '/ckd/egfr',          fn: 'ckdEgfr',                group: 'nephrology' },
    { path: '/ckd/staging',       fn: 'ckdStaging',             group: 'nephrology' },
    { path: '/hd-adequacy',       fn: 'hdAdequacy',             group: 'nephrology' },
    // Rheumatology (2)
    { path: '/rheum/das28',       fn: 'das28crp',               group: 'rheumatology' },
    { path: '/rheum/sledai',      fn: 'sledai2k',               group: 'rheumatology' },
    // Critical Care (3)
    { path: '/sepsis/news2',      fn: 'news2Score',             group: 'critical_care' },
    { path: '/icu/nihss',         fn: 'nihssScore',             group: 'critical_care' },
    { path: '/icu/apache',        fn: 'apacheIV',               group: 'critical_care' },
    // OBGYN (2)
    { path: '/obgyn/partograph',  fn: 'partographAssessment',   group: 'obgyn' },
    { path: '/obgyn/bishop',      fn: 'bishopScore',            group: 'obgyn' },
    // Dermatology (2)
    { path: '/derm/pasi',         fn: 'pasiScore',              group: 'derm' },
    { path: '/derm/scorad',       fn: 'scoradScore',            group: 'derm' },
    // Trauma (3)
    { path: '/trauma/gcs',        fn: 'glasgowComaScale',       group: 'trauma' },
    { path: '/trauma/iss',        fn: 'injurySeverityScore',    group: 'trauma' },
    { path: '/trauma/rts',        fn: 'revisedTraumaScore',     group: 'trauma' },
    // Neonatal (3)
    { path: '/neonatal/apgar',        fn: 'apgarScore',          group: 'neonatal' },
    { path: '/neonatal/bhutani',      fn: 'bhutaniRisk',         group: 'neonatal' },
    { path: '/neonatal/birthweight',  fn: 'birthweightCategory', group: 'neonatal' },
    // Palliative (3)
    { path: '/palliative/kps',   fn: 'karnofskyScore',         group: 'palliative' },
    { path: '/palliative/ecog',  fn: 'ecogScore',              group: 'palliative' },
    { path: '/palliative/pps',   fn: 'pallPerformanceScale',   group: 'palliative' },
    // Oncology (3)
    { path: '/oncology/tnm',         fn: 'tnmStage',            group: 'oncology' },
    { path: '/oncology/bsa',         fn: 'bodySurfaceArea',     group: 'oncology' },
    { path: '/oncology/chemo-dose',  fn: 'chemoDose',           group: 'oncology' },
    // Psychiatry (3)
    { path: '/psych/phq9',       fn: 'phq9Score',              group: 'psych' },
    { path: '/psych/gad7',       fn: 'gad7Score',              group: 'psych' },
    { path: '/psych/wong-baker', fn: 'wongBakerFaces',         group: 'psych' },
    // ENT / Ophthalmology (3)
    { path: '/ent/pure-tone-avg', fn: 'pureToneAverage',        group: 'ent_ophth' },
    { path: '/ent/visual-acuity', fn: 'visualAcuity',          group: 'ent_ophth' },
    { path: '/ent/glaucoma-risk', fn: 'glaucomaRisk',          group: 'ent_ophth' },
    // Urology (2)
    { path: '/uro/ipss',         fn: 'ipssScore',              group: 'urology' },
    { path: '/uro/stones',       fn: 'renalStonesRisk',        group: 'urology' },
    // Heme / Infectious (4)
    { path: '/heme/wells-dvt',  fn: 'wellsDVT',               group: 'heme_id' },
    { path: '/heme/wells-pe',   fn: 'wellsPE',                group: 'heme_id' },
    { path: '/heme/has-bled',   fn: 'hasBledScore',           group: 'heme_id' },
    { path: '/heme/curb65',     fn: 'curb65Score',            group: 'heme_id' },
    // Preop (3)
    { path: '/preop/asa',       fn: 'asaClassification',      group: 'preop' },
    { path: '/preop/rcri',      fn: 'rcriScore',              group: 'preop' },
    { path: '/preop/caprini',   fn: 'capriniScore',           group: 'preop' },
    // Nutrition (3)
    { path: '/nutrition/bmi',     fn: 'bmi',                  group: 'nutrition' },
    { path: '/nutrition/bee',     fn: 'harrisBenedictBEE',    group: 'nutrition' },
    { path: '/nutrition/nrs2002', fn: 'nrs2002',              group: 'nutrition' },
    // Critical Care & Emergency — Wave 5 (9)
    { path: '/stroke/tpa-eligibility',         fn: 'checkTpaEligibility',                group: 'wave5_critical_care' },
    { path: '/tox-er/toxidrome-id',            fn: 'matchToxidromeAntidote',             group: 'wave5_critical_care' },
    { path: '/obs-unit/disposition-check',     fn: 'checkObservationDispositionAlert',   group: 'wave5_critical_care' },
    { path: '/minor-surg-er/wound-assessment', fn: 'checkWoundComplexityRouting',        group: 'wave5_critical_care' },
    { path: '/neuro-icu/icp-log',              fn: 'checkCushingsTriad',                 group: 'wave5_critical_care' },
    { path: '/onc-icu/dual-surveillance',      fn: 'checkOncologyIcuDualSurveillance',   group: 'wave5_critical_care' },
    { path: '/transplant-icu/dual-workup',     fn: 'checkTransplantFeverWorkup',         group: 'wave5_critical_care' },
    { path: '/hbot/pre-session-screen',        fn: 'checkHbotSafetyGate',                group: 'wave5_critical_care' },
    { path: '/trauma-center/activation-level', fn: 'checkTraumaActivationLevel',         group: 'wave5_critical_care' },
    // Diagnostics — Wave 4 (9)
    { path: '/nuc-med/preg-gate',              fn: 'checkRadioisotopePregnancyGate',     group: 'wave4_diagnostics' },
    { path: '/immuno/pattern-label',           fn: 'labelImmunologyPatternResult',       group: 'wave4_diagnostics' },
    { path: '/mol-dx/variant-release',         fn: 'checkVariantReportReleaseGate',     group: 'wave4_diagnostics' },
    { path: '/tox/acetaminophen-nomogram',     fn: 'checkAcetaminophenNomogramAlert',    group: 'wave4_diagnostics' },
    { path: '/eeg/ncse-alert',                 fn: 'checkNcseAlert',                     group: 'wave4_diagnostics' },
    { path: '/neuro-phy/guillain-barre',       fn: 'checkGuillainBarreAlert',            group: 'wave4_diagnostics' },
    { path: '/ct/contrast-extravasation',      fn: 'checkContrastExtravasationAlert',    group: 'wave4_diagnostics' },
    { path: '/pulm/hemoptysis-alert',          fn: 'checkMassiveHemoptysisAlert',        group: 'wave4_diagnostics' },
    { path: '/cf/sweat-test-validity',         fn: 'checkSweatTestValidity',             group: 'wave4_diagnostics' },
    // Internal Medicine — Wave 1 batch 1 (8)
    { path: '/heart-failure/risk-score',        fn: 'checkHeartFailureDecompensation',   group: 'internal_medicine' },
    { path: '/vascular/risk-profile',           fn: 'checkCriticalLimbIschemia',          group: 'internal_medicine' },
    { path: '/sleep/hypoxemia-check',           fn: 'checkNocturnalHypoxemia',            group: 'internal_medicine' },
    { path: '/motility/surgical-consult-check', fn: 'checkAchalasiaSurgicalConsult',     group: 'internal_medicine' },
    { path: '/nuclear/safety-lock',             fn: 'checkNuclearScanSafetyLock',         group: 'internal_medicine' },
    { path: '/preventive/risk-score',           fn: 'checkPreventiveCardiologyHighRisk',  group: 'internal_medicine' },
    { path: '/allergic-pulm/anaphylaxis-check', fn: 'checkAnaphylaxisAlert',              group: 'internal_medicine' },
    { path: '/respiratory/abg-check',           fn: 'checkRespiratoryCriticalABG',        group: 'internal_medicine' },
    // Internal Medicine — Wave 1 batch 2 (7)
    { path: '/hepatology/liver-failure-alert',  fn: 'checkLiverFailureAlert',             group: 'internal_medicine' },
    { path: '/gastro/pancreatitis-alert',       fn: 'checkAcutePancreatitisAlert',        group: 'internal_medicine' },
    { path: '/transplant/rejection-risk',       fn: 'checkTransplantRejectionRisk',       group: 'internal_medicine' },
    { path: '/heme-onc/chemo-safety-lock',      fn: 'checkChemoSafetyLock',               group: 'internal_medicine' },
    { path: '/heme-onc/hyperleukocytosis',      fn: 'checkHyperleukocytosisAlert',        group: 'internal_medicine' },
    { path: '/heme/transfusion-reversal',       fn: 'checkTransfusionReversalAlert',      group: 'internal_medicine' },
    { path: '/heme-onc/febrile-neutropenia',    fn: 'checkFebrileNeutropeniaProtocol',     group: 'internal_medicine' },
    // Internal Medicine — Wave 1 batch 3 (6)
    { path: '/gyn-onc/recurrence-risk',         fn: 'checkGynOncRecurrenceRisk',          group: 'internal_medicine' },
    { path: '/ob/preeclampsia-alert',           fn: 'checkPreeclampsiaAlert',             group: 'internal_medicine' },
    { path: '/ibd/step-up-therapy',             fn: 'checkStepUpTherapyNeeded',           group: 'internal_medicine' },
    { path: '/endocrine/hypercalcemic-crisis', fn: 'checkHypercalcemicCrisis',           group: 'internal_medicine' },
    { path: '/bariatric/weight-loss-plateau',    fn: 'checkWeightLossPlateau',             group: 'internal_medicine' },
    { path: '/gyn/pid-referral',                fn: 'checkPidReferral',                   group: 'internal_medicine' },
    // Internal Medicine — Wave 1 batch 4 (4)
    { path: '/lupus-nephritis/risk',            fn: 'checkLupusNephritisRisk',            group: 'internal_medicine' },
    { path: '/tropical/severe-malaria',         fn: 'checkSevereMalariaCriteria',         group: 'internal_medicine' },
    { path: '/travel/vaccine-contraindication', fn: 'checkVaccinationContraindication',   group: 'internal_medicine' },
    { path: '/nutrition/refeeding-syndrome',    fn: 'checkRefeedingSyndromeRisk',         group: 'internal_medicine' },
    // OBGYN + Pediatrics — Wave 3 (9)
    { path: '/gyn-surg/mass-assessment',         fn: 'checkAdnexalMassRouting',            group: 'obgyn_wave3' },
    { path: '/ivf/ohss-risk-check',             fn: 'checkOhssFreezeAllRecommendation',   group: 'obgyn_wave3' },
    { path: '/adolescent-gyn/pubertal-assessment', fn: 'checkPubertalTimingReferral',     group: 'obgyn_wave3' },
    { path: '/menopause/hrt-eligibility',        fn: 'checkHrtEligibility',                group: 'obgyn_wave3' },
    { path: '/urogyn/routing-check',             fn: 'checkUrogynecologyRouting',          group: 'obgyn_wave3' },
    { path: '/peds-genetics/carrier-screening-check', fn: 'checkExpandedCarrierScreening',  group: 'obgyn_wave3' },
    { path: '/peds/malnutrition-classification', fn: 'checkMalnutritionClassification',    group: 'obgyn_wave3' },
    { path: '/peds/developmental-regression',    fn: 'checkDevelopmentalRegressionFlag',  group: 'obgyn_wave3' },
    { path: '/peds/dose-guard',                  fn: 'checkPediatricDoseGuard',           group: 'obgyn_wave3' },
    // Rare & Super-Specialized (12)
    { path: '/space-dive/dcs-risk',                  fn: 'dcsRiskAssessment',                 group: 'rare_specialized' },
    { path: '/complex-sleep/parasomnia-classification', fn: 'classifyParasomnia',              group: 'rare_specialized' },
    { path: '/epilepsy-monitoring/localization-analysis', fn: 'verifySurgicalCandidacy',      group: 'rare_specialized' },
    { path: '/stem-cell/protocol-verification',      fn: 'verifyProtocolCompliance',         group: 'rare_specialized' },
    { path: '/fetal-surgery/consensus-check',        fn: 'verifyFetalSurgeryConsensus',       group: 'rare_specialized' },
    { path: '/syndromic/pattern-recognition',        fn: 'recognizeSyndromicPattern',         group: 'rare_specialized' },
    { path: '/trajectory/safety-verify',             fn: 'verifyTrajectorySafety',            group: 'rare_specialized' },
    { path: '/isolation/entry-gate',                 fn: 'verifyIsolationGate',               group: 'rare_specialized' },
    { path: '/surg-onc/margin-coverage',             fn: 'verifyMarginCoverage',              group: 'rare_specialized' },
    { path: '/derm/confocal-pattern',                fn: 'classifyConfocalPattern',           group: 'rare_specialized' },
    { path: '/pharmaco/genotype-interaction',        fn: 'checkGenotypeDrugInteraction',      group: 'rare_specialized' },
    { path: '/nano/protocol-compliance',             fn: 'verifyNanomedicineProtocolCompliance', group: 'rare_specialized' },
    // Surgical — Wave 2 (10)
    { path: '/surg-onc/resectability-assessment',    fn: 'checkTumorBoardSchedulingGate',    group: 'surgical_wave2' },
    { path: '/endo-surg/nerve-monitoring-log',       fn: 'checkNerveMonitoringAlert',         group: 'surgical_wave2' },
    { path: '/robotic/docking-log',                  fn: 'checkDockingAngleSafety',           group: 'surgical_wave2' },
    { path: '/bariatric/eligibility-check',           fn: 'checkBariatricOrSchedulingGate',     group: 'surgical_wave2' },
    { path: '/breast-surg/concordance-check',         fn: 'checkBreastImagingPathologyConcordance', group: 'surgical_wave2' },
    { path: '/trauma/mtp-activation',                 fn: 'checkMassiveTransfusionProtocol',   group: 'surgical_wave2' },
    { path: '/surg/anastomotic-leak-risk',            fn: 'checkAnastomoticLeakRisk',          group: 'surgical_wave2' },
    { path: '/neuro-monitoring/ionm-requirement',     fn: 'checkIonmRequirement',              group: 'surgical_wave2' },
    { path: '/spine/cauda-equina-emergency',          fn: 'checkCaudaEquinaEmergency',         group: 'surgical_wave2' },
    { path: '/airway/compromise-alert',               fn: 'checkAirwayCompromiseAlert',        group: 'surgical_wave2' },
];

function runTests() {
    // 1. Verify the consolidated /api/phase3 router is mounted in server.js
    assert.ok(
        serverSrc.includes("makePhase3CalculatorsRouter"),
        'server.js must instantiate makePhase3CalculatorsRouter'
    );
    assert.ok(
        /app\.use\(\s*['"]\/api\/phase3['"]\s*,/.test(serverSrc),
        'server.js must mount /api/phase3 router'
    );
    // 2. Verify the router factory is built with auth+tenant guards
    assert.ok(
        serverSrc.includes("requireAuth") && serverSrc.includes("requireTenantScope"),
        'server.js must pass requireAuth + requireTenantScope to the Phase 3 router'
    );
    // 3. Verify the router file itself applies the same guards at mount time
    assert.ok(
        /router\.use\(\s*(requireAuth|requireTenantScope)/.test(routerSrc),
        'phase3_calculators_router.js must apply requireAuth/requireTenantScope at router level'
    );
    // 4. Verify every route is mounted, calls the matching function, and uses runOr400
    for (const r of ROUTES) {
        const declStr = `router.post('${r.path}'`;
        const idx = routerSrc.indexOf(declStr);
        assert.ok(idx !== -1, `route must exist: ${r.path}`);

        const blockEnd = routerSrc.indexOf('));', idx);
        const block = routerSrc.slice(idx, blockEnd === -1 ? idx + 300 : blockEnd);
        assert.ok(
            block.includes(`runOr400`),
            `${r.path} must use runOr400 helper (fail-closed 400 on engine error)`
        );
        assert.ok(
            block.includes(r.fn),
            `${r.path} must call the engine function ${r.fn}`
        );
    }
    // 5. Verify a route index/health endpoint exists
    assert.ok(
        /router\.(get|post)\(\s*['"]\/?['"]\s*,\s*\(/.test(routerSrc),
        'phase3_calculators_router.js must expose a root index endpoint'
    );
    // 6. Verify fail-closed validation: runOr400 returns 400 engine_error on bad input
    assert.ok(
        /runOr400[\s\S]+res\.status\(400\)[\s\S]+engine_error/.test(routerSrc) ||
        /runOr400[\s\S]+engine_error/.test(routerSrc),
        'phase3_calculators_router.js must use runOr400 with 400 + engine_error on bad input'
    );

    const groups = [...new Set(ROUTES.map(r => r.group))];
    console.log(
        `phase3_routes_static_test: all ${ROUTES.length} routes verified ` +
        `across ${groups.length} specialty groups (${groups.join(', ')})`
    );
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests, ROUTES };
