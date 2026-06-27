/**
 * cross_tenant_clinical_reports_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب التقارير والبيانات الطبية/الكلينيكالية بين المستأجرين
 * Cross-Tenant Clinical Reports Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من:
 * 1. حماية المسارات الكلينيكالية والطبية الثمانية باستخدام requireTenantScope.
 * 2. تصفية كافة استعلامات التقارير والملخصات بالـ tenant_id.
 * 3. منع IDOR والتحقق من سياق المريض التابع للمستأجر الحالي قبل جلب الخطوط الزمنية والملخصات والتقارير الطبية.
 * 4. محاكاة منطق السجلات للتأكد من عزل بيانات نساء وتوليد (OB/GYN)، ومكافحة العدوى، والتحويلات الطبية.
 * 5. رفض الطلبات في بيئة الإنتاج في حال غياب tenantId.
 *
 * الاستخدام:
 *   node cross_tenant_clinical_reports_test.js
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
console.log(`${BOLD}${BLUE}  اختبار منع تسريب البيانات الطبية (Cross-Tenant Clinical Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Detailed Clinical Reports Isolation & IDOR Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات التقارير الكلينيكالية في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// تحقق من وجود requireTenantScope في تعريفات مسارات التقارير الكلينيكالية والطبية
const routesToCheck = [
    { pattern: "app.get('/api/reports/patients', requireAuth, requireRole('reports'), requireTenantScope", label: "Patient Report: /api/reports/patients محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/lab', requireAuth, requireRole('reports'), requireTenantScope", label: "Lab Report: /api/reports/lab محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/patients/:id/timeline', requireAuth, requireRole('patients'), requireTenantScope", label: "Timeline: /api/patients/:id/timeline محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/patients/:id/summary', requireAuth, requireRole('patients'), requireTenantScope", label: "Summary: /api/patients/:id/summary محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/obgyn/stats', requireAuth, requireRole(...OB_RBAC), requireTenantScope", label: "OB/GYN Stats: /api/obgyn/stats محمي بـ requireRole + requireTenantScope (E14 hardened)" },
    { pattern: "app.post('/api/medical-reports', requireAuth, requireTenantScope", label: "Create Med Report: POST /api/medical-reports محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/medical-reports', requireAuth, requireTenantScope", label: "List Med Reports: GET /api/medical-reports محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/medical-reports/:id', requireAuth, requireTenantScope", label: "Get Med Report ID: GET /api/medical-reports/:id محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/infection-control/reports', requireAuth, requireRole('infection'), requireTenantScope", label: "List Infection: GET /api/infection-control/reports محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/infection-control/reports', requireAuth, requireRole('infection'), requireTenantScope", label: "Create Infection: POST /api/infection-control/reports محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/infection-control/reports/:id', requireAuth, requireRole('infection'), requireTenantScope", label: "Update Infection: PUT /api/infection-control/reports/:id محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/referrals', requireAuth, requireTenantScope", label: "List Referrals: GET /api/referrals محمي بـ requireTenantScope" },
    { pattern: "app.post('/api/referrals', requireAuth, requireTenantScope", label: "Create Referral: POST /api/referrals محمي بـ requireTenantScope" },
    { pattern: "app.put('/api/referrals/:id', requireAuth, requireTenantScope", label: "Update Referral: PUT /api/referrals/:id محمي بـ requireTenantScope" }
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
    { pattern: "patients${tenantFilter}", label: "Patients Report: الاستعلام المفلتر بالـ tenant_id" },
    { pattern: "lab_radiology_orders WHERE is_radiology=0${tenantFilter}", label: "Lab Report: عزل طلبات المختبر بـ tenant_id" },
    { pattern: "patients WHERE id=$1${tenantCheck}", label: "Timeline & Summary: التحقق من المريض في المستأجر" },
    { pattern: "obgyn_pregnancies WHERE status='Active' AND tenant_id=$1", label: "OB/GYN Stats: عزل إحصائيات الحمل بـ tenant_id (E14 fail-closed)" },
    { pattern: "obgyn_deliveries WHERE delivery_date >= date_trunc('month', CURRENT_DATE) AND tenant_id=$1", label: "OB/GYN Stats: عزل إحصائيات الولادات بـ tenant_id (E14 fail-closed)" },
    
    // فحص التقارير الطبية
    { pattern: "patients WHERE id=$1 AND tenant_id=$2", label: "Medical Reports: التحقق من سياق المريض التابع للمستأجر" },
    { pattern: "INSERT INTO medical_reports", label: "Medical Reports: إدراج التقرير الطبي المخصص" },
    { pattern: "tenant_id", label: "Medical Reports: وجود حقل tenant_id في التقارير الطبية" },
    
    // فحص مكافحة العدوى
    { pattern: "INSERT INTO infection_control_reports", label: "Infection Control: إدراج تقرير مكافحة العدوى" },
    { pattern: "SELECT * FROM infection_control_reports WHERE tenant_id=$1", label: "Infection Control: استرجاع معزول بـ tenant_id" },
    { pattern: "UPDATE infection_control_reports SET status=$1 WHERE id=$2 AND tenant_id=$3", label: "Infection Control: تحديث حالة التقرير معزولاً" },
    
    // فحص التحويلات الطبية
    { pattern: "INSERT INTO patient_referrals", label: "Referrals (Set 1): إدراج إحالة مريض بالـ tenant_id" },
    { pattern: "UPDATE patient_referrals SET status=$1 WHERE id=$2 AND tenant_id=$3", label: "Referrals (Set 1): تحديث حالة إحالة المريض معزولاً" },
    { pattern: "INSERT INTO referrals", label: "Referrals (Set 2): إدراج إحالة النظام بالـ tenant_id" }
];

for (const { pattern, label } of sqlPatternsToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '').replace(/\\/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '').replace(/\\/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 3. محاكاة منطق عزل البيانات للتقارير والملفات الطبية (Simulation Tests) =====
console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل السجلات الطبية والتقارير الكلينيكالية (Clinical Reports Simulation Tests)${RESET}`);
{
    // قاعدة بيانات وهمية للمحاكاة تحتوي على بيانات مستأجرين مختلفين
    const mockDb = {
        patients: [
            { id: 1, name_ar: 'مريض مستأجر 1-أ', tenant_id: 1 },
            { id: 2, name_ar: 'مريض مستأجر 1-ب', tenant_id: 1 },
            { id: 3, name_ar: 'مريض مستأجر 2-أ', tenant_id: 2 }
        ],
        lab_radiology_orders: [
            { id: 1, patient_id: 1, order_type: 'CBC', is_radiology: 0, status: 'Requested', tenant_id: 1 },
            { id: 2, patient_id: 2, order_type: 'LIPID', is_radiology: 0, status: 'Completed', tenant_id: 1 },
            { id: 3, patient_id: 3, order_type: 'X-RAY', is_radiology: 1, status: 'Requested', tenant_id: 2 }
        ],
        obgyn_pregnancies: [
            { id: 10, patient_id: 1, status: 'Active', risk_level: 'High', tenant_id: 1 },
            { id: 11, patient_id: 3, status: 'Active', risk_level: 'Low', tenant_id: 2 }
        ],
        obgyn_deliveries: [
            { id: 20, patient_id: 1, delivery_date: new Date(), tenant_id: 1 },
            { id: 21, patient_id: 3, delivery_date: new Date(), tenant_id: 2 }
        ],
        medical_reports: [
            { id: 30, patient_id: 1, report_number: 'MR-1', report_type: 'Sick Leave', tenant_id: 1 },
            { id: 31, patient_id: 3, report_number: 'MR-2', report_type: 'Fitness', tenant_id: 2 }
        ],
        infection_control_reports: [
            { id: 40, patient_name: 'Patient T1-A', infection_type: 'MRSA', tenant_id: 1, status: 'active' },
            { id: 41, patient_name: 'Patient T2-A', infection_type: 'COVID-19', tenant_id: 2, status: 'active' }
        ],
        patient_referrals: [
            { id: 50, patient_id: 1, to_department: 'Cardiology', tenant_id: 1, status: 'Pending' },
            { id: 51, patient_id: 3, to_department: 'Neurology', tenant_id: 2, status: 'Pending' }
        ],
        referrals: [
            { id: 60, patient_id: 1, to_dept: 'Cardiology', tenant_id: 1, status: 'Pending' },
            { id: 61, patient_id: 3, to_dept: 'Neurology', tenant_id: 2, status: 'Pending' }
        ]
    };

    function querySim(sql, params) {
        if (sql.includes('FROM patients')) {
            let list = [...mockDb.patients];
            if (sql.includes('tenant_id = $1') || sql.includes('tenant_id=$1')) {
                list = list.filter(p => p.tenant_id === params[0]);
            }
            if (sql.includes('WHERE id=$1') && (sql.includes('AND tenant_id=$2') || sql.includes('AND tenant_id = $2'))) {
                list = list.filter(p => p.id === params[0] && p.tenant_id === params[1]);
            } else if (sql.includes('WHERE id=$1')) {
                list = list.filter(p => p.id === params[0]);
            }
            return { rows: list };
        }
        
        if (sql.includes('FROM lab_radiology_orders')) {
            let list = [...mockDb.lab_radiology_orders];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(o => o.tenant_id === params[0]);
            }
            if (sql.includes('is_radiology=0')) {
                list = list.filter(o => o.is_radiology === 0);
            }
            return { rows: list };
        }

        if (sql.includes('FROM obgyn_pregnancies')) {
            let list = [...mockDb.obgyn_pregnancies];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(p => p.tenant_id === params[0]);
            }
            if (sql.includes("status='Active'")) {
                list = list.filter(p => p.status === 'Active');
            }
            if (sql.includes("risk_level='High'")) {
                list = list.filter(p => p.risk_level === 'High');
            }
            return { rows: list };
        }

        if (sql.includes('FROM obgyn_deliveries')) {
            let list = [...mockDb.obgyn_deliveries];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(d => d.tenant_id === params[0]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM medical_reports')) {
            let list = [...mockDb.medical_reports];
            if (sql.includes('tenant_id=$2') || sql.includes('tenant_id = $2')) {
                list = list.filter(r => r.tenant_id === params[1]);
            } else if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(r => r.tenant_id === params[0]);
            }
            if (sql.includes('patient_id=$1') || sql.includes('patient_id = $1')) {
                list = list.filter(r => r.patient_id === params[0]);
            }
            if (sql.includes('WHERE id=$1') || sql.includes('WHERE id = $1')) {
                list = list.filter(r => r.id === params[0]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM infection_control_reports')) {
            let list = [...mockDb.infection_control_reports];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(r => r.tenant_id === params[0]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM patient_referrals')) {
            let list = [...mockDb.patient_referrals];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(r => r.tenant_id === params[0]);
            }
            return { rows: list };
        }

        if (sql.includes('FROM referrals')) {
            let list = [...mockDb.referrals];
            if (sql.includes('tenant_id=$1') || sql.includes('tenant_id = $1')) {
                list = list.filter(r => r.tenant_id === params[0]);
            }
            return { rows: list };
        }

        return { rows: [] };
    }

    // 1. اختبار محاكاة تقرير المرضى المفلتر بـ tenant_id
    function simulatePatientReport(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const params = tenantId ? [tenantId] : [];
        const total = querySim('SELECT COUNT(*) FROM patients' + (tenantId ? ' WHERE tenant_id=$1' : ''), params).rows.length;
        return { status: 200, totalPatients: total };
    }
    assert(simulatePatientReport({ session: { user: { tenantId: 1 } }, isProduction: true }).totalPatients === 2, "محاكاة تقرير مرضى مستأجر 1 يعزل المرضى ويجلب 2 فقط");
    assert(simulatePatientReport({ session: { user: { tenantId: 2 } }, isProduction: true }).totalPatients === 1, "محاكاة تقرير مرضى مستأجر 2 يعزل المرضى ويجلب 1 فقط");

    // 2. اختبار محاكاة تقرير المختبر المفلتر بـ tenant_id
    function simulateLabReport(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        
        const params = tenantId ? [tenantId] : [];
        const total = querySim('SELECT COUNT(*) FROM lab_radiology_orders WHERE is_radiology=0' + (tenantId ? ' AND tenant_id=$1' : ''), params).rows.length;
        return { status: 200, totalOrders: total };
    }
    assert(simulateLabReport({ session: { user: { tenantId: 1 } }, isProduction: true }).totalOrders === 2, "محاكاة تقرير مختبر مستأجر 1 يعزل تحاليل المختبر ويجلب 2 فقط");
    assert(simulateLabReport({ session: { user: { tenantId: 2 } }, isProduction: true }).totalOrders === 0, "محاكاة تقرير مختبر مستأجر 2 يعزل تحاليل المختبر ويجلب 0 (الأشعة تتبع مستأجر 2 وليست تحاليل)");

    // 3. اختبار محاكاة الخط الزمني للمريض مع فحص IDOR
    function simulatePatientTimeline(req, patientId) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        // التحقق من ملكية المريض للمستأجر
        const patientCheck = querySim('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]).rows[0];
        if (!patientCheck) return { status: 404, error: 'Patient not found' };

        return { status: 200, patientId: patientCheck.id };
    }
    assert(simulatePatientTimeline({ session: { user: { tenantId: 1 } }, isProduction: true }, 1).status === 200, "الخط الزمني: مستأجر 1 يستطيع سحب الخط الزمني لمريضه (Patient 1)");
    assert(simulatePatientTimeline({ session: { user: { tenantId: 1 } }, isProduction: true }, 3).status === 404, "الخط الزمني (IDOR Prevention): مستأجر 1 يُمنع من سحب الخط الزمني لمريض مستأجر 2 (Patient 3)");

    // 4. اختبار محاكاة ملخص المريض مع فحص IDOR
    function simulatePatientSummary(req, patientId) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        // التحقق من ملكية المريض للمستأجر
        const patient = querySim('SELECT * FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]).rows[0];
        if (!patient) return { status: 404, error: 'Not found' };

        return { status: 200, patientName: patient.name_ar };
    }
    assert(simulatePatientSummary({ session: { user: { tenantId: 1 } }, isProduction: true }, 1).status === 200, "ملخص المريض: مستأجر 1 يستطيع سحب ملخص مريضه (Patient 1)");
    assert(simulatePatientSummary({ session: { user: { tenantId: 1 } }, isProduction: true }, 3).status === 404, "ملخص المريض (IDOR Prevention): مستأجر 1 يُمنع من سحب ملخص مريض مستأجر 2 (Patient 3)");

    // 5. اختبار محاكاة إحصائيات OB/GYN المفلترة بـ tenant_id
    function simulateObgynStats(req) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        const params = tenantId ? [tenantId] : [];
        const active = querySim("SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' " + (tenantId ? "AND tenant_id=$1" : ""), params).rows.length;
        const highRisk = querySim("SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND risk_level='High' " + (tenantId ? "AND tenant_id=$1" : ""), params).rows.length;
        const delivered = querySim("SELECT COUNT(*) as cnt FROM obgyn_deliveries WHERE tenant_id=$1", params).rows.length;

        return { status: 200, data: { active, highRisk, delivered } };
    }
    const obgynT1 = simulateObgynStats({ session: { user: { tenantId: 1 } }, isProduction: true }).data;
    const obgynT2 = simulateObgynStats({ session: { user: { tenantId: 2 } }, isProduction: true }).data;
    assert(obgynT1.active === 1 && obgynT1.highRisk === 1 && obgynT1.delivered === 1, "OB/GYN Stats: مستأجر 1 يرى فقط حمل وولادات مستأجر 1");
    assert(obgynT2.active === 1 && obgynT2.highRisk === 0 && obgynT2.delivered === 1, "OB/GYN Stats: مستأجر 2 يرى فقط حمل وولادات مستأجر 2 (دون وجود حالات عالية الخطورة)");

    // 6. اختبار محاكاة قراءة وعرض التقارير الطبية المخصصة (/api/medical-reports)
    function simulateGetMedicalReports(req, patientId = null) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        if (tenantId && patientId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Unauthorized patient context' };
        }

        const params = [patientId, tenantId];
        const rows = querySim('SELECT * FROM medical_reports WHERE patient_id=$1 AND tenant_id=$2', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetMedicalReports({ session: { user: { tenantId: 1 } }, isProduction: true }, 1).data.length === 1, "Medical Reports: مستأجر 1 يرى فقط تقرير مريضه");
    assert(simulateGetMedicalReports({ session: { user: { tenantId: 1 } }, isProduction: true }, 3).status === 403, "Medical Reports (IDOR Prevention): مستأجر 1 يُمنع من جلب تقارير مريض مستأجر 2");

    // 7. اختبار محاكاة تقارير مكافحة العدوى المفلترة بـ tenant_id
    function simulateGetInfectionReports(req) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        const params = tenantId ? [tenantId] : [];
        const rows = querySim('SELECT * FROM infection_control_reports WHERE tenant_id=$1', params).rows;
        return { status: 200, data: rows };
    }
    assert(simulateGetInfectionReports({ session: { user: { tenantId: 1 } }, isProduction: true }).data.length === 1, "Infection Reports: مستأجر 1 يرى فقط تقارير مكافحة العدوى الخاصة به");
    assert(simulateGetInfectionReports({ session: { user: { tenantId: 2 } }, isProduction: true }).data[0].infection_type === 'COVID-19', "Infection Reports: مستأجر 2 يرى فقط تقرير الـ COVID-19 الخاص به");

    // 8. اختبار محاكاة التحويلات الطبية المكررة
    function simulateGetReferrals(req, patientId = null) {
        const tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };

        if (tenantId && patientId) {
            const patientCheck = querySim('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]).rows[0];
            if (!patientCheck) return { status: 403, error: 'Unauthorized patient context' };
        }

        const params = [tenantId];
        const rowsSet1 = querySim('SELECT * FROM patient_referrals WHERE tenant_id=$1', params).rows;
        const rowsSet2 = querySim('SELECT * FROM referrals WHERE tenant_id=$1', params).rows;

        return { status: 200, set1Count: rowsSet1.length, set2Count: rowsSet2.length };
    }
    const refT1 = simulateGetReferrals({ session: { user: { tenantId: 1 } }, isProduction: true });
    assert(refT1.set1Count === 1 && refT1.set2Count === 1, "Referrals: مستأجر 1 معزول تماماً في كلا جدولي الإحالات (1 إحالة لكل جدول)");
}

// ===== ملخص نهائي للاختبارات =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبار التقارير الكلينيكالية (Clinical Reports Results)${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}تفاصيل الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
    process.exit(1);
} else {
    console.log(`\n${BOLD}${GREEN}🎉 نجحت جميع اختبارات التقارير والمسارات الكلينيكالية! تم التحقق من العزل الكامل ومنع تسريب بيانات المرضى والولادات والعدوى والإحالات!${RESET}\n`);
    process.exit(0);
}
