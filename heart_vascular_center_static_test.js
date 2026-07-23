/**
 * heart_vascular_center_static_test.js — DB-free static check for the new
 * Heart & Vascular Center "Patient-360" aggregation endpoint (Enterprise_Blueprint_2026,
 * Wave 9 / Centers of Excellence). Verifies the route exists, is auth+role guarded,
 * and applies tenant filtering — without requiring a live DB or server.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function runTests() {
    // Route exists
    assert.ok(
        src.includes("app.get('/api/heart-vascular-center/patient-360/:patient_id'"),
        'Heart & Vascular Center patient-360 route must exist'
    );

    // Guarded by auth + role (same block as the route declaration)
    const routeIdx = src.indexOf("app.get('/api/heart-vascular-center/patient-360/:patient_id'");
    const routeDecl = src.slice(routeIdx, routeIdx + 200);
    assert.ok(routeDecl.includes('requireAuth'), 'route must require auth');
    assert.ok(routeDecl.includes("requireRole('patients', 'prescriptions')"), 'route must require patients/prescriptions role');

    // Handler body applies tenant filtering (reuses existing cardiology tenant pattern)
    const handlerEnd = src.indexOf('// ===== GASTROENTEROLOGY DEPARTMENT =====', routeIdx);
    const handlerBody = src.slice(routeIdx, handlerEnd === -1 ? routeIdx + 3000 : handlerEnd);
    assert.ok(handlerBody.includes('getRequestTenantContext(req)'), 'handler must resolve tenant context');
    assert.ok(handlerBody.includes('tenantCheck'), 'handler must apply tenant filtering to queries');
    assert.ok(handlerBody.includes('cardiology_procedures'), 'handler must aggregate cardiology_procedures');
    assert.ok(handlerBody.includes('ecg_records'), 'handler must aggregate ecg_records');

    console.log('heart_vascular_center_static_test: all assertions passed');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
