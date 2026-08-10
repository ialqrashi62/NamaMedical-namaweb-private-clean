// onc_neph_obgyn_engine_test.js
'use strict';

const oncology = require('./oncology_engine');
const ckd = require('./ckd_staging_engine');
const hd = require('./hd_adequacy_engine');
const partograph = require('./partograph_extended_engine');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
    if (ok) { pass++; console.log(`  PASS - ${name}`); }
    else { fail++; console.log(`  FAIL - ${name}${detail ? ' :: ' + detail : ''}`); }
};

console.log('\n=== Oncology TNM ===');
try {
    const r = oncology.tnmStage({ T: 2, N: 1, M: 0 });
    log(r.stage && r.stage.length > 0, 'T2N1M0 = Stage IIIB', r.stage);
} catch (e) { log(false, 'TNM', e.message); }
try {
    const r = oncology.tnmStage({ T: 1, N: 0, M: 0 });
    log(r.stage === 'IA' || r.stage === 'I', 'T1N0M0 = Stage I', r.stage);
} catch (e) { log(false, 'TNM I', e.message); }

console.log('\n=== Oncology BSA ===');
try {
    const r = oncology.bodySurfaceArea({ height_cm: 175, weight_kg: 70 });
    log(Math.abs(r.bsa - 1.84) < 0.05, 'BSA 175cm/70kg ~ 1.84', `bsa=${r.bsa}`);
} catch (e) { log(false, 'BSA', e.message); }

console.log('\n=== Oncology Chemo Dose ===');
try {
    const r = oncology.chemoDose({
        drug_name: 'Paclitaxel', dose_mg_per_m2: 175,
        height_cm: 175, weight_kg: 70,
        renal_function_pct: 100, hepatic_function_pct: 100
    });
    log(r.calculatedDose > 0 && r.calculatedDose < 1000, 'Paclitaxel 175mg/m²',
        `dose=${r.calculatedDose}mg`);
} catch (e) { log(false, 'Chemo dose', e.message); }

console.log('\n=== CKD Staging ===');
try {
    const r = ckd.ckdEgfr({ age: 65, sex: 'male', creatinine_mg_dL: 2.0, race_black: false });
    log(r.egfr > 0 && r.egfr < 90, '65yo male cr 2.0', `egfr=${r.egfr}`);
} catch (e) { log(false, 'CKD egfr', e.message); }
try {
    const r = ckd.ckdStaging({
        egfr: 45, age: 65, sex: 'male', creatinine_mg_dL: 2.0,
        race_black: false, albumin_creatinine_ratio_mg_g: 50
    });
    log(r.kdigoStage && r.kdigoStage.startsWith('G3'), 'KDIGO stage', r.kdigoStage);
} catch (e) { log(false, 'CKD stage', e.message); }

console.log('\n=== HD Adequacy ===');
try {
    const r = hd.hdAdequacy({
        pre_bun_mg_dL: 60, post_bun_mg_dL: 18,
        session_hours: 4, sessions_per_week: 3,
        weight_kg: 70, uf_volume_L: 2,
        dialyzer_koA: 1500, qb_blood_flow_mL_min: 300
    });
    log(r.spKtV > 0 && r.adequacy, 'HD adequacy', `spKtV=${r.spKtV.toFixed(2)}, adequacy=${r.adequacy}`);
} catch (e) { log(false, 'HD adequacy', e.message); }

console.log('\n=== Partograph ===');
try {
    const r = partograph.partographAssessment({
        current_dilation_cm: 6, hours_since_4cm: 2,
        parity: 'nulliparous',
        contractions_per_10min: 4, descent_station: 0
    });
    log(r.severity === 'normal', 'Partograph normal', r.severity);
} catch (e) { log(false, 'Partograph', e.message); }

try {
    const r = partograph.partographAssessment({
        current_dilation_cm: 5, hours_since_4cm: 4,
        parity: 'nulliparous',
        contractions_per_10min: 2, descent_station: -1
    });
    log(r.severity !== 'normal', 'Partograph abnormal', r.severity);
} catch (e) { log(false, 'Partograph abnormal', e.message); }

console.log('\n=== Bishop Score ===');
try {
    const r = partograph.bishopScore({
        dilation_cm: 4, effacement_pct: 60, station: -1,
        consistency: 'medium', position: 'anterior'
    });
    log(r && typeof r.bishop === 'number' && r.bishop >= 5 && r.bishop <= 13, 'Bishop favorable', `score=${r.bishop}`);
} catch (e) { log(false, 'Bishop', e.message); }

console.log(`\nALL PASS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
