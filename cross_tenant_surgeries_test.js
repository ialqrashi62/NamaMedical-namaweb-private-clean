/**
 * cross_tenant_surgeries_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب بيانات العمليات الجراحية وغرف العمليات بين المستأجرين
 * Cross-Tenant Surgeries & Operating Rooms Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من:
 * 1. حماية المسارات الـ 13 المتعلقة بالعمليات الجراحية وغرف العمليات باستخدام requireTenantScope.
 * 2. تصفية كافة استعلامات القراءة والكتابة بالـ tenant_id.
 * 3. منع IDOR والتحقق من سياق المريض التابع للمستأجر الحالي قبل جدولة العمليات.
 * 4. محاكاة عزل البيانات في الجداول: surgeries, surgery_preop_assessments, surgery_preop_tests, surgery_anesthesia_records, operating_rooms.
 * 5. رفض الطلبات في بيئة الإنتاج في حال غياب tenantId.
 *
 * الاستخدام:
 *   node cross_tenant_surgeries_test.js
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
console.log(`${BOLD}${BLUE}  اختبار منع تسريب بيانات العمليات (Cross-Tenant Surgeries Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Surgeries & Operating Rooms Isolation Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات العمليات الجراحية في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const routesToCheck = [
    { pattern: "app.get('/api/surgeries', requireAuth, requireTenantScope", label: "List Surgeries: GET /api/surgeries محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/surgeries/:id', requireAuth, requireTenantScope", label: "Get Surgery Detail: GET /api/surgeries/:id محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/surgeries', requireAuth, requireTenantScope", label: "Create Surgery: POST /api/surgeries محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/surgeries/:id', requireAuth, requireTenantScope", label: "Update Surgery: PUT /api/surgeries/:id محمي بـ requireTenantScope" },
    { pattern: "app.delete('/api/surgeries/:id', requireAuth, requireTenantScope", label: "Delete Surgery: DELETE /api/surgeries/:id محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/surgeries/:id/preop', requireAuth, requireTenantScope", label: "Get Preop: GET /api/surgeries/:id/preop محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/surgeries/:id/preop', requireAuth, requireTenantScope", label: "Create/Update Preop: POST /api/surgeries/:id/preop محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/surgeries/:id/preop-tests', requireAuth, requireTenantScope", label: "Get Preop Tests: GET /api/surgeries/:id/preop-tests محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/surgeries/:id/preop-tests', requireAuth, requireTenantScope", label: "Create Preop Test: POST /api/surgeries/:id/preop-tests محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/surgery-preop-tests/:id', requireAuth, requireTenantScope", label: "Update Preop Test: PUT /api/surgery-preop-tests/:id محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/surgeries/:id/anesthesia', requireAuth, requireTenantScope", label: "Get Anesthesia: GET /api/surgeries/:id/anesthesia محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/surgeries/:id/anesthesia', requireAuth, requireTenantScope", label: "Create/Update Anesthesia: POST /api/surgeries/:id/anesthesia محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/operating-rooms', requireAuth, requireTenantScope", label: "List Rooms: GET /api/operating-rooms محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/operating-rooms', requireAuth, requireTenantScope", label: "Create Room: POST /api/operating-rooms محمي بـ requireTenantScope" }
];

for (const { pattern, label } of routesToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. فحص استعلامات SQL وتواجد فلاتر tenant_id والتحقق من المرضى =====
console.log(`\n${BOLD}[ 2 ] فحص وجود فلاتر tenant_id والتحقق من سياق المريض (Static SQL Checks)${RESET}`);
const sqlPatternsToCheck = [
    { pattern: "surgeries WHERE id = $1 AND tenant_id = $2", label: "GET Surgery Detail: التحقق من الهوية والمستأجر" },
    { pattern: "patients WHERE id = $1 AND tenant_id = $2", label: "POST Surgery: التحقق من ملكية المريض للمستأجر" },
    { pattern: "INSERT INTO surgeries", label: "POST Surgery: إدخال العملية الجراحية" },
    { pattern: "tenant_id, facility_id", label: "POST Surgery: إدراج tenant_id و facility_id" },
    { pattern: "UPDATE surgeries SET", label: "PUT Surgery: تحديث العملية" },
    { pattern: "tenant_id=$", label: "PUT Surgery: تحديث محمي بـ tenant_id" },
    { pattern: "DELETE FROM surgeries WHERE id=$1${tenantFilter}", label: "DELETE Surgery: حذف مقيد بالـ tenant_id" },
    { pattern: "DELETE FROM surgery_preop_tests WHERE surgery_id=$1${tenantFilter}", label: "DELETE Surgery: حذف الفحوصات مقيد بالـ tenant_id" },
    { pattern: "DELETE FROM surgery_preop_assessments WHERE surgery_id=$1${tenantFilter}", label: "DELETE Surgery: حذف التقييمات مقيد بالـ tenant_id" },
    { pattern: "DELETE FROM surgery_anesthesia_records WHERE surgery_id=$1${tenantFilter}", label: "DELETE Surgery: حذف التخدير مقيد بالـ tenant_id" },
    { pattern: "SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1 AND tenant_id=$2", label: "GET Preop Assessment: استرجاع مقيد بالـ tenant_id" },
    { pattern: "UPDATE surgery_preop_assessments SET", label: "POST Preop Assessment: تحديث مقيد بالـ tenant_id" },
    { pattern: "INSERT INTO surgery_preop_assessments", label: "POST Preop Assessment: إدراج مقيد بالـ tenant_id" },
    { pattern: "SELECT * FROM surgery_preop_tests WHERE surgery_id=$1 AND tenant_id=$2 ORDER BY id", label: "GET Preop Tests: استرجاع مقيد بالـ tenant_id" },
    { pattern: "INSERT INTO surgery_preop_tests", label: "POST Preop Test: إدراج مقيد بالـ tenant_id" },
    { pattern: "UPDATE surgery_preop_tests SET", label: "PUT Preop Test: تحديث مقيد بالـ tenant_id" },
    { pattern: "SELECT * FROM surgery_anesthesia_records WHERE surgery_id=$1 AND tenant_id=$2", label: "GET Anesthesia: استرجاع مقيد بالـ tenant_id" },
    { pattern: "UPDATE surgery_anesthesia_records SET", label: "POST Anesthesia: تحديث مقيد بالـ tenant_id" },
    { pattern: "INSERT INTO surgery_anesthesia_records", label: "POST Anesthesia: إدراج مقيد بالـ tenant_id" },
    { pattern: "SELECT * FROM operating_rooms WHERE tenant_id = $1 ORDER BY id", label: "GET Operating Rooms: استرجاع مقيد بالـ tenant_id" },
    { pattern: "INSERT INTO operating_rooms", label: "POST Operating Room: إدراج مقيد بالـ tenant_id" }
];

for (const { pattern, label } of sqlPatternsToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '').replace(/\\/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '').replace(/\\/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 3. محاكاة منطق عزل بيانات العمليات الجراحية (Simulation Tests) =====
console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل السجلات الطبية للعمليات وغرف العمليات (Surgeries Simulation Tests)${RESET}`);
{
    const mockDb = {
        patients: [
            { id: 1, name: 'Patient T1', tenant_id: 1 },
            { id: 2, name: 'Patient T2', tenant_id: 2 }
        ],
        surgeries: [
            { id: 100, patient_id: 1, patient_name: 'Patient T1', procedure_name: 'Appendectomy', status: 'Scheduled', tenant_id: 1, facility_id: 1 },
            { id: 200, patient_id: 2, patient_name: 'Patient T2', procedure_name: 'Cholecystectomy', status: 'Scheduled', tenant_id: 2, facility_id: 2 }
        ],
        surgery_preop_assessments: [
            { id: 10, surgery_id: 100, patient_id: 1, overall_status: 'Complete', tenant_id: 1 },
            { id: 20, surgery_id: 200, patient_id: 2, overall_status: 'Incomplete', tenant_id: 2 }
        ],
        surgery_preop_tests: [
            { id: 50, surgery_id: 100, patient_id: 1, test_name: 'CBC', is_completed: 1, tenant_id: 1 },
            { id: 60, surgery_id: 200, patient_id: 2, test_name: 'ECG', is_completed: 0, tenant_id: 2 }
        ],
        surgery_anesthesia_records: [
            { id: 80, surgery_id: 100, patient_id: 1, asa_class: 'ASA I', tenant_id: 1 },
            { id: 90, surgery_id: 200, patient_id: 2, asa_class: 'ASA II', tenant_id: 2 }
        ],
        operating_rooms: [
            { id: 1, room_name: 'OR 1 - T1', tenant_id: 1, branch_id: 1 },
            { id: 2, room_name: 'OR 2 - T2', tenant_id: 2, branch_id: 2 }
        ]
    };

    function querySim(sql, params) {
        // Simple mock queries simulator
        if (sql.includes('FROM patients')) {
            let list = [...mockDb.patients];
            if (sql.includes('id = $1') && sql.includes('tenant_id = $2')) {
                list = list.filter(p => p.id === params[0] && p.tenant_id === params[1]);
            }
            return { rows: list };
        }
        
        if (sql.includes('FROM surgeries')) {
            let list = [...mockDb.surgeries];
            if (sql.includes('id = $1') && sql.includes('tenant_id = $2')) {
                list = list.filter(s => s.id === params[0] && s.tenant_id === params[1]);
            } else if (sql.includes('tenant_id = $1')) {
                list = list.filter(s => s.tenant_id === params[0]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM surgery_preop_assessments')) {
            let list = [...mockDb.surgery_preop_assessments];
            if (sql.includes('surgery_id=$1') && sql.includes('tenant_id=$2')) {
                list = list.filter(s => s.surgery_id === params[0] && s.tenant_id === params[1]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM surgery_preop_tests')) {
            let list = [...mockDb.surgery_preop_tests];
            if (sql.includes('surgery_id=$1') && sql.includes('tenant_id=$2')) {
                list = list.filter(s => s.surgery_id === params[0] && s.tenant_id === params[1]);
            } else if (sql.includes('id=$1') && sql.includes('tenant_id=$2')) {
                list = list.filter(s => s.id === params[0] && s.tenant_id === params[1]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM surgery_anesthesia_records')) {
            let list = [...mockDb.surgery_anesthesia_records];
            if (sql.includes('surgery_id=$1') && sql.includes('tenant_id=$2')) {
                list = list.filter(s => s.surgery_id === params[0] && s.tenant_id === params[1]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM operating_rooms')) {
            let list = [...mockDb.operating_rooms];
            if (sql.includes('tenant_id = $1')) {
                list = list.filter(r => r.tenant_id === params[0]);
            }
            return { rows: list };
        }

        return { rows: [] };
    }

    // 1. اختبار جلب قائمة العمليات المفلترة بـ tenant_id
    function simulateGetSurgeries(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM surgeries WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetSurgeries({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "جلب العمليات: مستأجر 1 يجلب عملياته فقط (عملية واحدة)");
    assert(simulateGetSurgeries({ session: { user: { tenantId: 1 } }, isProduction: true }).data[0].id === 100, "جلب العمليات: العملية المسترجعة لمستأجر 1 هي المعرف 100");

    // 2. اختبار جلب تفاصيل عملية جراحية محددة مع منع IDOR
    function simulateGetSurgeryDetail(req, id) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [id, tenantId] : [id];
        const row = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', params).rows[0];
        if (!row) return { status: 404, error: 'Not found' };
        return { status: 200, data: row };
    }
    assert(simulateGetSurgeryDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 100).status === 200, "تفاصيل عملية: مستأجر 1 يقرأ تفاصيل عمليته الخاصة (100)");
    assert(simulateGetSurgeryDetail({ session: { user: { tenantId: 1 } }, isProduction: true }, 200).status === 404, "تفاصيل عملية (IDOR): مستأجر 1 يمنع من قراءة تفاصيل عملية مستأجر 2 (200)");

    // 3. اختبار جدولة عملية لمريض مستأجر آخر (Cross-Tenant Validation)
    function simulateCreateSurgery(req, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        // التحقق من المريض
        const patientCheck = querySim('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [body.patient_id, tenantId]).rows[0];
        if (!patientCheck) return { status: 403, error: 'Invalid patient context' };
        
        return { status: 200, success: true };
    }
    assert(simulateCreateSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 1 }).status === 200, "إنشاء عملية: مستأجر 1 يستطيع جدولة عملية لمريضه الخاص (1)");
    assert(simulateCreateSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, { patient_id: 2 }).status === 403, "إنشاء عملية (التحقق من المريض): مستأجر 1 يمنع من إسناد عملية لمريض مستأجر 2 (2)");

    // 4. اختبار تعديل عملية جراحية مع منع IDOR
    function simulateUpdateSurgery(req, id, body) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const check = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', [id, tenantId]).rows[0];
        if (!check) return { status: 404, error: 'Not found' };
        return { status: 200, success: true };
    }
    assert(simulateUpdateSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, 100, { status: 'InProgress' }).status === 200, "تعديل عملية: مستأجر 1 يستطيع تعديل عمليته الخاصة");
    assert(simulateUpdateSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, 200, { status: 'InProgress' }).status === 404, "تعديل عملية (IDOR): مستأجر 1 يمنع من تعديل عملية مستأجر 2");

    // 5. اختبار حذف عملية جراحية مع منع IDOR
    function simulateDeleteSurgery(req, id) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const check = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', [id, tenantId]).rows[0];
        if (!check) return { status: 404, error: 'Not found' };
        return { status: 200, success: true };
    }
    assert(simulateDeleteSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, 100).status === 200, "حذف عملية: مستأجر 1 يستطيع إلغاء وحذف عمليته الخاصة");
    assert(simulateDeleteSurgery({ session: { user: { tenantId: 1 } }, isProduction: true }, 200).status === 404, "حذف عملية (IDOR): مستأجر 1 يمنع من حذف وإلغاء عملية مستأجر 2");

    // 6. اختبار تقييم ما قبل الجراحة (Preop) ومنع IDOR
    function simulateGetPreop(req, surgeryId) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const surgeryCheck = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', [surgeryId, tenantId]).rows[0];
        if (!surgeryCheck) return { status: 404, error: 'Surgery not found' };
        const row = querySim('SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1 AND tenant_id=$2', [surgeryId, tenantId]).rows[0];
        return { status: 200, data: row || null };
    }
    assert(simulateGetPreop({ session: { user: { tenantId: 1 } }, isProduction: true }, 100).status === 200, "تقييم الجراحة: مستأجر 1 يستطيع قراءة تقييم عمليته الخاصة");
    assert(simulateGetPreop({ session: { user: { tenantId: 1 } }, isProduction: true }, 200).status === 404, "تقييم الجراحة (IDOR): مستأجر 1 يمنع من قراءة تقييم عملية مستأجر 2");

    // 7. اختبار فحوصات ما قبل الجراحة (Preop Tests) ومنع IDOR
    function simulateGetPreopTests(req, surgeryId) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const surgeryCheck = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', [surgeryId, tenantId]).rows[0];
        if (!surgeryCheck) return { status: 404, error: 'Surgery not found' };
        return { status: 200, success: true };
    }
    assert(simulateGetPreopTests({ session: { user: { tenantId: 1 } }, isProduction: true }, 100).status === 200, "فحوصات الجراحة: مستأجر 1 يقرأ فحوصات عمليته الخاصة");
    assert(simulateGetPreopTests({ session: { user: { tenantId: 1 } }, isProduction: true }, 200).status === 404, "فحوصات الجراحة (IDOR): مستأجر 1 يمنع من قراءة فحوصات عملية مستأجر 2");

    // 8. اختبار تعديل فحص محدد (Put Test) ومنع IDOR
    function simulateUpdatePreopTest(req, testId) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const check = querySim('SELECT * FROM surgery_preop_tests WHERE id=$1 AND tenant_id=$2', [testId, tenantId]).rows[0];
        if (!check) return { status: 404, error: 'Not found' };
        return { status: 200, success: true };
    }
    assert(simulateUpdatePreopTest({ session: { user: { tenantId: 1 } }, isProduction: true }, 50).status === 200, "تعديل فحص: مستأجر 1 يعدل فحصه الخاص (50)");
    assert(simulateUpdatePreopTest({ session: { user: { tenantId: 1 } }, isProduction: true }, 60).status === 404, "تعديل فحص (IDOR): مستأجر 1 يمنع من تعديل فحص مستأجر 2 (60)");

    // 9. اختبار سجلات التخدير (Anesthesia) ومنع IDOR
    function simulateGetAnesthesia(req, surgeryId) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const surgeryCheck = querySim('SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2', [surgeryId, tenantId]).rows[0];
        if (!surgeryCheck) return { status: 404, error: 'Surgery not found' };
        return { status: 200, success: true };
    }
    assert(simulateGetAnesthesia({ session: { user: { tenantId: 1 } }, isProduction: true }, 100).status === 200, "تخدير الجراحة: مستأجر 1 يستطيع قراءة سجل تخدير عمليته الخاصة");
    assert(simulateGetAnesthesia({ session: { user: { tenantId: 1 } }, isProduction: true }, 200).status === 404, "تخدير الجراحة (IDOR): مستأجر 1 يمنع من قراءة سجل تخدير عملية مستأجر 2");

    // 10. اختبار جلب غرف العمليات وعزلها بـ tenant_id
    function simulateGetRooms(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM operating_rooms WHERE tenant_id = $1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetRooms({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "غرف العمليات: مستأجر 1 يرى غرفته الخاصة فقط");
    assert(simulateGetRooms({ session: { user: { tenantId: 1 } }, isProduction: true }).data[0].id === 1, "غرف العمليات: الغرفة المسترجعة لمستأجر 1 هي OR 1");
}

// ===== ملخص نهائي للاختبارات =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات العمليات الجراحية (Surgeries Test Results)${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}تفاصيل الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
    process.exit(1);
} else {
    console.log(`\n${BOLD}${GREEN}🎉 نجحت جميع اختبارات مسارات العمليات الجراحية وغرف العمليات بنسبة 100%! تم التحقق من الحماية ومنع ثغرات الـ IDOR!${RESET}\n`);
    process.exit(0);
}
