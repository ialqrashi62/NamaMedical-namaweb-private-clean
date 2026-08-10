// cardiology_engine_test.js
// Pure-function tests for cardiology_engine.js (no DB)
// Run: node cardiology_engine_test.js

'use strict';

const engine = require('./cardiology_engine');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
    if (ok) { pass++; console.log(`  PASS - ${name}`); }
    else { fail++; console.log(`  FAIL - ${name}${detail ? ' :: ' + detail : ''}`); }
};

// ============================================================
// GRACE score
// ============================================================
console.log('\n=== GRACE ===');
try {
    const r = engine.graceScore({
        age: 65, heart_rate: 95, systolic_bp: 130,
        creatinine_mg_dl: 1.0, killip_class: 1
    });
    log(r.score > 100 && r.score < 180, 'GRACE 65yo low-risk', `score=${r.score}, risk=${r.risk}`);
    log(typeof r.in_hospital_mortality === 'number', 'GRACE returns mortality');
} catch (e) {
    log(false, 'GRACE 65yo', e.message);
}

try {
    const r = engine.graceScore({
        age: 82, heart_rate: 145, systolic_bp: 75,
        creatinine_mg_dl: 2.8, killip_class: 4,
        cardiac_arrest_at_admission: true, st_deviation: true
    });
    log(r.risk === 'high', 'GRACE 82yo high-risk', `score=${r.score}, risk=${r.risk}`);
} catch (e) {
    log(false, 'GRACE 82yo high-risk', e.message);
}

try {
    engine.graceScore({ age: 65 });
    log(false, 'GRACE missing fields', 'should throw');
} catch (e) {
    log(e.message.includes('heart_rate required'), 'GRACE fails closed on missing');
}

// ============================================================
// CHA2DS2-VASc
// ============================================================
console.log('\n=== CHA2DS2-VASc ===');
try {
    const r = engine.cha2ds2vasc({
        age: 55, sex: 'male', chf: false, hypertension: false,
        diabetes: false, stroke_history: false, vascular_disease: false
    });
    log(r.score === 0 && r.anticoagulation_recommendation === 'no_anticoagulation',
        'CHA2DS2-VASc male 55yo no risk factors', `score=${r.score}`);
} catch (e) { log(false, 'CHA2DS2-VASc no risk', e.message); }

try {
    const r = engine.cha2ds2vasc({
        age: 78, sex: 'female', chf: true, hypertension: true,
        diabetes: true, stroke_history: false, vascular_disease: true
    });
    log(r.score >= 6, 'CHA2DS2-VASc female 78yo multiple risk', `score=${r.score}`);
    log(r.anticoagulation_recommendation === 'recommended', 'anticoagulation recommended');
} catch (e) { log(false, 'CHA2DS2-VASc high risk', e.message); }

// ============================================================
// HAS-BLED
// ============================================================
console.log('\n=== HAS-BLED ===');
try {
    const r = engine.hasBled({
        uncontrolled_hypertension: false, abnormal_renal: false,
        abnormal_liver: false, stroke_history: false, bleeding_history: false,
        labile_inr: false, age: 50, concomitant_drugs: false, alcohol_use: false
    });
    log(r.score === 0 && r.risk === 'low', 'HAS-BLED 50yo no risk', `score=${r.score}`);
} catch (e) { log(false, 'HAS-BLED no risk', e.message); }

try {
    const r = engine.hasBled({
        uncontrolled_hypertension: true, abnormal_renal: true,
        abnormal_liver: true, stroke_history: true, bleeding_history: false,
        labile_inr: false, age: 80, concomitant_drugs: true, alcohol_use: true
    });
    log(r.score >= 5 && r.risk === 'high', 'HAS-BLED 80yo multiple risk', `score=${r.score}`);
} catch (e) { log(false, 'HAS-BLED high risk', e.message); }

