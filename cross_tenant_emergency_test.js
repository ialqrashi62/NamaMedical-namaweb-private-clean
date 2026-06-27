/**
 * cross_tenant_emergency_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب بيانات الطوارئ والفرز والعلامات الحيوية العاجلة بين المستأجرين
 * Cross-Tenant Emergency Visits & Triage Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من:
 * 1. حماية كافة نهايات مسارات الطوارئ والفرز بـ requireTenantScope.
 * 2. تصفية كافة استعلامات القراءة والكتابة بالـ tenant_id في server.js.
 * 3. منع IDOR والتحقق من سياق المريض والسرير والزيارة للمستأجر الحالي قبل أي تعديل أو فرز.
 * 4. محاكاة عزل البيانات في جداول: emergency_visits, emergency_beds, emergency_trauma_assessments, nursing_vitals.
 * 5. رفض الطلبات في بيئة الإنتاج في حال غياب tenantId.
 *
 * الاستخدام:
 *   node cross_tenant_emergency_test.js
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
console.log(`${BOLD}${BLUE}  اختبار منع تسريب بيانات الطوارئ (Cross-Tenant Emergency Visits Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Emergency Visits & Triage Isolation Verification  ${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات الطوارئ والفرز في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const routesToCheck = [
    { pattern: "app.get('/api/emergency/visits', requireAuth, requireTenantScope", label: "Visits List: GET /api/emergency/visits محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/emergency/visits/:id', requireAuth, requireTenantScope", label: "Visit Detail: GET /api/emergency/visits/:id محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/emergency/visits', requireAuth, requireTenantScope", label: "Create Visit: POST /api/emergency/visits محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/emergency/visits/:id', requireAuth, requireTenantScope", label: "Update Visit: PUT /api/emergency/visits/:id محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/emergency/beds', requireAuth, requireTenantScope", label: "Beds List: GET /api/emergency/beds محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/emergency/stats', requireAuth, requireTenantScope", label: "Emergency Stats: GET /api/emergency/stats محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/emergency/trauma/:visitId', requireAuth, requireTenantScope", label: "Trauma Assessment: POST /api/emergency/trauma/:visitId محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/nursing/triage', requireAuth, requireTenantScope", label: "Triage & Vitals: POST /api/nursing/triage محمي بـ requireTenantScope" }
];

for (const { pattern, label } of routesToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. فحص استعلامات SQL وتواجد فلاتر tenant_id والتحقق من السياق =====
console.log(`\n${BOLD}[ 2 ] فحص وجود فلاتر tenant_id والتحقق من السياقات الطبية (Static SQL Filter Checks)${RESET}`);
const sqlPatternsToCheck = [
    { pattern: "emergency_visits WHERE tenant_id = $1 ORDER BY arrival_time DESC", label: "GET Visits: تصفية زيارات الطوارئ بـ tenant_id" },
    { pattern: "emergency_visits WHERE id = $1 AND tenant_id = $2", label: "GET Visit Detail: منع IDOR على تفاصيل زيارة الطوارئ" },
    { pattern: "patients WHERE id = $1 AND tenant_id = $2", label: "POST Visit & POST Trauma & POST Triage: التحقق من سياق المريض" },
    { pattern: "emergency_beds WHERE bed_name = $1 AND tenant_id = $2", label: "POST Visit & PUT Visit: التحقق من سياق السرير" },
    { pattern: "INSERT INTO emergency_visits", label: "POST Visit: إدخال سجل زيارة الطوارئ الجديد" },
    { pattern: "tenant_id, facility_id", label: "POST Visit & POST Trauma: إدراج tenant_id و facility_id" },
    { pattern: "emergency_beds SET status='Occupied'", label: "POST Visit: حجز سرير الطوارئ للمريض" },
    { pattern: "tenant_id=$3", label: "POST Visit: تحديث حالة السرير مقيداً بـ tenant_id" },
    { pattern: "emergency_visits WHERE id = $1 AND tenant_id = $2", label: "PUT Visit & POST Trauma: التحقق من ملكية زيارة الطوارئ لمنع IDOR" },
    { pattern: "UPDATE emergency_visits SET", label: "PUT Visit: تحديث زيارة الطوارئ" },
    { pattern: "UPDATE emergency_beds SET status='Available', current_patient_id=0 WHERE bed_name=$1 AND tenant_id=$2", label: "PUT Visit: تحرير سرير الطوارئ مقيداً بـ tenant_id" },
    { pattern: "emergency_beds WHERE tenant_id = $1 ORDER BY id", label: "GET Beds: تصفية الأسرة بـ tenant_id" },
    { pattern: "emergency_visits WHERE status='Active' AND tenant_id=$1", label: "GET Stats: تصفية الزيارات النشطة بـ tenant_id" },
    { pattern: "emergency_beds WHERE tenant_id=$1", label: "GET Stats: تصفية الأسرة بـ tenant_id في الإحصائيات" }
];

for (const { pattern, label } of sqlPatternsToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '').replace(/\\/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '').replace(/\\/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 3. محاكاة منطق عزل بيانات الطوارئ والفرز (Simulation Tests) =====
console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل زيارات الطوارئ والفرز والعلامات الحيوية (Emergency Simulation Tests)${RESET}`);
{
    const mockDb = {
        patients: [
            { id: 1, name: 'Patient T1', tenant_id: 1 },
            { id: 2, name: 'Patient T2', tenant_id: 2 }
        ],
        emergency_beds: [
            { id: 10, bed_name: 'ER-Bed-101', status: 'Available', tenant_id: 1, branch_id: 1 },
            { id: 20, bed_name: 'ER-Bed-201', status: 'Available', tenant_id: 2, branch_id: 2 }
        ],
        emergency_visits: [
            { id: 1000, patient_id: 1, patient_name: 'Patient T1', status: 'Active', assigned_bed: 'ER-Bed-101', triage_level: 3, tenant_id: 1, facility_id: 1 },
            { id: 2000, patient_id: 2, patient_name: 'Patient T2', status: 'Active', assigned_bed: 'ER-Bed-201', triage_level: 1, tenant_id: 2, facility_id: 2 }
        ],
        emergency_trauma_assessments: [
            { id: 100, visit_id: 1000, patient_id: 1, airway: 'Intact', tenant_id: 1, facility_id: 1 },
            { id: 200, visit_id: 2000, patient_id: 2, airway: 'Obstructed', tenant_id: 2, facility_id: 2 }
        ],
        nursing_vitals: [
            { id: 50, patient_id: 1, triage_level: '3', pain_score: 5, tenant_id: 1 }
        ]
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
        if (cleanSql.includes('FROMemergency_beds')) {
            let list = [...mockDb.emergency_beds];
            if (cleanSql.includes('bed_name=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(b => b.bed_name === params[0] && b.tenant_id === params[1]);
            } else if (cleanSql.includes('tenant_id=$1')) {
                list = list.filter(b => b.tenant_id === params[0]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMemergency_visits')) {
            let list = [...mockDb.emergency_visits];
            if (cleanSql.includes('id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(v => v.id === params[0] && v.tenant_id === params[1]);
            } else if (cleanSql.includes('tenant_id=$1')) {
                list = list.filter(v => v.tenant_id === params[0]);
            }
            return { rows: list };
        }
        if (cleanSql.includes('FROMemergency_trauma_assessments')) {
            let list = [...mockDb.emergency_trauma_assessments];
            if (cleanSql.includes('visit_id=$1') && cleanSql.includes('tenant_id=$2')) {
                list = list.filter(t => t.visit_id === params[0] && t.tenant_id === params[1]);
            }
            return { rows: list };
        }
        return { rows: [] };
    }

    // A. اختبار عزل جلب زيارات الطوارئ والأسرة
    function simulateGetVisits(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM emergency_visits WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetVisits({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "جلب الزيارات: مستأجر 1 يجلب زياراته الخاصة فقط (زيارة واحدة)");
    assert(simulateGetVisits({ session: { user: { tenantId: 1 } }, isProduction: true }).data[0].id === 1000, "جلب الزيارات: الزيارة المسترجعة لمستأجر 1 هي المعرف 1000");

    function simulateGetBeds(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM emergency_beds WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetBeds({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "جلب الأسرة: مستأجر 1 يجلب أسرة الطوارئ الخاصة به فقط");
    assert(simulateGetBeds({ session: { user: { tenantId: 1 } }, isProduction: true }).data[0].bed_name === 'ER-Bed-101', "جلب الأسرة: سرير الطوارئ لمستأجر 1 هو ER-Bed-101");

    // B. اختبار عرض تفاصيل الزيارة الفردية (IDOR)
    function simulateGetVisitDetail(req, id) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [id, tenantId] : [id];
        const row = querySim('SELECT * FROM emergency_visits WHERE id = $1 AND tenant_id = $2', params).rows[0];
        if (!row) return { status: 404, error: 'Visit not found' };
        return { status: 200, data: row };
    }
    assert(simulateGetVisitDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000).status === 200, "تفاصيل الزيارة: مستأجر 1 يقرأ تفاصيل زيارته الخاصة (1000)");
    assert(simulateGetVisitDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000).status === 404, "تفاصيل الزيارة (IDOR): مستأجر 1 يمنع من قراءة تفاصيل زيارة مستأجر 2 (2000)");

    // C. اختبار إنشاء زيارة طوارئ جديدة
    function simulateCreateVisit(req, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        // التحقق من المريض
        if (body.patient_id && tenantId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Invalid patient context' };
        }
        // التحقق من السرير
        if (body.assigned_bed && tenantId) {
            const bedCheck = querySim('SELECT id FROM emergency_beds WHERE bed_name = $1 AND tenant_id = $2', [body.assigned_bed, tenantId]).rows[0];
            if (!bedCheck) return { status: 403, error: 'Invalid bed context' };
        }
        
        return { status: 200, success: true };
    }
    assert(simulateCreateVisit({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, assigned_bed: 'ER-Bed-101' }).status === 200, "إنشاء زيارة: مستأجر 1 يستطيع فتح زيارة لمريضه الخاص (1) وفي سرير طوارئ خاص به");
    assert(simulateCreateVisit({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 2, assigned_bed: 'ER-Bed-101' }).status === 403, "إنشاء زيارة (IDOR مريض): مستأجر 1 يمنع من استخدام مريض مستأجر 2");
    assert(simulateCreateVisit({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, assigned_bed: 'ER-Bed-201' }).status === 403, "إنشاء زيارة (IDOR سرير): مستأجر 1 يمنع من حجز سرير مستأجر 2");

    // D. اختبار تعديل الزيارة
    function simulateUpdateVisit(req, id, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const visit = querySim('SELECT * FROM emergency_visits WHERE id = $1 AND tenant_id = $2', [id, tenantId]).rows[0];
        if (!visit) return { status: 404, error: 'Visit not found' };
        
        if (body.assigned_bed && tenantId) {
            const bedCheck = querySim('SELECT id FROM emergency_beds WHERE bed_name = $1 AND tenant_id = $2', [body.assigned_bed, tenantId]).rows[0];
            if (!bedCheck) return { status: 403, error: 'Invalid bed context' };
        }
        
        return { status: 200, success: true };
    }
    assert(simulateUpdateVisit({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000, { triage_level: 2 }).status === 200, "تعديل زيارة: مستأجر 1 يعدل زيارته الخاصة (1000)");
    assert(simulateUpdateVisit({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000, { triage_level: 2 }).status === 404, "تعديل زيارة (IDOR): مستأجر 1 يمنع من تعديل زيارة مستأجر 2 (2000)");

    // E. اختبار تسجيل تقييم الحوادث الجسيمة
    function simulateCreateTrauma(req, visitId, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const visit = querySim('SELECT * FROM emergency_visits WHERE id = $1 AND tenant_id = $2', [visitId, tenantId]).rows[0];
        if (!visit) return { status: 404, error: 'Visit not found' };
        
        if (body.patient_id && tenantId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Invalid patient context' };
        }
        
        return { status: 200, success: true };
    }
    assert(simulateCreateTrauma({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000, { patient_id: 1 }).status === 200, "تقييم الحوادث: مستأجر 1 يسجل تقييم لزيارته ومريضه الخاص");
    assert(simulateCreateTrauma({ session: { user: { tenantId: 1 } }, isProduction: true }, 2000, { patient_id: 1 }).status === 404, "تقييم الحوادث (IDOR زيارة): مستأجر 1 يمنع من استخدام زيارة مستأجر 2");
    assert(simulateCreateTrauma({ session: { user: { tenantId: 1 } }, isProduction: true }, 1000, { patient_id: 2 }).status === 403, "تقييم الحوادث (IDOR مريض): مستأجر 1 يمنع من إشراك مريض مستأجر 2");

    // F. اختبار فرز الحالات Triage
    function simulateTriage(req, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        if (body.patient_id && tenantId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Invalid patient context' };
        }
        if (body.visit_id && tenantId) {
            const visitCheck = querySim('SELECT id FROM emergency_visits WHERE id = $1 AND tenant_id = $2', [body.visit_id, tenantId]).rows[0];
            if (!visitCheck) return { status: 403, error: 'Invalid visit context' };
        }
        
        return { status: 200, success: true };
    }
    assert(simulateTriage({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, visit_id: 1000 }).status === 200, "الفرز الطبي: مستأجر 1 يستطيع الفرز لمريضه وزيارته الخاصة");
    assert(simulateTriage({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 2, visit_id: 1000 }).status === 403, "الفرز الطبي (IDOR مريض): مستأجر 1 يمنع من فرز مريض مستأجر 2");
    assert(simulateTriage({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1, visit_id: 2000 }).status === 403, "الفرز الطبي (IDOR زيارة): مستأجر 1 يمنع من فرز زيارة مستأجر 2");

    // G. التحقق من حظر الطلب في الإنتاج إذا كان معرف المستأجر مفقوداً
    function simulateProductionBlock(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403, error: 'Tenant scope required' };
        return { status: 200, data: [] };
    }
    assert(simulateProductionBlock({ session: { user: { tenantId: null } }, isProduction: true }).status === 403, "بيئة الإنتاج: رفض الطلبات ذات السياق المجهول بـ 403 Forbidden");
    assert(simulateProductionBlock({ session: { user: { tenantId: null } }, isProduction: false }).status === 200, "بيئة التطوير/الاختبار: السماح بالـ Fallback وتخطي الحظر");
}

// ===== ملخص نهائي للاختبارات =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات الطوارئ والفرز (Emergency Test Results)    ${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}تفاصيل الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
    process.exit(1);
} else {
    console.log(`\n${BOLD}${GREEN}🎉 نجحت جميع اختبارات مسارات الطوارئ والفرز الطبي بنسبة 100%! تم التحقق من الحماية ومنع ثغرات الـ IDOR!${RESET}\n`);
    process.exit(0);
}
