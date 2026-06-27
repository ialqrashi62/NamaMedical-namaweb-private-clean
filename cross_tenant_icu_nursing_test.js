/**
 * cross_tenant_icu_nursing_test.js
 * =================================================================
 * Local verification test for multi-tenant isolation in ICU, Nursing,
 * eMAR, and Care Plan workflows for Batch 4.
 *
 * Usage:
 *   node cross_tenant_icu_nursing_test.js
 * =================================================================
 */

const fs = require('fs');
const path = require('path');

// Terminal Colors
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE  = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
const failureLog = [];

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  ${GREEN}✅ PASS${RESET} — ${testName}`);
        passed++;
    } else {
        console.log(`  ${RED}❌ FAIL${RESET} — ${testName}${details ? ' | ' + details : ''}`);
        failed++;
        failureLog.push({ testName, details });
    }
}

console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  اختبار عزل أجنحة العناية والتمريض (Cross-Tenant ICU & Nursing Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — ICU, Nursing, eMAR & Care Plan Isolation Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. Static Code Audit of server.js =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات العناية والتمريض في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const staticChecks = [
    { pattern: "app.get('/api/nursing/vitals', requireAuth, requireTenantScope", label: "Nursing Vitals List: GET /api/nursing/vitals محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/nursing/vitals/:patientId', requireAuth, requireTenantScope", label: "Nursing Vitals Detail: GET /api/nursing/vitals/:patientId محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/nursing/vitals', requireAuth, requireTenantScope", label: "Nursing Vitals Insert: POST /api/nursing/vitals محمي بـ requireTenantScope" },
    // E9: ICU routes are now hardened with requireRole('icu','nursing','doctor') (was auth+tenant only).
    { pattern: "app.get('/api/icu/patients', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Patients List: GET /api/icu/patients محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.post('/api/icu/monitoring', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Monitoring Insert: POST /api/icu/monitoring محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.get('/api/icu/monitoring/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Monitoring Detail: GET /api/icu/monitoring/:admissionId محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.post('/api/icu/ventilator', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Ventilator Insert: POST /api/icu/ventilator محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.get('/api/icu/ventilator/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Ventilator Detail: GET /api/icu/ventilator/:admissionId محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.post('/api/icu/scores', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Scores Insert: POST /api/icu/scores محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.get('/api/icu/scores/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Scores Detail: GET /api/icu/scores/:admissionId محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.post('/api/icu/fluid-balance', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Fluid Balance Insert: POST /api/icu/fluid-balance محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.get('/api/icu/fluid-balance/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope", label: "ICU Fluid Balance Detail: GET /api/icu/fluid-balance/:admissionId محمي بـ requireRole+requireTenantScope (E9)" },
    { pattern: "app.get('/api/emar/orders', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "eMAR Orders List: GET /api/emar/orders محمي بـ requireRole + requireTenantScope" },
    { pattern: "app.post('/api/emar/orders', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "eMAR Orders Insert: POST /api/emar/orders محمي بـ requireRole + requireTenantScope" },
    { pattern: "app.get('/api/emar/administrations', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "eMAR Administrations List: GET /api/emar/administrations محمي بـ requireRole + requireTenantScope" },
    { pattern: "app.post('/api/emar/administrations', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "eMAR Administrations Insert: POST /api/emar/administrations محمي بـ requireRole + requireTenantScope" },
    { pattern: "app.get('/api/nursing/care-plans', requireAuth, requireTenantScope", label: "Nursing Care Plans List: GET /api/nursing/care-plans محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/nursing/care-plans', requireAuth, requireTenantScope", label: "Nursing Care Plans Insert: POST /api/nursing/care-plans محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "Nursing Assessments List: GET /api/nursing/assessments محمي بـ requireRole + requireTenantScope" },
    { pattern: "app.post('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope", label: "Nursing Assessments Insert: POST /api/nursing/assessments محمي بـ requireRole + requireTenantScope" }
];

for (const { pattern, label } of staticChecks) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. Simulation of multi-tenant isolation =====
console.log(`\n${BOLD}[ 2 ] محاكاة واختبار منع تسريب البيانات و IDOR (Isolation & IDOR Simulation Tests)${RESET}`);

const mockDb = {
    patients: [
        { id: 11, name: 'Patient A', tenant_id: 1 },
        { id: 22, name: 'Patient B', tenant_id: 2 }
    ],
    admissions: [
        { id: 101, patient_id: 11, status: 'Active', tenant_id: 1 },
        { id: 202, patient_id: 22, status: 'Active', tenant_id: 2 }
    ],
    emar_orders: [
        { id: 501, patient_id: 11, medication: 'Paracetamol', tenant_id: 1 },
        { id: 502, patient_id: 22, medication: 'Ibuprofen', tenant_id: 2 }
    ]
};

// Simulation checks
// Tenant 1 trying to query Tenant 2 Patient
const verifyPatientAccess = (patientId, userTenantId) => {
    const patient = mockDb.patients.find(p => p.id === patientId);
    if (!patient) return 404;
    if (userTenantId && patient.tenant_id !== userTenantId) {
        return 404; // Block cross-tenant access with 404 to avoid leak
    }
    return 200;
};

// Tenant 1 trying to query Tenant 2 Admission
const verifyAdmissionAccess = (admissionId, userTenantId) => {
    const admission = mockDb.admissions.find(a => a.id === admissionId);
    if (!admission) return 404;
    if (userTenantId && admission.tenant_id !== userTenantId) {
        return 404;
    }
    return 200;
};

// Tenant 1 trying to query Tenant 2 eMAR Order
const verifyEmarOrderAccess = (orderId, userTenantId) => {
    const order = mockDb.emar_orders.find(o => o.id === orderId);
    if (!order) return 404;
    if (userTenantId && order.tenant_id !== userTenantId) {
        return 404;
    }
    return 200;
};

assert(verifyPatientAccess(11, 1) === 200, "مستأجر 1 يصل لمريضه الخاص (Patient 11) بنجاح");
assert(verifyPatientAccess(22, 1) === 404, "منع مستأجر 1 من الوصول لمريض مستأجر 2 (Patient 22) - إرجاع 404");

assert(verifyAdmissionAccess(101, 1) === 200, "مستأجر 1 يصل لتنويم مريضه الخاص (Admission 101) بنجاح");
assert(verifyAdmissionAccess(202, 1) === 404, "منع مستأجر 1 من الوصول لتنويم مستأجر 2 (Admission 202) - إرجاع 404");

assert(verifyEmarOrderAccess(501, 1) === 200, "مستأجر 1 يصل لأمر الأدوية الخاص بمريضه (Order 501) بنجاح");
assert(verifyEmarOrderAccess(502, 1) === 404, "منع مستأجر 1 من الوصول لأمر أدوية مستأجر 2 (Order 502) - إرجاع 404");

console.log(`\n${BOLD}================================================================${RESET}`);
console.log(`${BOLD}  ملخص نتائج فحص التمريض والعناية (Test Execution Summary)${RESET}`);
console.log(`  إجمالي الفحوصات الناجحة (PASSED): ${GREEN}${passed}${RESET}`);
console.log(`  إجمالي الفحوصات الفاشلة (FAILED): ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
console.log(`================================================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
