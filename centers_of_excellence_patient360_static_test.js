/**
 * centers_of_excellence_patient360_static_test.js — DB-free static checks for the
 * Wave 9 (Centers of Excellence) Patient-360 aggregation endpoints added to server.js.
 * Verifies each route exists, is auth+role guarded, and aggregates the expected
 * EXISTING specialty tables — without requiring a live DB or server.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const CENTERS = [
    { route: '/api/ortho-spine-center/patient-360/:patient_id', tables: ['orthopedic_implants', 'joint_rom_assessments'] },
    { route: '/api/eye-institute/patient-360/:patient_id', tables: ['eye_exams'] },
    { route: '/api/ent-headneck-center/patient-360/:patient_id', tables: ['audiogram_records'] },
    { route: '/api/women-fetal-coe/patient-360/:patient_id', tables: ['obgyn_pregnancies', 'obgyn_deliveries', 'obgyn_ultrasounds'] },
    { route: '/api/bariatric-metabolic-coe/patient-360/:patient_id', tables: ['diabetes_glucose_logs', 'insulin_regimens'] },
    { route: '/api/behavioral-health-coe/patient-360/:patient_id', tables: ['psychiatric_evaluations'] },
    { route: '/api/pain-coe/patient-360/:patient_id', tables: ['pain_assessments'] },
    { route: '/api/childrens-hospital/patient-360/:patient_id', tables: ['pediatric_growth_records'] },
    { route: '/api/neuroscience-coe/patient-360/:patient_id', tables: ['neurology_assessments'] },
    { route: '/api/burn-coe/patient-360/:patient_id', tables: ['burn_assessments', 'clinical_photos_meta'] },
    { route: '/api/transplant-coe/patient-360/:patient_id', tables: ['dialysis_sessions'] },
    { route: '/api/cancer-center/patient-360/:patient_id', tables: ['path_specimens'] },
];

function runTests() {
    // Shared helper exists and is guarded correctly by callers
    assert.ok(src.includes('async function centerPatient360('), 'centerPatient360 shared aggregator must exist');
    assert.ok(src.includes("SELECT * FROM ${t} WHERE patient_id=$1${tenantCheck} ORDER BY created_at DESC"),
        'centerPatient360 must apply tenant-filtered, patient-scoped queries');

    for (const center of CENTERS) {
        const declStr = `app.get('${center.route}'`;
        const routeIdx = src.indexOf(declStr);
        assert.ok(routeIdx !== -1, `route must exist: ${center.route}`);

        const routeDecl = src.slice(routeIdx, routeIdx + 200);
        assert.ok(routeDecl.includes('requireAuth'), `${center.route} must require auth`);
        assert.ok(routeDecl.includes("requireRole('patients', 'prescriptions')"), `${center.route} must require patients/prescriptions role`);

        const handlerEnd = src.indexOf('app.get(', routeIdx + declStr.length);
        const handlerBody = src.slice(routeIdx, handlerEnd === -1 ? routeIdx + 1500 : handlerEnd);
        assert.ok(handlerBody.includes('getRequestTenantContext(req)'), `${center.route} must resolve tenant context`);
        for (const table of center.tables) {
            assert.ok(handlerBody.includes(`'${table}'`), `${center.route} must aggregate table: ${table}`);
        }
    }

    console.log(`centers_of_excellence_patient360_static_test: all ${CENTERS.length} centers verified`);
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
