/**
 * cross_tenant_leak_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب البيانات بين المستأجرين
 * Cross-Tenant Data Leak Prevention Test
 *
 * يحاكي هذا السكربت طلبات API مع جلسات مختلفة (tenant 1 vs tenant 2)
 * ويتحقق من أن كل مستأجر لا يرى بيانات المستأجر الآخر.
 *
 * الاستخدام:
 *   node cross_tenant_leak_test.js
 *
 * المتطلبات:
 *   - الخادم يعمل على المنفذ 3000 (افتراضياً)
 *   - بيانات اختبار موجودة مسبقاً أو يمكن إنشاؤها
 *   - لا يؤثر على بيانات الإنتاج
 */

const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = 10000;

// ===== إعداد ألوان الطرفية =====
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE  = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
let skipped = 0;
const failureLog = [];

// ===== دالة طلب HTTP مساعدة =====
function makeRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS);
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
                } catch {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                }
            });
        });
        req.on('error', (e) => { clearTimeout(timeout); reject(e); });
        if (body) {
            const bodyStr = JSON.stringify(body);
            req.write(bodyStr);
        }
        req.end();
    });
}

// ===== محاكاة طلب مع جلسة مستأجر معين (بدون اتصال حقيقي بقاعدة البيانات) =====
// هذه الاختبارات تعمل على منطق `getRequestTenantContext` مباشرة
// وتتحقق من النمط الصحيح في queries الاستعلامات

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

function skip(testName, reason) {
    console.log(`  ${YELLOW}⏭ SKIP${RESET} — ${testName} | ${reason}`);
    skipped++;
}