// ============================================================
// Heart Failure
// ============================================================
console.log('\n=== Heart Failure Classification ===');
try {
    const r = engine.classifyHeartFailure({ nyha_class: 1, lvef_pct: 60 });
    log(r.nyha_class === 1 && r.accaha_stage === 'A', 'NYHA 1 + EF 60% = Stage A', `stage=${r.accaha_stage}`);
} catch (e) { log(false, 'HF NYHA1', e.message); }

try {
    const r = engine.classifyHeartFailure({ nyha_class: 3, lvef_pct: 25 });
    log(r.lvef_category === 'reduced' && r.recommended_therapy.length >= 3,
        'NYHA 3 + EF 25% = HFrEF + 4 drugs', `category=${r.lvef_category}, drugs=${r.recommended_therapy.length}`);
} catch (e) { log(false, 'HF HFrEF', e.message); }

try {
    engine.classifyHeartFailure({ nyha_class: 5 });
    log(false, 'HF invalid NYHA', 'should throw');
} catch (e) {
    log(e.message.includes('1-4'), 'HF rejects invalid NYHA');
}

// ============================================================
// Troponin
// ============================================================
console.log('\n=== Troponin ===');
try {
    const r = engine.interpretTroponin({
        troponin_value: 50, cutoff: 14, delta_pct: 250
    });
    log(r.interpretation === 'rule_in_acs', 'Troponin rule-in', `${r.interpretation}`);
} catch (e) { log(false, 'Troponin rule-in', e.message); }

try {
    const r = engine.interpretTroponin({
        troponin_value: 5, cutoff: 14, delta_pct: 0
    });
    log(r.interpretation === 'rule_out_acs', 'Troponin rule-out', `${r.interpretation}`);
} catch (e) { log(false, 'Troponin rule-out', e.message); }

try {
    engine.interpretTroponin({ troponin_value: 50, cutoff: 14 });
    log(false, 'Troponin missing delta', 'should throw');
} catch (e) {
    log(e.message.includes('delta_pct required'), 'Troponin fails closed');
}

// ============================================================
// STEMI
// ============================================================
console.log('\n=== STEMI Detection ===');
try {
    const r = engine.detectStemi({ st_elevation_mm: 3, leads: ['V1', 'V2', 'V3'] });
    log(r.is_stemi === true && r.territory === 'anterior', 'Anterior STEMI', `${r.territory}`);
    log(r.action === 'ACTIVATE_CATH_LAB', 'Anterior STEMI activates cath lab');
} catch (e) { log(false, 'STEMI anterior', e.message); }

try {
    const r = engine.detectStemi({ st_elevation_mm: 2, leads: ['II', 'III', 'aVF'] });
    log(r.is_stemi === true && r.territory === 'inferior', 'Inferior STEMI');
} catch (e) { log(false, 'STEMI inferior', e.message); }

try {
    const r = engine.detectStemi({ st_elevation_mm: 0, leads: ['V1', 'V2', 'V3'] });
    log(r.is_stemi === false, 'No STEMI (normal ECG)');
} catch (e) { log(false, 'No STEMI', e.message); }

try {
    const r = engine.detectStemi({ st_elevation_mm: -2, leads: ['V1', 'V2', 'V3'] });
    log(r.is_stemi === true && r.territory === 'posterior', 'Posterior STEMI (ST depression)');
} catch (e) { log(false, 'STEMI posterior', e.message); }

try {
    engine.detectStemi({ st_elevation_mm: 2 });
    log(false, 'STEMI missing leads', 'should throw');
} catch (e) {
    log(e.message.includes('leads required'), 'STEMI fails closed');
}

// ============================================================
// ICD-10 codes
// ============================================================
console.log('\n=== ICD-10 codes ===');
log(engine.CARDIOLOGY_ICD10.ACS_STEMI_ANTERIOR === 'I21.0', 'STEMI anterior = I21.0');
log(engine.CARDIOLOGY_ICD10.ATRIAL_FIBRILLATION === 'I48.91', 'AF = I48.91');
log(engine.CARDIOLOGY_ICD10.HF_REDUCED_EF === 'I50.32', 'HFrEF = I50.32');

console.log(`\nALL PASS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
