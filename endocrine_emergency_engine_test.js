// endocrine_emergency_engine_test.js
// Pure tests for endocrine + emergency routers/engines
'use strict';

const glycemic = require('./glycemic_control_engine');
const thyroid = require('./thyroid_engine');
const esi = require('./esi_engine');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
    if (ok) { pass++; console.log(`  PASS - ${name}`); }
    else { fail++; console.log(`  FAIL - ${name}${detail ? ' :: ' + detail : ''}`); }
};

console.log('\n=== Glycemic Control ===');
try {
    const r = glycemic.glycemicControl({
        patient_type: 'type2', age: 55,
        tir_pct: 75, gmi_pct: 6.8, hba1c: 6.8,
        time_below_70: 3, time_below_54: 0
    });
    log(['optimal','suboptimal','poor','normal'].includes(r.severity), 'glycemic T2DM controlled', `severity=${r.severity}`);
} catch (e) { log(false, 'glycemic', e.message); }

try {
    glycemic.glycemicControl({ patient_type: 'type1' });
    log(false, 'glycemic missing fields', 'should throw');
} catch (e) {
    log(e.message.includes('required'), 'glycemic fails closed');
}

console.log('\n=== Thyroid ===');
try {
    const r = thyroid.interpretThyroid({ tsh: 0.1, ft4: 2.5 });
    log(r.pattern === 'overt_hyperthyroid', 'Thyroid hyperthyroid', r.pattern);
} catch (e) { log(false, 'thyroid hyper', e.message); }

try {
    const r = thyroid.interpretThyroid({ tsh: 25, ft4: 0.5 });
    log(r.pattern === 'overt_hypothyroid', 'Thyroid hypothyroid', r.pattern);
} catch (e) { log(false, 'thyroid hypo', e.message); }

console.log('\n=== ESI Triage ===');
try {
    const r1 = esi.computeESI({
        chief_complaint: 'cardiac arrest',
        cardiac_arrest: true,
        vitals: { heart_rate: 0, systolic_bp: 0, spo2_pct: 60, rr_per_min: 0, gcs_total: 3 }
    });
    log(r1.esi_level === 1, 'ESI 1 cardiac arrest', `level=${r1.esi_level}`);
} catch (e) { log(false, 'ESI 1', e.message); }

try {
    // ESI 2 — high-risk chest pain
    const r2 = esi.computeESI({
        chief_complaint: 'chest pain',
        vitals: { heart_rate: 40, systolic_bp: 80, spo2_pct: 95, rr_per_min: 22 }
    });
    log(r2.esi_level === 2, 'ESI 2 high-risk chest pain', `level=${r2.esi_level}`);
} catch (e) { log(false, 'ESI 2', e.message); }

try {
    const r5 = esi.computeESI({
        chief_complaint: 'sore throat',
        vitals: { heart_rate: 80, systolic_bp: 130, spo2_pct: 99, pain_score: 3 }
    });
    log(r5.esi_level >= 3 && r5.esi_level <= 5, 'ESI 3-5 minor complaint', `level=${r5.esi_level}`);
} catch (e) { log(false, 'ESI 5', e.message); }

console.log(`\nALL PASS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
