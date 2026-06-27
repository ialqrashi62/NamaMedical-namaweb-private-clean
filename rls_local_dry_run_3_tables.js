/**
 * rls_local_dry_run_3_tables.js
 * ============================================================================
 * سكربت التشغيل التجريبي المحلي لـ RLS على 3 جداول: patients, invoices, appointments
 *
 * الخطوات:
 * 1. التحقق من أمان البيئة ومحلية قاعدة البيانات.
 * 2. أخذ نسخة احتياطية تلقائية باستخدام pg_dump.
 * 3. تفعيل RLS وإنشاء السياسات على الجداول الثلاثة فقط.
 * 4. إنشاء دور مستخدم غير مشرف (test_rls_user) للتحقق من تفعيل السياسات.
 * 5. تشغيل اختبارات التحقق من عزل المستأجرين (إدخال، قراءة، تعديل، تجميع) تحت دور test_rls_user.
 * 6. التراجع الكامل (Rollback) وحذف السياسات وإيقاف RLS وتطهير الدور والمستخدمين.
 * 7. التحقق النهائي من خلو قاعدة البيانات من أي سياسات متبقية.
 * ============================================================================
 */

const { Client } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// تحميل الإعدادات من ملف .env
dotenv.config({ path: path.join(__dirname, '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_NAME = process.env.DB_NAME || 'nama_medical_web';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

// إعداد ألوان الطرفية لجمالية المخرجات
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  التشغيل التجريبي لـ RLS على جداول المرضى والفواتير والمواعيد${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — RLS Local Dry-Run (3 Tables Only)${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

// ----------------------------------------------------------------------------
// 1. التحقق من أمان البيئة
// ----------------------------------------------------------------------------
function checkEnvironment() {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(DB_HOST.toLowerCase());
    const isProdName = ['prod', 'production', 'live'].some(keyword => DB_NAME.toLowerCase().includes(keyword));

    console.log(`[1] فحص سلامة البيئة واتصال قاعدة البيانات...`);
    console.log(`  - المضيف: ${DB_HOST}`);
    console.log(`  - قاعدة البيانات: ${DB_NAME}`);

    if (!isLocal || isProdName) {
        console.error(`\n${BOLD}${RED}⛔ خطأ أمني: البيئة لا تبدو محلية أو آمنة!${RESET}`);
        console.error(`يمنع تشغيل هذا السكربت على بيئات إنتاجية أو خارجية. تم إلغاء التشغيل.`);
        process.exit(1);
    }
    console.log(`  ${GREEN}✅ البيئة آمنة ومحلية تماماً.${RESET}`);
}

// ----------------------------------------------------------------------------
// 2. أخذ النسخة الاحتياطية تلقائياً
// ----------------------------------------------------------------------------
function getPgDumpExecutable() {
    // 1. Check env variable
    if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
        return `"${process.env.PG_DUMP_PATH}"`;
    }

    // 2. Check if pg_dump is globally available in PATH
    try {
        execSync('pg_dump --version', { stdio: 'ignore' });
        return 'pg_dump';
    } catch (e) {
        // Not in PATH globally
    }

    // 3. Check known Windows installation paths
    const winPaths = [
        'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe'
    ];
    for (const p of winPaths) {
        if (fs.existsSync(p)) {
            return `"${p}"`;
        }
    }

    // 4. Default fallback
    return 'pg_dump';
}

function runBackup() {
    console.log(`\n[2] إنشاء نسخة احتياطية لقاعدة البيانات المحلية قبل البدء...`);
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const backupsDir = path.join(__dirname, 'backups');
    
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir);
    }
    
    const backupFileName = `rls_local_dry_run_before_${dateStr}.backup`;
    const backupPath = path.join(backupsDir, backupFileName);

    try {
        // تعيين كلمة المرور لـ pg_dump لتفادي مطالبة إدخالها يدوياً
        process.env.PGPASSWORD = DB_PASSWORD;
        const pgDumpExe = getPgDumpExecutable();
        console.log(`  - استخدام أداة pg_dump من: ${pgDumpExe}`);
        const backupCommand = `${pgDumpExe} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -F c -f "${backupPath}"`;
        
        execSync(backupCommand, { stdio: 'inherit' });
        console.log(`  ${GREEN}✅ تم أخذ النسخة الاحتياطية بنجاح وحفظها في:${RESET}`);
        console.log(`  ${backupPath}`);
        return backupPath;
    } catch (error) {
        console.error(`\n${BOLD}${RED}⛔ خطأ: فشل تشغيل pg_dump لأخذ النسخة الاحتياطية!${RESET}`);
        console.error(`السبب: ${error.message}`);
        console.error(`لا يمكن الاستمرار دون ضمان أخذ نسخة احتياطية. تم إلغاء العملية.`);
        process.exit(1);
    }
}

// ----------------------------------------------------------------------------
// 3. تطبيق سياسات RLS واختبارها والتراجع عنها
// ----------------------------------------------------------------------------
async function executeDryRun() {
    const client = new Client({
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        await client.connect();
        console.log(`\n[3] الاتصال بقاعدة البيانات بنجاح.`);

        // التحقق من وجود الأعمدة اللازمة
        const colCheck = await client.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('patients', 'invoices', 'appointments') 
              AND column_name = 'tenant_id'
        `);
        if (colCheck.rows.length < 3) {
            console.error(`\n${RED}⛔ خطأ: عمود tenant_id مفقود من أحد الجداول الثلاثة!${RESET}`);
            process.exit(1);
        }

        // تفعيل RLS وإنشاء السياسات
        console.log(`\n[4] تفعيل RLS وإنشاء السياسات على الجداول الثلاثة محلياً...`);
        await client.query(`
            -- تفعيل RLS
            ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
            ALTER TABLE patients FORCE ROW LEVEL SECURITY;
            
            ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
            ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
            
            ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
            ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

            -- إنشاء سياسات العزل
            DROP POLICY IF EXISTS dry_run_patients_policy ON patients;
            CREATE POLICY dry_run_patients_policy ON patients
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

            DROP POLICY IF EXISTS dry_run_invoices_policy ON invoices;
            CREATE POLICY dry_run_invoices_policy ON invoices
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

            DROP POLICY IF EXISTS dry_run_appointments_policy ON appointments;
            CREATE POLICY dry_run_appointments_policy ON appointments
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

            -- تنظيف أي دور سابق والامتيازات الخاصة به لتجنب خطأ التبعيات
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_rls_user') THEN
                    REVOKE ALL ON patients, invoices, appointments FROM test_rls_user;
                    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM test_rls_user;
                    DROP ROLE test_rls_user;
                END IF;
            END $$;

            -- إنشاء دور مستخدم غير مشرف وتفويضه بالصلاحيات
            CREATE ROLE test_rls_user WITH LOGIN;
            GRANT SELECT, INSERT, UPDATE, DELETE ON patients, invoices, appointments TO test_rls_user;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO test_rls_user;
        `);

        console.log(`  ${GREEN}✅ تم تفعيل RLS وإنشاء دور مستخدم الاختبار (test_rls_user).${RESET}`);

        // تنظيف أي بيانات تجريبية سابقة بنفس الأسماء المحددة لتجنب الأخطاء
        await client.query(`
            DELETE FROM appointments WHERE patient_name IN ('TEST_PATIENT_T1', 'TEST_PATIENT_T2');
            DELETE FROM invoices WHERE invoice_number IN ('INV-T1-DRY', 'INV-T2-DRY');
            DELETE FROM patients WHERE name_ar IN ('TEST_PATIENT_T1', 'TEST_PATIENT_T2');
        `);

        // تحويل الجلسة إلى دور مستخدم الاختبار غير المشرف
        await client.query("SET ROLE test_rls_user");

        // اختبار 1: إدخال بيانات لمستأجر 1 تحت سياقه الخاص
        console.log(`\n[5.1] اختبار إدخال بيانات المستأجر 1 (tenant_id = 1)...`);
        await client.query("SET app.tenant_id = '1'");
        await client.query("INSERT INTO patients (name_ar, tenant_id) VALUES ('TEST_PATIENT_T1', 1)");
        await client.query("INSERT INTO invoices (invoice_number, amount, tenant_id) VALUES ('INV-T1-DRY', 100, 1)");
        await client.query("INSERT INTO appointments (patient_name, appt_date, tenant_id) VALUES ('TEST_PATIENT_T1', '2026-06-20', 1)");
        console.log(`  ${GREEN}✅ تم إدخال بيانات مستأجر 1 بنجاح.${RESET}`);

        // اختبار 2: إدخال بيانات لمستأجر 2 تحت سياقه الخاص
        console.log(`\n[5.2] اختبار إدخال بيانات المستأجر 2 (tenant_id = 2)...`);
        await client.query("SET app.tenant_id = '2'");
        await client.query("INSERT INTO patients (name_ar, tenant_id) VALUES ('TEST_PATIENT_T2', 2)");
        await client.query("INSERT INTO invoices (invoice_number, amount, tenant_id) VALUES ('INV-T2-DRY', 200, 2)");
        await client.query("INSERT INTO appointments (patient_name, appt_date, tenant_id) VALUES ('TEST_PATIENT_T2', '2026-06-21', 2)");
        console.log(`  ${GREEN}✅ تم إدخال بيانات مستأجر 2 بنجاح.${RESET}`);

        // اختبار 3: التحقق من القراءة والعزل لمستأجر 1
        console.log(`\n[5.3] التحقق من عزل القراءة للمستأجر 1...`);
        await client.query("SET app.tenant_id = '1'");
        
        const resPatientsT1 = await client.query("SELECT * FROM patients WHERE name_ar LIKE 'TEST_PATIENT%'");
        const resInvoicesT1 = await client.query("SELECT * FROM invoices WHERE invoice_number LIKE '%DRY'");
        const resApptsT1 = await client.query("SELECT * FROM appointments WHERE patient_name LIKE 'TEST_PATIENT%'");

        if (resPatientsT1.rows.length === 1 && resPatientsT1.rows[0].name_ar === 'TEST_PATIENT_T1' &&
            resInvoicesT1.rows.length === 1 && resInvoicesT1.rows[0].invoice_number === 'INV-T1-DRY' &&
            resApptsT1.rows.length === 1 && resApptsT1.rows[0].patient_name === 'TEST_PATIENT_T1') {
            console.log(`  ${GREEN}✅ نجح: المستأجر 1 يرى بياناته الخاصة فقط ولا تتسرب له بيانات المستأجر 2.${RESET}`);
        } else {
            throw new Error(`فشل عزل القراءة للمستأجر 1. السجلات المسترجعة: ${JSON.stringify({ patients: resPatientsT1.rows, invoices: resInvoicesT1.rows, appointments: resApptsT1.rows })}`);
        }

        // اختبار 4: التحقق من القراءة والعزل لمستأجر 2
        console.log(`\n[5.4] التحقق من عزل القراءة للمستأجر 2...`);
        await client.query("SET app.tenant_id = '2'");
        
        const resPatientsT2 = await client.query("SELECT * FROM patients WHERE name_ar LIKE 'TEST_PATIENT%'");
        const resInvoicesT2 = await client.query("SELECT * FROM invoices WHERE invoice_number LIKE '%DRY'");
        const resApptsT2 = await client.query("SELECT * FROM appointments WHERE patient_name LIKE 'TEST_PATIENT%'");

        if (resPatientsT2.rows.length === 1 && resPatientsT2.rows[0].name_ar === 'TEST_PATIENT_T2' &&
            resInvoicesT2.rows.length === 1 && resInvoicesT2.rows[0].invoice_number === 'INV-T2-DRY' &&
            resApptsT2.rows.length === 1 && resApptsT2.rows[0].patient_name === 'TEST_PATIENT_T2') {
            console.log(`  ${GREEN}✅ نجح: المستأجر 2 يرى بياناته الخاصة فقط ولا تتسرب له بيانات المستأجر 1.${RESET}`);
        } else {
            throw new Error(`فشل عزل القراءة للمستأجر 2. السجلات المسترجعة: ${JSON.stringify({ patients: resPatientsT2.rows, invoices: resInvoicesT2.rows, appointments: resApptsT2.rows })}`);
        }

        // اختبار 5: منع إدخال غير متطابق (INSERT Mismatch Prevention)
        console.log(`\n[5.5] التحقق من منع إدخال سجلات غير متطابقة مع سياق الجلسة (IDOR Prevention)...`);
        await client.query("SET app.tenant_id = '1'");
        try {
            await client.query("INSERT INTO patients (name_ar, tenant_id) VALUES ('TEST_PATIENT_FRAUD', 2)");
            throw new Error('تم السماح بإدخال سجل مستأجر 2 أثناء تعيين الجلسة لمستأجر 1!');
        } catch (err) {
            if (err.message.includes('row-level security policy') || err.code === '42501') {
                console.log(`  ${GREEN}✅ نجح: تم إحباط محاولة الإدخال غير المصرح به بنجاح من قاعدة البيانات.${RESET}`);
            } else {
                throw err;
            }
        }

        // اختبار 6: منع تحديث سجل يخص مستأجر آخر (UPDATE Isolation)
        console.log(`\n[5.6] التحقق من منع تحديث سجلات تتبع مستأجراً آخر...`);
        await client.query("SET app.tenant_id = '1'");
        const updateRes = await client.query("UPDATE patients SET name_ar = 'HACKED' WHERE name_ar = 'TEST_PATIENT_T2'");
        if (updateRes.rowCount === 0) {
            console.log(`  ${GREEN}✅ نجح: لم يؤثر التعديل على أي سجلات يملكها مستأجر آخر (أثّر على 0 صفوف).${RESET}`);
        } else {
            throw new Error('تم تعديل سجل مستأجر 2 بنجاح من قبل مستأجر 1!');
        }

        // اختبار 7: منع تسريب التجميعات (Aggregates check)
        console.log(`\n[5.7] التحقق من صحة العمليات التجميعية (SUM/COUNT)...`);
        await client.query("SET app.tenant_id = '1'");
        const aggregateRes = await client.query("SELECT COUNT(*) as cnt, SUM(amount) as total FROM invoices WHERE invoice_number LIKE '%DRY'");
        const cnt = parseInt(aggregateRes.rows[0].cnt);
        const total = parseFloat(aggregateRes.rows[0].total);
        if (cnt === 1 && total === 100.0) {
            console.log(`  ${GREEN}✅ نجح: الحسابات التجميعية تقتصر فقط على بيانات المستأجر الحالي (العدد: 1، المجموع: 100).${RESET}`);
        } else {
            throw new Error(`فشلت الحسابات التجميعية المعزولة. العدد: ${cnt}، المجموع: ${total}`);
        }

        // إرجاع الجلسة إلى دور سوبر يوزر الأساسي لتنظيف البيانات وإلغاء RLS
        await client.query("RESET ROLE");

        // تنظيف بيانات الاختبار المؤقتة
        await client.query(`
            DELETE FROM appointments WHERE patient_name IN ('TEST_PATIENT_T1', 'TEST_PATIENT_T2');
            DELETE FROM invoices WHERE invoice_number IN ('INV-T1-DRY', 'INV-T2-DRY');
            DELETE FROM patients WHERE name_ar IN ('TEST_PATIENT_T1', 'TEST_PATIENT_T2');
        `);

        // ----------------------------------------------------------------------------
        // 4. التراجع الكامل (Rollback)
        // ----------------------------------------------------------------------------
        console.log(`\n[6] بدء عملية التراجع وتعطيل RLS (Local Rollback)...`);
        await client.query(`
            ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;
            ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
            ALTER TABLE appointments NO FORCE ROW LEVEL SECURITY;

            ALTER TABLE patients DISABLE ROW LEVEL SECURITY;
            ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
            ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS dry_run_patients_policy ON patients;
            DROP POLICY IF EXISTS dry_run_invoices_policy ON invoices;
            DROP POLICY IF EXISTS dry_run_appointments_policy ON appointments;

            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_rls_user') THEN
                    REVOKE ALL ON patients, invoices, appointments FROM test_rls_user;
                    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM test_rls_user;
                    DROP ROLE test_rls_user;
                END IF;
            END $$;
        `);
        console.log(`  ${GREEN}✅ تم إلغاء تفعيل RLS وحذف جميع السياسات التجريبية والدور المؤقت.${RESET}`);

        // ----------------------------------------------------------------------------
        // 5. التحقق بعد التراجع
        // ----------------------------------------------------------------------------
        console.log(`\n[7] التحقق النهائي من تعطيل RLS...`);
        // نقوم بإدخال سجلين لمستأجرين مختلفين دون إعداد الجلسة للتحقق من رجوع السلوك الطبيعي للمطورين
        await client.query("INSERT INTO patients (name_ar, tenant_id) VALUES ('TEST_PATIENT_T1', 1)");
        await client.query("INSERT INTO patients (name_ar, tenant_id) VALUES ('TEST_PATIENT_T2', 2)");
        
        const finalCheck = await client.query("SELECT * FROM patients WHERE name_ar LIKE 'TEST_PATIENT%'");
        if (finalCheck.rows.length === 2) {
            console.log(`  ${GREEN}✅ نجح: RLS معطل تماماً الآن، ويستطيع المطور رؤية كافة السجلات بلا قيود كالمعتاد.${RESET}`);
        } else {
            throw new Error(`فشل التحقق من تعطيل RLS. عدد السجلات: ${finalCheck.rows.length}`);
        }

        // تنظيف نهائي
        await client.query("DELETE FROM patients WHERE name_ar LIKE 'TEST_PATIENT%'");

    } catch (error) {
        console.error(`\n${BOLD}${RED}⛔ حدث خطأ أثناء تشغيل التجربة!${RESET}`);
        console.error(error);
        
        console.log(`\n${YELLOW}⚠️ محاولة إجراء تراجع طوارئ (Emergency Rollback) لتأمين قاعدة البيانات...${RESET}`);
        try {
            await client.query("RESET ROLE");
            await client.query(`
                ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;
                ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
                ALTER TABLE appointments NO FORCE ROW LEVEL SECURITY;
                
                ALTER TABLE patients DISABLE ROW LEVEL SECURITY;
                ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
                ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
                
                DROP POLICY IF EXISTS dry_run_patients_policy ON patients;
                DROP POLICY IF EXISTS dry_run_invoices_policy ON invoices;
                DROP POLICY IF EXISTS dry_run_appointments_policy ON appointments;

                DO $$
                BEGIN
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'test_rls_user') THEN
                        REVOKE ALL ON patients, invoices, appointments FROM test_rls_user;
                        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM test_rls_user;
                        DROP ROLE test_rls_user;
                    END IF;
                END $$;
            `);
            console.log(`  ${GREEN}✅ نجح تراجع الطوارئ وتم تأمين بيئة التطوير.${RESET}`);
        } catch (rollbackErr) {
            console.error(`  ${RED}❌ فشل تراجع الطوارئ! قد تكون قاعدة البيانات في حالة غير مستقرة.${RESET}`, rollbackErr);
        }
        process.exit(1);
    } finally {
        await client.end();
        console.log(`\n${BOLD}${GREEN}🎉 انتهى اختبار RLS التجريبي المحلي بنجاح 100% وتم إعادة تهيئة القاعدة كالمعتاد.${RESET}\n`);
    }
}

// البدء بالتشغيل
checkEnvironment();
runBackup();
executeDryRun();
