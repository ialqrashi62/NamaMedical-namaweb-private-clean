/**
 * cross_tenant_clinical_signatures_test.js
 * ============================================================================
 * اختبار الأمان والتكامل لترقية حوكمة السجلات الطبية والصلاحيات ومصفوفة ملاك الأقسام
 * Automated QA and Security Audit for Clinical Signatures, Action RBAC, & Department Owner Matrix
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
console.log(`${BOLD}${BLUE}  بدء اختبار الجودة والأمان لحوكمة السجلات ومصفوفة ملاك الأقسام${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Clinical Signatures & Advanced RBAC QA Test${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. التدقيق الاستاتيكي لـ server.js (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] التدقيق الاستاتيكي للمسارات والحراس في server.js${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// A. Check that the requirePermission middleware is defined and instantiated correctly
assert(serverContent.includes('const requirePermission = makeRequirePermission({'), 'تأسيس حارس requirePermission في الملف');

// B. Check that EMR lock route is defined once and properly guarded
const lockRouteIndex1 = serverContent.indexOf("app.post('/api/clinical/records/:id/lock'");
const lockRouteIndex2 = serverContent.lastIndexOf("app.post('/api/clinical/records/:id/lock'");
assert(lockRouteIndex1 !== -1, 'تعريف مسار قفل السجل الطبي POST /api/clinical/records/:id/lock');
assert(lockRouteIndex1 === lockRouteIndex2, 'عدم وجود تكرار لمسار قفل السجل الطبي (Unreachable Route Prevented)');

// C. Verify requireTenantScope and role checks on lock route
assert(serverContent.includes("app.post('/api/clinical/records/:id/lock', requireAuth, requireRole('patients'), requireTenantScope"), 
    'تطبيق حراس requireRole و requireTenantScope على مسار القفل الموحد');

// D. Verify clinical role boundary checks in EMR Lock logic
assert(serverContent.includes('isPhysicianEMR') && serverContent.includes('allowedPhysicianRoles'), 
    'تطبيق حواجز التخصص الطبي والتمريضي (Clinical Signature Boundary)');
assert(serverContent.includes("isPhysicianEMR && !allowedPhysicianRoles.has(userRole)"),
    'منع الفئات غير الطبية (مثل التمريض) من توقيع سجلات الأطباء (403 Access Denied)');

// E. Verify Action-level RBAC requirePermission guards
assert(serverContent.includes("app.put('/api/or/slots/:id/cancel', requireAuth, requireRole('surgery', 'doctor'), requireTenantScope, requirePermission('or:cancel')"),
    'تطبيق requirePermission(\'or:cancel\') على مسار إلغاء العمليات الجراحية');
assert(serverContent.includes("app.post('/api/invoices/cancel/:id', requireAuth, requireRole('invoices', 'accounts'), requireTenantScope, requirePermission('invoices:cancel')"),
    'تطبيق requirePermission(\'invoices:cancel\') على مسار إلغاء الفواتير المالية');
assert(serverContent.includes("app.delete('/api/messages/:id', requireAuth, requireTenantScope, requirePermission('messages:delete')"),
    'تطبيق requirePermission(\'messages:delete\') على مسار حذف الرسائل الداخلية');


// ===== 2. فحص حالة قاعدة البيانات والتوافق (Database Schema & Integrity Integration) =====
console.log(`\n${BOLD}[ 2 ] التحقق من مصفوفة ملاك الأقسام وتكامل قاعدة البيانات${RESET}`);

(async () => {
    // Read database configuration from .env
    require('dotenv').config();
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'nama_medical_web',
        user: process.env.DB_USER || 'nama_medical_app',
        password: process.env.DB_PASSWORD
    };

    const client = new Client(dbConfig);
    try {
        await client.connect();
        
        // Query to check table columns
        const colRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'clinical_departments' AND column_name = 'owner_role';
        `);
        assert(colRes.rowCount === 1, 'وجود حقل owner_role في جدول clinical_departments');
        if (colRes.rowCount === 1) {
            assert(colRes.rows[0].data_type.toLowerCase().includes('char'), 'نوع الحقل owner_role هو سلسلة نصية مناسبة');
        }

        // Query to check mapped owners distribution
        const ownerRes = await client.query(`
            SELECT owner_role, count(*) as count 
            FROM clinical_departments 
            GROUP BY owner_role;
        `);
        console.log(`  📊 توزيع ملاك الأقسام الحالي:`);
        ownerRes.rows.forEach(r => {
            console.log(`    - ${r.owner_role}: ${r.count} أقسام`);
        });
        
        const unmappedRes = await client.query(`
            SELECT count(*) as count 
            FROM clinical_departments 
            WHERE owner_role IS NULL OR owner_role = '';
        `);
        assert(parseInt(unmappedRes.rows[0].count, 10) === 0, 'جميع الأقسام الطبية والتشغيلية مرتبطة بمالك قرار (0 unmapped)');

        await client.end();
    } catch (err) {
        console.error('  ❌ فشل الاتصال بقاعدة البيانات لإنهاء الفحص:', err.message);
        failed++;
        failureLog.push({ testName: 'الاتصال بقاعدة البيانات للفحص', details: err.message });
    }

    // ===== نتائج الفحص النهائي =====
    console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
    console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات حوكمة السجلات والصلاحيات والملاك${RESET}`);
    console.log(`  إجمالي الفحوصات الناجحة (PASSED): ${passed}`);
    console.log(`  إجمالي الفحوصات الفاشلة (FAILED): ${failed}`);
    console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

    if (failed > 0) {
        console.error(`${RED}🔴 فشل الاختبار! تم رصد خلل أو عدم توافق في التعديلات الجديدة.${RESET}`);
        process.exit(1);
    } else {
        console.log(`${GREEN}🟢 نجاح كافة اختبارات حوكمة السجلات والملاك والصلاحيات بنسبة 100%!${RESET}`);
        process.exit(0);
    }
})();
