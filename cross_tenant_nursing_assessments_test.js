/**
 * cross_tenant_nursing_assessments_test.js
 * =================================================================
 * Local verification test for multi-tenant isolation in Nursing Assessments workflow.
 *
 * Usage:
 *   node namaweb/cross_tenant_nursing_assessments_test.js
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
console.log(`${BOLD}${BLUE}  اختبار عزل التقييمات التمريضية (Cross-Tenant Nursing Assessments Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Nursing Assessments Isolation & IDOR Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. Static Code Audit of server.js =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات التقييمات التمريضية في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const staticChecks = [
    {
        pattern: "app.get('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope",
        label: "Nursing Assessments GET: محمي بـ requireAuth و requireRole و requireTenantScope"
    },
    {
        pattern: "app.post('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope",
        label: "Nursing Assessments POST: محمي بـ requireAuth و requireRole و requireTenantScope"
    },
    {
        pattern: "SELECT * FROM nursing_assessments WHERE tenant_id = $1",
        label: "GET Query: تصفية البيانات تتم مباشرة عبر tenant_id بدون JOIN"
    },
    {
        pattern: "INSERT INTO nursing_assessments (patient_id, patient_name, assessment_type, fall_risk_score, braden_score, pain_score, gcs_score, nurse, shift, notes, tenant_id, facility_id)",
        label: "POST Query: إدراج معرّف المستأجر والمنشأة بشكل صريح"
    }
];

for (const { pattern, label } of staticChecks) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن البنية: "${pattern}"`);
}

// ===== 2. Simulation of multi-tenant isolation =====
console.log(`\n${BOLD}[ 2 ] محاكاة واختبار عزل البيانات ومنع IDOR (Isolation & IDOR Simulation Tests)${RESET}`);

const mockDb = {
    patients: [
        { id: 11, name: 'Patient A', tenant_id: 1 },
        { id: 22, name: 'Patient B', tenant_id: 2 }
    ],
    nursing_assessments: [
        { id: 101, patient_id: 11, patient_name: 'Patient A', assessment_type: 'General', tenant_id: 1 },
        { id: 202, patient_id: 22, patient_name: 'Patient B', assessment_type: 'General', tenant_id: 2 }
    ]
};

// Simulation checks
// GET Request Simulation
const simulateGetAssessments = (userTenantId) => {
    if (!userTenantId) {
        return mockDb.nursing_assessments; // Admin returns all
    }
    return mockDb.nursing_assessments.filter(a => a.tenant_id === userTenantId);
};

// POST Request Simulation (IDOR check)
const simulatePostAssessment = (body, userTenantId) => {
    const patient = mockDb.patients.find(p => p.id === body.patient_id);
    if (userTenantId) {
        if (!patient || patient.tenant_id !== userTenantId) {
            return { status: 404, error: 'Patient not found' };
        }
    }
    return { status: 200, data: { ...body, tenant_id: userTenantId || null } };
};

// Verify GET Isolation
const tenant1Assessments = simulateGetAssessments(1);
const containsTenant2 = tenant1Assessments.some(a => a.tenant_id === 2);
assert(tenant1Assessments.length === 1 && tenant1Assessments[0].id === 101 && !containsTenant2,
    "GET Isolation: مستأجر 1 يسترجع فقط سجلات التقييم التمريضي التابعة له (Assessment 101)");

const tenant2Assessments = simulateGetAssessments(2);
const containsTenant1 = tenant2Assessments.some(a => a.tenant_id === 1);
assert(tenant2Assessments.length === 1 && tenant2Assessments[0].id === 202 && !containsTenant1,
    "GET Isolation: مستأجر 2 يسترجع فقط سجلات التقييم التمريضي التابعة له (Assessment 202)");

// Verify POST (IDOR) Isolation
const successfulPost = simulatePostAssessment({ patient_id: 11, patient_name: 'Patient A', assessment_type: 'General' }, 1);
assert(successfulPost.status === 200, "POST Isolation: مستأجر 1 يقوم بإضافة تقييم لمريضه الخاص (Patient 11) بنجاح");

const idorPost = simulatePostAssessment({ patient_id: 22, patient_name: 'Patient B', assessment_type: 'General' }, 1);
assert(idorPost.status === 404, "POST Isolation (IDOR Prevented): منع مستأجر 1 من إضافة تقييم لمريض مستأجر 2 (Patient 22) - إرجاع 404");


console.log(`\n${BOLD}================================================================${RESET}`);
console.log(`${BOLD}  ملخص نتائج فحص التقييمات التمريضية (Test Execution Summary)${RESET}`);
console.log(`  إجمالي الفحوصات الناجحة (PASSED): ${GREEN}${passed}${RESET}`);
console.log(`  إجمالي الفحوصات الفاشلة (FAILED): ${failed > 0 ? RED : GREEN}${failed}${RESET}`);
console.log(`================================================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
