// multispecialty_engine_test.js
'use strict';

const asthma = require('./asthma_control_engine');
const copd = require('./copd_severity_engine');
const gi = require('./gi_bleed_risk_engine');
const ibd = require('./ibd_activity_engine');
const rheum = require('./rheum_activity_engine');
const bone = require('./bone_density_engine');
const neuro = require('./nihss_apache_engine');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
    if (ok) { pass++; console.log(`  PASS - ${name}`); }
    else { fail++; console.log(`  FAIL - ${name}${detail ? ' :: ' + detail : ''}`); }
};

console.log('\n=== Asthma ===');
try {
    const r = asthma.assessAsthmaControl({ current_step: 3, fev1_pct: 75, act_score: 18 });
    log(r.control === 'partly_controlled', 'Asthma partly controlled', r.control);
} catch (e) { log(false, 'Asthma', e.message); }

console.log('\n=== COPD ===');
try {
    const r = copd.copdSeverity({ fev1_pct: 55, cat_score: 18, exacerbations_last_12m: 2 });
    log(r.goldStage && r.goldGroup, 'COPD GOLD staging', `${r.goldStage}-${r.goldGroup}`);
} catch (e) { log(false, 'COPD', e.message); }

console.log('\n=== GI Bleed Risk ===');
try {
    const r = gi.giBleedRisk({
        hemoglobin_g_dL: 9, sex: 'male', systolic_bp_mmHg: 110, pulse_bpm: 90,
        BUN_mmol_L: 8, melena: false, syncope: false, age: 55,
        hepatic_disease: false, cardiac_failure: false, source: 'upper'
    });
    log(r.glascoGBS.score >= 0 && r.severity, 'GI bleed risk',
        `GBS=${r.glascoGBS.score}, severity=${r.severity}`);
} catch (e) { log(false, 'GI bleed', e.message); }

console.log('\n=== IBD Activity (UC Mayo) ===');
try {
    const r = ibd.ucMayoScore({
        stool_frequency_subscore: 2,
        rectal_bleeding_subscore: 1,
        endoscopic_subscore: 2,
        physician_global_subscore: 1
    });
    log(r.totalScore >= 0 && r.severity, 'UC Mayo', `score=${r.totalScore}, severity=${r.severity}`);
} catch (e) { log(false, 'UC Mayo', e.message); }

console.log('\n=== DAS28 (RA) ===');
try {
    const r = rheum.das28crp({
        tender_joints_28: 8, swollen_joints_28: 6, crp_mg_L: 25, patient_global_vas_0_100: 60
    });
    log(typeof r.das28 === 'number' && r.das28 > 0, 'DAS28-CRP',
        `score=${r.das28}, severity=${r.severity}`);
} catch (e) { log(false, 'DAS28', e.message); }

console.log('\n=== FRAX (Bone) ===');
try {
    const r = bone.fraxScore({
        age: 70, sex: 'female', weight_kg: 55, prior_fracture: true,
        femoral_neck_bmd_tscore: -2.5
    });
    log(typeof r.total10YrMajor === 'number' && r.total10YrMajor > 0, 'FRAX 70yo + prior fx',
        `10yr major=${r.total10YrMajor}%, hip=${r.total10YrHip}%`);
} catch (e) { log(false, 'FRAX', e.message); }

console.log('\n=== NIHSS (Stroke) ===');
try {
    const r = neuro.nihssScore({
        consciousness_lvlc: 0, consciousness_lvl1a: 0, consciousness_lvl1b: 0,
        best_gaze: 0, visual_field: 0, facial_palsy: 1,
        motor_arm_left: 2, motor_arm_right: 0,
        motor_leg_left: 2, motor_leg_right: 0,
        limb_ataxia: 0, sensory: 1,
        language: 1, dysarthria: 1, extinction_inattention: 0
    });
    log(r.nihss >= 0 && r.nihss <= 42 && r.severity, 'NIHSS moderate stroke',
        `score=${r.nihss}, severity=${r.severity}`);
} catch (e) { log(false, 'NIHSS', e.message); }

console.log(`\nALL PASS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
