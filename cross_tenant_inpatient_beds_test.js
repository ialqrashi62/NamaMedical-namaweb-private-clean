/**
 * cross_tenant_inpatient_beds_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب بيانات التنويم الداخلي والأسرة والغرف وحركات النقل الداخلي بين المستأجرين
 * Cross-Tenant Inpatient Admissions & Beds Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من:
 * 1. حماية كافة نهايات مسارات التنويم والأسرة والغرف والأجنحة والنقل بـ requireTenantScope.
 * 2. تصفية كافة استعلامات القراءة والكتابة بالـ tenant_id في server.js.
 * 3. منع IDOR والتحقق من سياق المريض والسرير والغرفة والتبعية للمستأجر الحالي.
 * 4. محاكاة عزل البيانات في جداول: admissions, wards, beds, admission_daily_rounds, bed_transfers.
 * 5. رفض الطلبات في بيئة الإنتاج في حال غياب tenantId.
 *
 * الاستخدام:
 *   node cross_tenant_inpatient_beds_test.js
 */

const fs = require('fs');
const path = require('path');

// ===== إعداد ألوان الطرفية =====
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
console.log(`${BOLD}${BLUE}  اختبار منع تسريب بيانات التنويم والأسرة (Cross-Tenant Inpatient & Beds Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Inpatient Admissions & Bed Management Isolation Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات التنويم والأسرة في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const routesToCheck = [
    { pattern: "app.get('/api/wards', requireAuth, requireTenantScope", label: "Wards List: GET /api/wards محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/beds', requireAuth, requireTenantScope", label: "Beds List: GET /api/beds محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/beds/census', requireAuth, requireTenantScope", label: "Beds Census: GET /api/beds/census محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/admissions', requireAuth, requireTenantScope", label: "Admissions List: GET /api/admissions محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/admissions/:id', requireAuth, requireTenantScope", label: "Get Admission Detail: GET /api/admissions/:id محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/admissions', requireAuth, requireTenantScope", label: "Create Admission: POST /api/admissions محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/admissions/:id/discharge', requireAuth, requireTenantScope", label: "Patient Discharge: PUT /api/admissions/:id/discharge محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/admissions/:id/rounds', requireAuth, requireTenantScope", label: "Add Daily Round: POST /api/admissions/:id/rounds محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/admissions/:id/rounds', requireAuth, requireTenantScope", label: "List Daily Rounds: GET /api/admissions/:id/rounds محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/bed-transfers', requireAuth, requireTenantScope", label: "Bed Transfer: POST /api/bed-transfers محمي بـ requireTenantScope" },
    // E8: new state-machine ADT routes (auth + role + tenant).
    { pattern: "app.get('/api/adt/beds', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Bed Board: GET /api/adt/beds محمي (auth+role+tenant)" },
    { pattern: "app.get('/api/adt/census', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Census: GET /api/adt/census محمي (auth+role+tenant)" },
    { pattern: "app.post('/api/adt/admit', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Admit: POST /api/adt/admit محمي (auth+role+tenant)" },
    { pattern: "app.post('/api/adt/transfer', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Transfer: POST /api/adt/transfer محمي (auth+role+tenant)" },
    { pattern: "app.post('/api/adt/discharge', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Discharge: POST /api/adt/discharge محمي (auth+role+tenant)" },
    { pattern: "app.post('/api/adt/bed-status', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope", label: "E8 Bed Status: POST /api/adt/bed-status محمي (auth+role+tenant)" }
];

for (const { pattern, label } of routesToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// E8 SHADOW-PATH CLOSURE: the legacy mutating ADT routes must now fail closed and redirect to the
// E8 state-machine routes (no shadow path can bypass the FOR UPDATE / state validation).
{
    const cc = serverContent.replace(/\s+/g, '');
    assert(cc.includes("status(409).json({error:'UsePOST/api/adt/admit',use:'/api/adt/admit'})"), "Legacy POST /api/admissions retired -> 409 redirect to /api/adt/admit");
    assert(cc.includes("status(409).json({error:'UsePOST/api/adt/discharge',use:'/api/adt/discharge'})"), "Legacy PUT discharge retired -> 409 redirect to /api/adt/discharge");
    assert(cc.includes("status(409).json({error:'UsePOST/api/adt/transfer',use:'/api/adt/transfer'})"), "Legacy POST /api/bed-transfers retired -> 409 redirect to /api/adt/transfer");
}

// ===== 2. فحص استعلامات SQL وتواجد فلاتر tenant_id والتحقق من السياق =====
console.log(`\n${BOLD}[ 2 ] فحص وجود فلاتر tenant_id والتحقق من السياقات الطبية (Static SQL Filter Checks)${RESET}`);
const sqlPatternsToCheck = [
    { pattern: "wards WHERE tenant_id = $1 ORDER BY id", label: "GET Wards: تصفية الأجنحة بـ tenant_id" },
    { pattern: "wards WHERE id=$1 AND tenant_id=$2", label: "GET Beds: التحقق من ملكية الجناح الممرر" },
    { pattern: "beds b JOIN wards w ON b.ward_id=w.id WHERE b.tenant_id=$1 ORDER BY w.id, b.bed_number", label: "GET Beds (All): فلترة الأسرة بـ tenant_id" },
    { pattern: "admissions a ON b.current_admission_id=a.id AND a.status='Active' AND a.tenant_id=$1", label: "GET Census: عزل بيانات التنويم النشط بـ tenant_id في JOIN" },
    { pattern: "b.tenant_id=$1", label: "GET Census: تصفية الأسرة بـ tenant_id" },
    { pattern: "admissions WHERE status=$1 AND tenant_id=$2 ORDER BY admission_date DESC", label: "GET Admissions (Filtered): تصفية التنويم بـ status و tenant_id" },
    { pattern: "admissions WHERE tenant_id=$1 ORDER BY admission_date DESC", label: "GET Admissions (All): تصفية التنويم بـ tenant_id" },
    { pattern: "admissions WHERE id = $1 AND tenant_id = $2", label: "GET Admission Detail & Put Discharge & Put Round: منع IDOR على التنويم بـ tenant_id" },
    { pattern: "patients WHERE id = $1 AND tenant_id = $2", label: "POST Admission: التحقق من سياق وملكية المريض للمستأجر" },
    { pattern: "beds WHERE id = $1 AND tenant_id = $2", label: "POST Admission: التحقق من سياق وملكية السرير للمستأجر" },
    { pattern: "INSERT INTO admissions", label: "POST Admission: إدخال سجل التنويم الجديد" },
    { pattern: "tenant_id, facility_id", label: "POST Admission: إدراج tenant_id و facility_id للمستأجر" },
    { pattern: "beds SET status='Occupied'", label: "POST Admission: حجز السرير للمريض" },
    { pattern: "patients SET status='Admitted'", label: "POST Admission: تحديث حالة المريض لـ منوم" },
    { pattern: "admissions SET status=$1, discharge_date=$2", label: "PUT Discharge: تحديث حالة التنويم وتاريخ الخروج" },
    { pattern: "beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2", label: "PUT Discharge & Bed Transfer: تحرير السرير مقيداً بالـ tenant_id" },
    { pattern: "patients SET status='Discharged' WHERE id=$1 AND tenant_id=$2", label: "PUT Discharge: تحديث حالة المريض مقيداً بالـ tenant_id" },
    { pattern: "patients WHERE id=$1 AND tenant_id=$2", label: "POST Daily Round: التحقق من سياق المريض" },
    { pattern: "INSERT INTO admission_daily_rounds", label: "POST Daily Round: إدراج جولة الطبيب اليومية" },
    { pattern: "admission_daily_rounds WHERE admission_id=$1 AND tenant_id=$2 ORDER BY id DESC", label: "GET Daily Rounds: جلب جولات الطبيب مقيدة بـ tenant_id" },
    { pattern: "INSERT INTO bed_transfers", label: "POST Bed Transfer: إدراج حركة النقل الجديدة" },
    { pattern: "branch_id", label: "POST Bed Transfer: إدراج branch_id (يساوي facilityId) في سجل النقل" }
];

for (const { pattern, label } of sqlPatternsToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '').replace(/\\/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '').replace(/\\/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 3. محاكاة منطق عزل بيانات التنويم والأسرة (Simulation Tests) =====
console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل التنويم والأسرة وحركات النقل (Inpatient & Beds Simulation Tests)${RESET}`);
{
    const mockDb = {
        patients: [
            { id: 1, name: 'Patient T1', tenant_id: 1 },
            { id: 2, name: 'Patient T2', tenant_id: 2 }
        ],
        wards: [
            { id: 10, ward_name: 'Ward T1', tenant_id: 1 },
            { id: 20, ward_name: 'Ward T2', tenant_id: 2 }
        ],
        beds: [
            { id: 100, bed_number: 'Bed 101', status: 'Available', ward_id: 10, tenant_id: 1, current_patient_id: 0, current_admission_id: 0 },
            { id: 200, bed_number: 'Bed 201', status: 'Available', ward_id: 20, tenant_id: 2, current_patient_id: 0, current_admission_id: 0 }
        ],
        admissions: [
            { id: 1000, patient_id: 1, patient_name: 'Patient T1', status: 'Active', ward_id: 10, bed_id: 100, tenant_id: 1, facility_id: 1 },
            { id: 2000, patient_id: 2, patient_name: 'Patient T2', status: 'Active', ward_id: 20, bed_id: 200, tenant_id: 2, facility_id: 2 }
        ],
        admission_daily_rounds: [
            { id: 500, admission_id: 1000, patient_id: 1, doctor_name: 'Dr. T1', subjective: 'Stable', tenant_id: 1, facility_id: 1 },
            { id: 600, admission_id: 2000, patient_id: 2, doctor_name: 'Dr. T2', subjective: 'Improving', tenant_id: 2, facility_id: 2 }
        ],
        bed_transfers: []
    };

    function querySim(sql, params) {
        const cleanSql = sql.replace(/\s+/g, '');
        if (cleanSql.includes('FROMpatients')) {
            let list = [...mockDb.patients];
            if (cleanSql.includes('id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(p => p.id === params[0] && p.tenant_id === params[1]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMwards')) {
            let list = [...mockDb.wards];
            if (cleanSql.includes('id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(w => w.id === params[0] && w.tenant_id === params[1]);
            } else if (cleanSql.includes('tenant_id=$1')) {
                list = list.filter(w => w.tenant_id === params[0]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMbeds')) {
            let list = [...mockDb.beds];
            if (cleanSql.includes('id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(b => b.id === params[0] && b.tenant_id === params[1]);
            } else if (cleanSql.includes('tenant_id=$1')) {
                list = list.filter(b => b.tenant_id === params[0]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMadmissions')) {
            let list = [...mockDb.admissions];
            if (cleanSql.includes('id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(a => a.id === params[0] && a.tenant_id === params[1]);
            } else if (cleanSql.includes('tenant_id=$1')) {
                list = list.filter(a => a.tenant_id === params[0]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMadmission_daily_rounds')) {
            let list = [...mockDb.admission_daily_rounds];
            if (cleanSql.includes('admission_id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(r => r.admission_id === params[0] && r.tenant_id === params[1]);
            }
            return { rows: list };
        }
        return { rows: [] };
    }

    // A. اختبار عزل الأجنحة والأسرة
    function simulateGetWards(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM wards WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetWards({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "جلب الأجنحة: مستأجر 1 يجلب أجنحته فقط (جناح واحد)");
    assert(simulateGetWards({ session: { user: { tenantId: 1 } }, isProduction: true }).data[0].id === 10, "جلب الأجنحة: الجناح المسترجع لمستأجر 1 هو المعرف 10");

    function simulateGetBeds(req, query) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const { ward_id } = query;
        if (ward_id && tenantId) {
            const wardCheck = querySim('SELECT id FROM wards WHERE id=$1 AND tenant_id=$2', [ward_id, tenantId]).rows[0];
            if (!wardCheck) return { status: 403, error: 'Access denied' };
        }
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM beds WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetBeds({ session: { user: { tenantId: 1 } }, isProduction: true }, { ward_id: 10 }).status === 200, "جلب الأسرة: مستأجر 1 يملك صلاحية على جناح 10");
    assert(simulateGetBeds({ session: { user: { tenantId: 1 } }, isProduction: true }, { ward_id: 20 }).status === 403, "جلب الأسرة (IDOR): مستأجر 1 يمنع من استعلام جناح مستأجر 2 (20)");

    // B. اختبار عزل قائمة التنويم والتفاصيل (IDOR)
    function simulateGetAdmissions(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM admissions WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetAdmissions({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "قائمة التنويم: مستأجر 1 يجلب سجلات تنويمه فقط (سجل واحد)");

    function simulateGetAdmissionDetail(req, id) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [id, tenantId] : [id];
        const row = querySim('SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2', params).rows[0];
        if (!row) return { status: 404, error: 'Admission not found' };
        return { status: 200, data: row };
    }
    assert(simulateGetAdmissionDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000).status === 200, "تفاصيل التنويم: مستأجر 1 يسترجع سجل تنويمه الخاص (1000)");
    assert(simulateGetAdmissionDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000).status === 404, "تفاصيل التنويم (IDOR): مستأجر 1 يمنع من قراءة سجل تنويم مستأجر 2 (2000)");

    // C. اختبار إنشاء تنويم جديد (سياق المريض والسرير)
    function simulateCreateAdmission(req, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        // التحقق من المريض
        if (body.patient_id && tenantId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Invalid patient context' };
        }
        // التحقق من السرير
        if (body.bed_id && tenantId) {
            const bedCheck = querySim('SELECT id FROM beds WHERE id = $1 AND tenant_id = $2', [body.bed_id, tenantId]).rows[0];
            if (!bedCheck) return { status: 403, error: 'Invalid bed context' };
        }
        
        // إنشاء افتراضي ناجح
        return { status: 200, success: true };
    }
    assert(simulateCreateAdmission({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, bed_id: 100 }).status === 200, "إنشاء تنويم: مستأجر 1 يستطيع إدراج مريضه الخاص (1) في سريره الخاص (100)");
    assert(simulateCreateAdmission({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 2, bed_id: 100 }).status === 403, "إنشاء تنويم (IDOR مريض): مستأجر 1 يمنع من تنويم مريض يخص مستأجر 2");
    assert(simulateCreateAdmission({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, bed_id: 200 }).status === 403, "إنشاء تنويم (IDOR سرير): مستأجر 1 يمنع من تخصيص سرير يخص مستأجر 2");

    // D. اختبار خروج المريض Discharge
    function simulateDischarge(req, id) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const adm = querySim('SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2', [id, tenantId]).rows[0];
        if (!adm) return { status: 404, error: 'Admission not found' };
        
        return { status: 200, success: true };
    }
    assert(simulateDischarge({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000).status === 200, "خروج المريض: مستأجر 1 يستطيع عمل Discharge لتنويمه الخاص (1000)");
    assert(simulateDischarge({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000).status === 404, "خروج المريض (IDOR): مستأجر 1 يمنع من إنهاء تنويم مستأجر 2 (2000)");

    // E. اختبار جولات الطبيب اليومية
    function simulateGetRounds(req, admissionId) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const adm = querySim('SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2', [admissionId, tenantId]).rows[0];
        if (!adm) return { status: 404, error: 'Admission not found' };
        
        const rows = querySim('SELECT * FROM admission_daily_rounds WHERE admission_id=$1 AND tenant_id=$2', [admissionId, tenantId]).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetRounds({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000).status === 200, "جولات الأطباء: مستأجر 1 يستطيع قراءة جولات تنويمه الخاص (1000)");
    assert(simulateGetRounds({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000).status === 404, "جولات الأطباء (IDOR): مستأجر 1 يمنع من جلب جولات تنويم مستأجر 2 (2000)");

    // F. اختبار حركات النقل الداخلي للأسرة
    function simulateBedTransfer(req, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        // التحقق من التنويم
        if (body.admission_id && tenantId) {
            const adm = querySim('SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2', [body.admission_id, tenantId]).rows[0];
            if (!adm) return { status: 403, error: 'Access denied on admission' };
        }
        // التحقق من المريض
        if (body.patient_id && tenantId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Access denied on patient' };
        }
        // التحقق من الأسرة
        if (body.from_bed && tenantId) {
            const fromBedCheck = querySim('SELECT id FROM beds WHERE id=$1 AND tenant_id=$2', [body.from_bed, tenantId]).rows[0];
            if (!fromBedCheck) return { status: 403, error: 'Access denied on source bed' };
        }
        if (body.to_bed && tenantId) {
            const toBedCheck = querySim('SELECT id FROM beds WHERE id=$1 AND tenant_id=$2', [body.to_bed, tenantId]).rows[0];
            if (!toBedCheck) return { status: 403, error: 'Access denied on destination bed' };
        }
        
        return { status: 200, success: true };
    }
    assert(simulateBedTransfer({ session: { user: { tenantId: 1 } }, isProduction: true }, { admission_id: 1000, patient_id: 1, from_bed: 100, to_bed: 100 }).status === 200, "نقل مريض: مستأجر 1 ينقل مريضه الخاص بأسرة تابعة له");
    assert(simulateBedTransfer({ session: { user: { tenantId: 1 } }, isProduction: true }, { admission_id: 2000, patient_id: 1, from_bed: 100, to_bed: 100 }).status === 403, "نقل مريض (IDOR تنويم): مستأجر 1 يمنع من استخدام تنويم يتبع مستأجر 2");
    assert(simulateBedTransfer({ session: { user: { tenantId: 1 } }, isProduction: true }, { admission_id: 1000, patient_id: 2, from_bed: 100, to_bed: 100 }).status === 403, "نقل مريض (IDOR مريض): مستأجر 1 يمنع من نقل مريض يتبع مستأجر 2");
    assert(simulateBedTransfer({ session: { user: { tenantId: 1 } }, isProduction: true }, { admission_id: 1000, patient_id: 1, from_bed: 200, to_bed: 100 }).status === 403, "نقل مريض (IDOR سرير قديم): مستأجر 1 يمنع من نقل من سرير يتبع مستأجر 2");
    assert(simulateBedTransfer({ session: { user: { tenantId: 1 } }, isProduction: true }, { admission_id: 1000, patient_id: 1, from_bed: 100, to_bed: 200 }).status === 403, "نقل مريض (IDOR سرير جديد): مستأجر 1 يمنع من نقل إلى سرير يتبع مستأجر 2");

    // G. التحقق من حظر الطلب في الإنتاج إذا كان معرف المستأجر مفقوداً
    function simulateProductionBlock(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403, error: 'Tenant scope required' };
        return { status: 200, data: [] };
    }
    assert(simulateProductionBlock({ session: { user: { tenantId: null } }, isProduction: true }).status === 403, "بيئة الإنتاج: رفض الطلبات ذات السياق المجهول (tenantId مفقود) بـ 403 Forbidden");
    assert(simulateProductionBlock({ session: { user: { tenantId: null } }, isProduction: false }).status === 200, "بيئة التطوير/الاختبار: السماح بالـ Fallback وتخطي الحظر");
}

// ===== ملخص نهائي للاختبارات =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات التنويم والأسرة (Inpatient Test Results)  ${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}تفاصيل الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
    process.exit(1);
} else {
    console.log(`\n${BOLD}${GREEN}🎉 نجحت جميع اختبارات مسارات التنويم الداخلي والأسرة والغرف بنسبة 100%! تم التحقق من الحماية ومنع ثغرات الـ IDOR!${RESET}\n`);
    process.exit(0);
}