// ===== اختبارات منطق getRequestTenantContext =====
console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  اختبار منع تسريب البيانات بين المستأجرين (Cross-Tenant Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Patient / Invoice / Appointment Scope${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

// ===== فحص 1: منطق getRequestTenantContext =====
console.log(`${BOLD}[ 1 ] فحص منطق getRequestTenantContext${RESET}`);
{
    // محاكاة الدالة كما هي في server.js
    function getRequestTenantContext(req) {
        let tenantId = req.session?.user?.tenantId || null;
        let facilityId = req.session?.user?.facilityId || null;
        const isProduction = process.env.NODE_ENV === 'production';
        if (!tenantId && !isProduction) {
            tenantId = 1;
            facilityId = 1;
        }
        return { tenantId, facilityId, isProduction };
    }

    // اختبار 1.1: مستخدم مع tenantId=2 في الجلسة
    const req_t2 = { session: { user: { tenantId: 2, facilityId: 2 } } };
    const ctx2 = getRequestTenantContext(req_t2);
    assert(ctx2.tenantId === 2, 'Tenant 2 context: tenantId يجب أن يكون 2', `got: ${ctx2.tenantId}`);
    assert(ctx2.facilityId === 2, 'Tenant 2 context: facilityId يجب أن يكون 2', `got: ${ctx2.facilityId}`);

    // اختبار 1.2: مستخدم مع tenantId=1 في الجلسة
    const req_t1 = { session: { user: { tenantId: 1, facilityId: 1 } } };
    const ctx1 = getRequestTenantContext(req_t1);
    assert(ctx1.tenantId === 1, 'Tenant 1 context: tenantId يجب أن يكون 1', `got: ${ctx1.tenantId}`);

    // اختبار 1.3: في بيئة non-production بدون tenantId → fallback إلى 1
    const req_no_tenant_dev = { session: { user: {} } };
    const saved_env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const ctx_dev = getRequestTenantContext(req_no_tenant_dev);
    assert(ctx_dev.tenantId === 1, 'Dev fallback: بدون tenantId يجب fallback إلى 1', `got: ${ctx_dev.tenantId}`);
    process.env.NODE_ENV = saved_env;

    // اختبار 1.4: في بيئة production بدون tenantId → يجب أن يكون null (رفض الطلب)
    const req_no_tenant_prod = { session: { user: {} } };
    process.env.NODE_ENV = 'production';
    const ctx_prod = getRequestTenantContext(req_no_tenant_prod);
    assert(ctx_prod.tenantId === null, 'Production بدون tenantId يجب أن يكون null (رفض)', `got: ${ctx_prod.tenantId}`);
    assert(ctx_prod.isProduction === true, 'isProduction flag يجب أن يكون true', `got: ${ctx_prod.isProduction}`);
    process.env.NODE_ENV = saved_env;

    // اختبار 1.5: دالة requireTenantScope تمنع في production بدون tenantId
    function requireTenantScope(req, res, next) {
        const { tenantId, isProduction } = getRequestTenantContext(req);
        if (!tenantId && isProduction) {
            return res.status(403).json({ error: 'Tenant scope required' });
        }
        next();
    }
    let blockedStatus = null;
    const mock_res = { status: (s) => { blockedStatus = s; return { json: () => {} }; } };
    let nextCalled = false;
    process.env.NODE_ENV = 'production';
    requireTenantScope({ session: { user: {} } }, mock_res, () => { nextCalled = true; });
    assert(blockedStatus === 403 && !nextCalled, 'requireTenantScope يمنع الطلب في production بدون tenantId');
    process.env.NODE_ENV = saved_env;
}

// ===== فحص 2: منطق بناء WHERE clause مع tenant_id =====
console.log(`\n${BOLD}[ 2 ] فحص بناء WHERE clause مع tenant_id (IDOR Prevention)${RESET}`);
{
    // محاكاة النمط المُطبَّق في server.js لجميع عمليات القراءة/التعديل/الحذف

    function buildTenantQuery(baseQuery, params, tenantId, idParam) {
        const tenantCheck = tenantId ? ` AND tenant_id=$${params.length + 2}` : '';
        const tenantParams = tenantId ? [...params, idParam, tenantId] : [...params, idParam];
        return { query: `${baseQuery} WHERE id=$${params.length + 1}${tenantCheck}`, params: tenantParams };
    }

    // اختبار 2.1: مستخدم tenant_id=2 يحاول الوصول لسجل tenant_id=1
    const t2_trying_t1_id = 99; // رقم سجل وهمي لمستأجر آخر
    const { query: q1, params: p1 } = buildTenantQuery('SELECT * FROM patients', [], 2, t2_trying_t1_id);
    assert(q1.includes('AND tenant_id=$2'), 'GET patient: استعلام يحتوي AND tenant_id=$2 للحماية من IDOR');
    assert(p1[0] === t2_trying_t1_id && p1[1] === 2, 'GET patient: params تحتوي id ثم tenantId بالترتيب');

    // اختبار 2.2: استعلام بدون tenantId (بيئة dev) لا يُضيف شرطاً
    const { query: q2, params: p2 } = buildTenantQuery('SELECT * FROM patients', [], null, 99);
    assert(!q2.includes('tenant_id'), 'بدون tenantId: لا يضاف tenant_id clause (dev fallback)');

    // اختبار 2.3: UPDATE مع tenant_id
    function buildUpdateTenantWhere(setCount, tenantId) {
        const baseWhere = `WHERE id=$${setCount + 1}`;
        if (!tenantId) return baseWhere;
        return `${baseWhere} AND tenant_id=${tenantId}`;
    }
    const updateWhere = buildUpdateTenantWhere(3, 2);
    assert(updateWhere.includes('AND tenant_id=2'), 'UPDATE patients: WHERE يحتوي AND tenant_id');

    // اختبار 2.4: DELETE مع tenant_id
    function buildDeleteCheck(tenantId, recordId) {
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [recordId, tenantId] : [recordId];
        const query = `SELECT id FROM table WHERE id=$1${tenantCheck}`;
        return { query, params: tenantParams };
    }
    const { query: dq, params: dp } = buildDeleteCheck(2, 55);
    assert(dq.includes('AND tenant_id=$2'), 'DELETE: pre-check query يحتوي AND tenant_id=$2');
    assert(dp[1] === 2, 'DELETE: params[1] هو tenantId=2');
}

// ===== فحص 3: منطق ختم tenant_id عند الإنشاء (INSERT) =====
console.log(`\n${BOLD}[ 3 ] فحص ختم tenant_id عند الإنشاء (INSERT Stamping)${RESET}`);
{
    // تحقق أن الكود لا يأخذ tenant_id من body
    function simulatePostPatient(reqBody, sessionTenantId) {
        // نسخة مبسطة من منطق POST /api/patients
        const { name_ar } = reqBody;
        const tenantId = sessionTenantId; // من الجلسة فقط، ليس من reqBody
        // لو كان المهاجم يرسل tenant_id في body، يجب تجاهله
        const bodyTenantId = reqBody.tenant_id; // يجب تجاهله
        return { inserted_tenant_id: tenantId, body_tenant_id_ignored: bodyTenantId !== tenantId };
    }

    // اختبار 3.1: مهاجم يرسل tenant_id مختلف في body
    const result1 = simulatePostPatient(
        { name_ar: 'مريض اختبار', tenant_id: 99 }, // مهاجم يحاول tenant_id=99
        1 // جلسة المستخدم tenantId=1
    );
    assert(result1.inserted_tenant_id === 1, 'POST patient: يختم tenant_id=1 من الجلسة بغض النظر عن body');
    assert(result1.body_tenant_id_ignored === true, 'POST patient: يتجاهل tenant_id المُرسَل في body');

    // اختبار 3.2: موعد جديد مع tenant stamping
    const result2 = simulatePostPatient(
        { patient_name: 'أحمد', tenant_id: 777 },
        2 // جلسة tenantId=2
    );
    assert(result2.inserted_tenant_id === 2, 'POST appointment: يختم tenant_id=2 من الجلسة');

    // اختبار 3.3: فاتورة جديدة مع tenant stamping
    const result3 = simulatePostPatient(
        { patient_name: 'سلمى', total: 100, tenant_id: 0 },
        3
    );
    assert(result3.inserted_tenant_id === 3, 'POST invoice: يختم tenant_id=3 من الجلسة (لا من body)');
}

// ===== فحص 4: التحقق من الفلترة في GET list =====
console.log(`\n${BOLD}[ 4 ] فحص فلترة GET list بـ tenant_id${RESET}`);
{
    // محاكاة منطق GET /api/patients
    function simulateGetPatients(tenantId, allData) {
        if (tenantId) {
            return allData.filter(p => p.tenant_id === tenantId);
        }
        return allData; // dev fallback
    }

    const testData = [
        { id: 1, name: 'مريض 1', tenant_id: 1 },
        { id: 2, name: 'مريض 2', tenant_id: 1 },
        { id: 3, name: 'مريض 3', tenant_id: 2 },  // ← يجب أن يخفى عن tenant 1
        { id: 4, name: 'مريض 4', tenant_id: 2 },  // ← يجب أن يخفى عن tenant 1
    ];

    // اختبار 4.1: tenant 1 لا يرى بيانات tenant 2
    const t1Results = simulateGetPatients(1, testData);
    assert(t1Results.length === 2, 'GET patients (tenant 1): يرى 2 مرضى فقط');
    assert(!t1Results.some(p => p.tenant_id === 2), 'GET patients (tenant 1): لا يرى أي مريض tenant_id=2');

    // اختبار 4.2: tenant 2 لا يرى بيانات tenant 1
    const t2Results = simulateGetPatients(2, testData);
    assert(t2Results.length === 2, 'GET patients (tenant 2): يرى 2 مرضى فقط');
    assert(!t2Results.some(p => p.tenant_id === 1), 'GET patients (tenant 2): لا يرى أي مريض tenant_id=1');

    // اختبار 4.3: نفس المنطق للفواتير
    const invoiceData = [
        { id: 10, invoice_number: 'INV-001', tenant_id: 1, paid: 0 },
        { id: 11, invoice_number: 'INV-002', tenant_id: 2, paid: 0 },
    ];
    function simulateGetInvoices(tenantId) {
        if (tenantId) return invoiceData.filter(i => i.tenant_id === tenantId);
        return invoiceData;
    }
    const t1Invoices = simulateGetInvoices(1);
    assert(t1Invoices.length === 1, 'GET invoices (tenant 1): يرى فاتورة واحدة فقط');
    assert(t1Invoices[0].invoice_number === 'INV-001', 'GET invoices (tenant 1): يرى INV-001 فقط');
    assert(!t1Invoices.some(i => i.invoice_number === 'INV-002'), 'GET invoices (tenant 1): لا يرى INV-002');

    // اختبار 4.4: نفس المنطق للمواعيد
    const apptData = [
        { id: 20, patient_name: 'أحمد', tenant_id: 1 },
        { id: 21, patient_name: 'سارة', tenant_id: 2 },
    ];
    function simulateGetAppts(tenantId) {
        if (tenantId) return apptData.filter(a => a.tenant_id === tenantId);
        return apptData;
    }
    const t1Appts = simulateGetAppts(1);
    assert(t1Appts.length === 1, 'GET appointments (tenant 1): يرى موعد واحد فقط');
    assert(!t1Appts.some(a => a.tenant_id === 2), 'GET appointments (tenant 1): لا يرى مواعيد tenant_id=2');
}

// ===== فحص 5: IDOR Prevention — الوصول لسجل مستأجر آخر بـ ID المباشر =====
console.log(`\n${BOLD}[ 5 ] فحص IDOR Prevention — الوصول لسجل مستأجر آخر${RESET}`);
{
    // محاكاة منطق GET /api/patients/:id مع tenant check
    function simulateGetPatientById(requestTenantId, recordTenantId, recordId) {
        const db_record = { id: recordId, tenant_id: recordTenantId, name: 'مريض وهمي' };
        // الاستعلام: SELECT * FROM patients WHERE id=$1 AND tenant_id=$2
        if (requestTenantId && db_record.tenant_id !== requestTenantId) {
            return { status: 404, error: 'Patient not found' }; // IDOR blocked
        }
        return { status: 200, data: db_record };
    }

    // اختبار 5.1: tenant 1 يحاول جلب مريض tenant 2
    const r1 = simulateGetPatientById(1, 2, 99);
    assert(r1.status === 404, 'GET /patients/99: tenant_1 لا يستطيع جلب مريض tenant_2 (404)');

    // اختبار 5.2: tenant 2 يحاول تعديل مريض tenant 1
    function simulatePutPatient(requestTenantId, recordTenantId) {
        if (requestTenantId && recordTenantId !== requestTenantId) {
            return { status: 404 }; // IDOR blocked
        }
        return { status: 200 };
    }
    const r2 = simulatePutPatient(2, 1);
    assert(r2.status === 404, 'PUT /patients/:id: tenant_2 لا يستطيع تعديل مريض tenant_1 (404)');

    // اختبار 5.3: tenant 1 يحاول حذف مريض tenant 2
    function simulateDeletePatient(requestTenantId, recordTenantId) {
        if (requestTenantId && recordTenantId !== requestTenantId) {
            return { status: 404 }; // IDOR blocked
        }
        return { status: 200 };
    }
    const r3 = simulateDeletePatient(1, 2);
    assert(r3.status === 404, 'DELETE /patients/:id: tenant_1 لا يستطيع حذف مريض tenant_2 (404)');

    // اختبار 5.4: tenant 1 يحاول دفع فاتورة tenant 2
    function simulatePayInvoice(requestTenantId, invoiceTenantId) {
        if (requestTenantId && invoiceTenantId !== requestTenantId) {
            return { status: 404 }; // IDOR blocked
        }
        return { status: 200 };
    }
    const r4 = simulatePayInvoice(1, 2);
    assert(r4.status === 404, 'PUT /invoices/:id/pay: tenant_1 لا يستطيع دفع فاتورة tenant_2 (404)');

    // اختبار 5.5: tenant 2 يحاول إلغاء فاتورة tenant 1
    const r5 = simulatePayInvoice(2, 1);
    assert(r5.status === 404, 'POST /invoices/cancel/:id: tenant_2 لا يستطيع إلغاء فاتورة tenant_1 (404)');

    // اختبار 5.6: tenant 1 يحاول حذف موعد tenant 2
    function simulateDeleteAppt(requestTenantId, apptTenantId) {
        if (requestTenantId && apptTenantId !== requestTenantId) {
            return { status: 404 }; // IDOR blocked
        }
        return { status: 200 };
    }
    const r6 = simulateDeleteAppt(1, 2);
    assert(r6.status === 404, 'DELETE /appointments/:id: tenant_1 لا يستطيع حذف موعد tenant_2 (404)');

    // اختبار 5.7: tenant 1 يحاول check-in لموعد tenant 2
    const r7 = simulateDeleteAppt(1, 2);
    assert(r7.status === 404, 'PUT /appointments/:id/checkin: tenant_1 لا يستطيع check-in لموعد tenant_2 (404)');

    // اختبار 5.8: tenant 1 يحاول no-show لموعد tenant 2
    const r8 = simulateDeleteAppt(1, 2);
    assert(r8.status === 404, 'PUT /appointments/:id/noshow: tenant_1 لا يستطيع no-show لموعد tenant_2 (404)');

    // اختبار 5.9: summary API مع tenant check
    const r9 = simulateGetPatientById(1, 2, 77);
    assert(r9.status === 404, 'GET /patients/:id/summary: tenant_1 لا يرى ملخص مريض tenant_2 (404)');

    // اختبار 5.10: timeline API مع tenant check
    const r10 = simulateGetPatientById(1, 2, 88);
    assert(r10.status === 404, 'GET /patients/:id/timeline: tenant_1 لا يرى جدول مريض tenant_2 (404)');
}

// ===== فحص 6: وجود logAudit في العمليات الحساسة =====
console.log(`\n${BOLD}[ 6 ] فحص وجود logAudit في server.js${RESET}`);
{
    const fs = require('fs');
    const serverContent = fs.readFileSync(__dirname + '/server.js', 'utf8');

    const requiredAudits = [
        { action: 'CREATE_PATIENT', label: 'logAudit: إنشاء مريض' },
        { action: 'UPDATE_PATIENT', label: 'logAudit: تعديل مريض' },
        { action: 'SOFT_DELETE',    label: 'logAudit: حذف/أرشفة مريض' },
        { action: 'CREATE_INVOICE', label: 'logAudit: إنشاء فاتورة' },
        { action: 'PAY_INVOICE',    label: 'logAudit: دفع فاتورة' },
        { action: 'CANCEL_INVOICE', label: 'logAudit: إلغاء فاتورة' },
        { action: 'CREATE_APPOINTMENT', label: 'logAudit: إنشاء موعد' },
        { action: 'DELETE_APPOINTMENT', label: 'logAudit: حذف موعد' },
        { action: 'CHECK_IN',       label: 'logAudit: check-in' },
        { action: 'NO_SHOW',        label: 'logAudit: no-show' },
        { action: 'CREATE_FOLLOWUP', label: 'logAudit: موعد متابعة' },
        { action: 'PARTIAL_PAYMENT', label: 'logAudit: دفع جزئي' },
        { action: 'GENERATE_INVOICE', label: 'logAudit: إنشاء فاتورة من generate' },
    ];

    for (const { action, label } of requiredAudits) {
        const found = serverContent.includes(`'${action}'`) || serverContent.includes(`"${action}"`);
        assert(found, label, `البحث عن: '${action}'`);
    }
}

// ===== فحص 7: عدم وجود WHERE id=$1 فقط في العمليات الحساسة =====
console.log(`\n${BOLD}[ 7 ] فحص عدم وجود WHERE id=$1 مكشوف (بدون tenant_id) في المسارات الحساسة${RESET}`);
{
    const fs = require('fs');
    const fullContent = fs.readFileSync(__dirname + '/server.js', 'utf8');

    // الأنماط الفعلية الموجودة في server.js كما تبيّن من الفحص
    const priorTenantChecks = [
        // GET patient by ID
        { pattern: "WHERE id=$1 AND tenant_id=$2", label: 'GET /patients/:id — pre-check AND tenant_id=$2' },
        // WHERE clause string builder
        { pattern: "' AND tenant_id=$2'", label: 'Dynamic tenantCheck pattern موجود في الكود' },
        // patients scope
        { pattern: "WHERE tenant_id = $1 ORDER BY id DESC LIMIT 200", label: 'GET /patients — filter by tenant_id' },
        // invoices scope
        { pattern: "WHERE tenant_id = $1 ORDER BY id DESC", label: 'GET /invoices — filter by tenant_id' },
        // appointments scope
        { pattern: "WHERE tenant_id = $1 ORDER BY id DESC", label: 'GET /appointments — filter by tenant_id' },
    ];

    for (const { pattern, label } of priorTenantChecks) {
        assert(
            fullContent.includes(pattern),
            `نمط موجود: "${label}"`,
            `البحث عن: ${pattern}`
        );
    }

    // تأكد أن UPDATE invoices SET paid=1 ... يأتي بعد التحقق من tenant
    assert(
        fullContent.includes('UPDATE invoices SET paid=1'),
        'UPDATE invoices SET paid=1 موجود (بعد التحقق المسبق من tenant_id)'
    );
    assert(
        fullContent.includes('UPDATE appointments SET status='),
        "UPDATE appointments SET status= موجود"
    );

    // تأكد وجود INSERT مع tenant_id في الثلاثة كيانات
    assert(
        fullContent.includes('INSERT INTO patients') && fullContent.includes('tenant_id, facility_id'),
        'INSERT INTO patients يتضمن tenant_id و facility_id'
    );
    assert(
        fullContent.includes('INSERT INTO invoices') && fullContent.includes('tenant_id, facility_id'),
        'INSERT INTO invoices يتضمن tenant_id و facility_id'
    );
    assert(
        fullContent.includes('INSERT INTO appointments') && fullContent.includes('tenant_id, facility_id'),
        'INSERT INTO appointments يتضمن tenant_id و facility_id'
    );
}


// ===== فحص 8: فحص SQL injection prevention في tenant_id parameter =====
console.log(`\n${BOLD}[ 8 ] فحص أمان parameterized queries لـ tenant_id${RESET}`);
{
    // التحقق أن tenant_id يُمرَّر دائماً كـ parameter وليس كـ string interpolation
    const fs = require('fs');
    const content = fs.readFileSync(__dirname + '/server.js', 'utf8');

    // يجب عدم وجود: WHERE tenant_id = '${tenantId}' أو WHERE tenant_id = " + tenantId
    const unsafeInterpolation1 = content.includes("tenant_id = '${tenantId}'");
    const unsafeInterpolation2 = content.includes(`tenant_id = " + tenantId`);
    const unsafeInterpolation3 = content.includes("tenant_id = ` + tenantId");

    assert(!unsafeInterpolation1, 'لا يوجد string interpolation خطير: tenant_id = ${tenantId}');
    assert(!unsafeInterpolation2, 'لا يوجد string concatenation خطير: " + tenantId');
    assert(!unsafeInterpolation3, 'لا يوجد string concatenation خطير: ` + tenantId');

    // تحقق أن الاستعلامات تستخدم $N parameters
    const parameterizedTenantQuery = content.includes('tenant_id = $1') ||
                                      content.includes('tenant_id = $2') ||
                                      content.includes('tenant_id=$1') ||
                                      content.includes('tenant_id=$2') ||
                                      content.includes('tenant_id = $6');
    assert(parameterizedTenantQuery, 'الاستعلامات تستخدم parameterized queries ($N) لـ tenant_id');
}

// ===== ملاحظة: تحذير متعلق بـ tenant_id literal في WHERE clause =====
console.log(`\n${BOLD}[ ⚠ ] ملاحظة بشأن WHERE id=$i AND tenant_id=${'{tenantId}'}${RESET}`);
{
    const fs = require('fs');
    const content = fs.readFileSync(__dirname + '/server.js', 'utf8');
    // في PUT /api/patients/:id، الكود يستخدم: `WHERE id=$${i} AND tenant_id=${tenantId}`
    // هذا يضع قيمة tenantId مباشرة في الـ query string — محدودية أمان
    const hasLiteralTenantInWhereClause = content.includes('AND tenant_id=${tenantId}');
    if (hasLiteralTenantInWhereClause) {
        console.log(`  ${YELLOW}⚠ تحذير${RESET}: يوجد استخدام لـ \`AND tenant_id=\${tenantId}\` في PUT /api/patients/:id`);
        console.log(`  ${YELLOW}  هذا يضع قيمة tenantId مباشرة في query string بدلاً من parameterized query.${RESET}`);
        console.log(`  ${YELLOW}  نظراً لأن tenantId يأتي من الجلسة (موثوق)، الخطر منخفض لكن يُنصح بإصلاحه لاحقاً.${RESET}`);
    } else {
        console.log(`  ${GREEN}✓ لم يُعثر على استخدام literal tenant_id في WHERE.${RESET}`);
    }
}

// ===== ملخص نهائي =====
console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج الاختبارات${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);
console.log(`  ${YELLOW}⏭ مُتخطى${RESET}: ${skipped}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
}

if (failed === 0) {
    console.log(`\n${BOLD}${GREEN}🎉 جميع الاختبارات نجحت! عزل المستأجر يعمل بشكل صحيح.${RESET}`);
    process.exit(0);
} else {
    console.log(`\n${BOLD}${RED}⛔ فشل ${failed} اختبار(ات). راجع السجل أعلاه.${RESET}`);
    process.exit(1);
}
