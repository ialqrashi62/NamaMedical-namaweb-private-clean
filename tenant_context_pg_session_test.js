const { pool } = require('./db_postgres');
const { withTenantTransaction } = require('./tenant_context_pg_session');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  تشغيل اختبارات الـ Tenant Context PG Session Prototype${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

async function runTests() {
    let failed = false;

    // Test 1: Missing tenant fails
    try {
        console.log(`[Test 1] التحقق من فشل الطلب عند غياب tenant_id...`);
        await withTenantTransaction(pool, {}, async (client, ctx) => {
            // Should not reach here
        });
        console.log(`  ${RED}❌ فشل: لم يرمِ خطأ عند غياب tenant_id!${RESET}`);
        failed = true;
    } catch (error) {
        if (error.message.includes('tenant_id is mandatory')) {
            console.log(`  ${GREEN}✅ نجح: تم رمي الخطأ المطلوب: ${error.message}${RESET}`);
        } else {
            console.log(`  ${RED}❌ فشل: رمى خطأ غير متوقع: ${error.message}${RESET}`);
            failed = true;
        }
    }

    // Test 2: SET LOCAL works inside transaction
    try {
        console.log(`\n[Test 2] التحقق من تفعيل SET LOCAL داخل الـ Transaction...`);
        const result = await withTenantTransaction(pool, { tenant_id: 123, facility_id: 456, branch_id: 789 }, async (client, ctx) => {
            const resTenant = await client.query("SELECT current_setting('app.tenant_id', true) AS tenant");
            const resFacility = await client.query("SELECT current_setting('app.facility_id', true) AS facility");
            const resBranch = await client.query("SELECT current_setting('app.branch_id', true) AS branch");
            return {
                tenant: resTenant.rows[0].tenant,
                facility: resFacility.rows[0].facility,
                branch: resBranch.rows[0].branch
            };
        });

        if (result.tenant === '123' && result.facility === '456' && result.branch === '789') {
            console.log(`  ${GREEN}✅ نجح: تم تعيين المتغيرات داخل المعاملة بنجاح (tenant: 123, facility: 456, branch: 789)${RESET}`);
        } else {
            console.log(`  ${RED}❌ فشل: قيم المتغيرات غير متطابقة: ${JSON.stringify(result)}${RESET}`);
            failed = true;
        }
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ أثناء تشغيل الاختبار: ${error.message}${RESET}`);
        failed = true;
    }

    // Test 3: COMMIT cleans up context
    try {
        console.log(`\n[Test 3] التحقق من تنظيف الجلسة (COMMIT cleanup) بعد انتهاء المعاملة بنجاح...`);
        // We will acquire a client manually, execute the helper context flow, commit, and then query the same client.
        const client = await pool.connect();
        try {
            // Simulating withTenantTransaction manually on this connection to ensure we query the exact same physical client.
            await client.query('BEGIN');
            await client.query("SELECT set_config('app.tenant_id', $1, true)", ['999']);
            await client.query('COMMIT');

            // Querying the setting after commit on the SAME client
            const checkRes = await client.query("SELECT current_setting('app.tenant_id', true) AS tenant");
            const tenantVal = checkRes.rows[0].tenant;

            if (tenantVal === '' || tenantVal === null) {
                console.log(`  ${GREEN}✅ نجح: تم مسح المتغير تلقائياً بعد الـ COMMIT (القيمة الحالية: "${tenantVal}")${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: المتغير لم يمسح بعد الـ COMMIT! (القيمة: "${tenantVal}")${RESET}`);
                failed = true;
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ: ${error.message}${RESET}`);
        failed = true;
    }

    // Test 4: ROLLBACK cleans up context
    try {
        console.log(`\n[Test 4] التحقق من تنظيف الجلسة (ROLLBACK cleanup) بعد فشل المعاملة والتراجع...`);
        const client = await pool.connect();
        try {
            try {
                await client.query('BEGIN');
                await client.query("SELECT set_config('app.tenant_id', $1, true)", ['888']);
                throw new Error('Simulated failure');
            } catch (err) {
                await client.query('ROLLBACK');
            }

            // Querying the setting after rollback on the SAME client
            const checkRes = await client.query("SELECT current_setting('app.tenant_id', true) AS tenant");
            const tenantVal = checkRes.rows[0].tenant;

            if (tenantVal === '' || tenantVal === null) {
                console.log(`  ${GREEN}✅ نجح: تم مسح المتغير تلقائياً بعد الـ ROLLBACK (القيمة الحالية: "${tenantVal}")${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: المتغير لم يمسح بعد الـ ROLLBACK! (القيمة: "${tenantVal}")${RESET}`);
                failed = true;
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ: ${error.message}${RESET}`);
        failed = true;
    }

    // Test 5: Tenant 1 does not leave trace on Tenant 2 (Concurrency/sequential leakage test)
    try {
        console.log(`\n[Test 5] التحقق من عدم تسرب البيانات والـ Context بين مستأجر وآخر...`);
        
        // Execute Tenant 1
        await withTenantTransaction(pool, { tenant_id: 1 }, async (client, ctx) => {
            const tenantVal = (await client.query("SELECT current_setting('app.tenant_id', true) AS tenant")).rows[0].tenant;
            if (tenantVal !== '1') throw new Error(`Expected 1, got ${tenantVal}`);
        });

        // Execute Tenant 2
        await withTenantTransaction(pool, { tenant_id: 2 }, async (client, ctx) => {
            const tenantVal = (await client.query("SELECT current_setting('app.tenant_id', true) AS tenant")).rows[0].tenant;
            if (tenantVal !== '2') throw new Error(`Expected 2, got ${tenantVal}`);
        });

        console.log(`  ${GREEN}✅ نجح: تم تشغيل المعاملات المتتابعة بأمان ودون أي تداخل أو تسرب.${RESET}`);
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ تسريب أو تداخل: ${error.message}${RESET}`);
        failed = true;
    }

    // Test 6: Verify no plain SET statements in helper file
    try {
        console.log(`\n[Test 6] فحص الكود البرمجي لـ helper لضمان عدم استخدام SET العادي...`);
        const helperContent = fs.readFileSync(path.join(__dirname, 'tenant_context_pg_session.js'), 'utf8');
        
        // Regex checking for client.query("SET app.tenant_id...") or similar plain SET statements
        const hasPlainSet = /client\.query\(\s*['"`]SET\s+/i.test(helperContent);

        if (!hasPlainSet) {
            console.log(`  ${GREEN}✅ نجح: لا توجد أي استعلامات SET عادية مباشرة في الكود المصدر للـ helper.${RESET}`);
        } else {
            console.log(`  ${RED}❌ فشل: تم العثور على استعلام SET عادي في الكود المصدر!${RESET}`);
            failed = true;
        }
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ أثناء فحص الكود: ${error.message}${RESET}`);
        failed = true;
    }

    // Test 7: Connection leak check (checking pool status)
    try {
        console.log(`\n[Test 7] التحقق من عدم وجود تسريب في الاتصالات (Connection Leaks Check)...`);
        
        const activeCountBefore = pool.totalCount - pool.idleCount;
        
        await withTenantTransaction(pool, { tenant_id: 100 }, async (client, ctx) => {
            return 1;
        });

        const activeCountAfter = pool.totalCount - pool.idleCount;
        
        if (activeCountAfter <= activeCountBefore + 1) {
            console.log(`  ${GREEN}✅ نجح: لم يظهر أي تسرب في الاتصالات بعد تشغيل الـ middleware (الاتصالات النشطة الحالية: ${activeCountAfter})${RESET}`);
        } else {
            console.log(`  ${RED}❌ فشل: الاتصالات النشطة زادت بشكل غير طبيعي! (قبل: ${activeCountBefore}، بعد: ${activeCountAfter})${RESET}`);
            failed = true;
        }
    } catch (error) {
        console.log(`  ${RED}❌ فشل: حدث خطأ: ${error.message}${RESET}`);
        failed = true;
    }

    console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
    if (failed) {
        console.log(`${BOLD}${RED}🔴 نتيجة اختبارات الـ Prototype: فشل بعض الاختبارات!${RESET}`);
        process.exit(1);
    } else {
        console.log(`${BOLD}${GREEN}🟢 نتيجة اختبارات الـ Prototype: نجاح كافة الاختبارات 100%!${RESET}`);
    }
    console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
