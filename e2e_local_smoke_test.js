/**
 * e2e_local_smoke_test.js
 * ============================================================================
 * E2E Local Smoke Test for NamaMedical
 * Validates Login, Protected Routes, Session Management, and Rate Limiting locally.
 * ============================================================================
 */

const { spawn } = require('child_process');
const http = require('http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

// Enforce Safety Guard
if (process.env.E2E_ALLOW_BROWSER_SMOKE !== 'true') {
    console.error('⛔ [SAFETY GUARD] E2E_ALLOW_BROWSER_SMOKE is not set to true. Execution blocked.');
    process.exit(1);
}

const E2E_READ_ONLY_MODE = process.env.E2E_READ_ONLY_MODE !== 'false';
const E2E_TEST_USERNAME = process.env.E2E_TEST_USERNAME || 'admin';
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

if (!E2E_TEST_PASSWORD) {
    console.error('⛔ [SAFETY GUARD] E2E_TEST_PASSWORD is not provided in environment variables.');
    process.exit(1);
}

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'nama_medical_web';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

const TEST_PORT = 3000;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${TEST_PORT}`;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  بدء اختبارات E2E Local Smoke Test لنظام نما الطبي (محصن)${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

const pool = new Pool({
    host: DB_HOST,
    port: parseInt(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD
});

// helper for HTTP requests
function request(method, urlPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: TEST_PORT,
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = data;
                try {
                    parsedBody = JSON.parse(data);
                } catch (e) {}
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsedBody
                });
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Helper to wait for port to be open
function waitPort(port, retries = 10) {
    return new Promise((resolve, reject) => {
        const socket = new (require('net').Socket)();
        const onError = () => {
            socket.destroy();
            if (retries <= 0) {
                return reject(new Error(`Timeout waiting for port ${port}`));
            }
            setTimeout(() => {
                waitPort(port, retries - 1).then(resolve, reject);
            }, 1000);
        };
        socket.setTimeout(500);
        socket.once('error', onError);
        socket.once('timeout', onError);
        socket.connect(port, '127.0.0.1', () => {
            socket.destroy();
            resolve();
        });
    });
}

async function runSmokeTests() {
    let failed = false;
    let serverProcess = null;
    let originalHash = '';

    try {
        // [WRITE_ACTION] DB Password Reset
        if (E2E_READ_ONLY_MODE) {
            console.log(`[1] [READ-ONLY MODE] تخطي تعديل كلمة مرور المسؤول في قاعدة البيانات.`);
        } else {
            if (process.env.E2E_CONFIRM_DB_WRITE !== 'true') {
                console.error('⛔ [SAFETY GUARD] DB Write Actions require E2E_CONFIRM_DB_WRITE=true. Blocked.');
                process.exit(1);
            }
            console.log(`[1] تحديث كلمة مرور المشرف محلياً للتحضير للاختبار...`);
            const salt = bcrypt.genSaltSync(12);
            const hash = bcrypt.hashSync(E2E_TEST_PASSWORD, salt);

            // Fetch original hash first
            const origResult = await pool.query("SELECT password_hash FROM system_users WHERE username=$1", [E2E_TEST_USERNAME]);
            if (origResult.rows.length > 0) {
                originalHash = origResult.rows[0].password_hash;
            }

            await pool.query("UPDATE system_users SET password_hash = $1 WHERE username = $2", [hash, E2E_TEST_USERNAME]);
            console.log(`  ${GREEN}✅ تم تحديث كلمة مرور ${E2E_TEST_USERNAME} بنجاح.${RESET}`);
        }

        // 2. Spawn express server
        console.log(`\n[2] تشغيل خادم Express الطبي محلياً على المنفذ ${TEST_PORT}...`);
        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname,
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'development' }
        });

        // Log server stdout occasionally
        serverProcess.stdout.on('data', (data) => {
            const str = data.toString();
            if (str.includes('Web is running')) {
                console.log(`  ${YELLOW}[SERVER] ${str.trim()}${RESET}`);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`  [SERVER ERROR] ${data.toString().trim()}`);
        });

        await waitPort(TEST_PORT);
        console.log(`  ${GREEN}✅ خادم Express نشط ومستعد لاستقبال الطلبات.${RESET}`);

        // 3. E2E tests
        // Test 3.1: Invalid login fails
        console.log(`\n[3.1] اختبار تسجيل دخول خاطئ (Invalid Login)...`);
        const invalidLoginRes = await request('POST', '/api/auth/login', {}, { username: E2E_TEST_USERNAME, password: 'wrongpassword' });
        if (invalidLoginRes.statusCode === 401) {
            console.log(`  ${GREEN}✅ نجح: تم رفض الدخول بكلمة مرور خاطئة (Status: 401).${RESET}`);
        } else {
            console.log(`  ${RED}❌ فشل: لم يرجع الخادم رمز 401! (رجع: ${invalidLoginRes.statusCode})${RESET}`);
            failed = true;
        }

        // Test 3.2: Valid login succeeds and returns cookie
        console.log(`\n[3.2] اختبار تسجيل دخول صحيح (Valid Login)...`);
        const validLoginRes = await request('POST', '/api/auth/login', {}, { username: E2E_TEST_USERNAME, password: E2E_TEST_PASSWORD });
        
        let sessionCookie = '';
        if (validLoginRes.statusCode === 200) {
            const setCookie = validLoginRes.headers['set-cookie'];
            if (setCookie && setCookie[0]) {
                sessionCookie = setCookie[0].split(';')[0];
                console.log(`  ${GREEN}✅ نجح: تم قبول تسجيل الدخول وحصلنا على الكوكيز.${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: لم يتم إرجاع كوكيز الجلسة!${RESET}`);
                failed = true;
            }
        } else {
            console.log(`  ${RED}❌ فشل: حالة الاستجابة ليست 200 OK! (رجعت: ${validLoginRes.statusCode})${RESET}`);
            failed = true;
        }

        if (sessionCookie) {
            const authHeaders = { 'Cookie': sessionCookie };

            // Test 3.3: Fetch dashboard stats
            console.log(`\n[3.3] اختبار الوصول للوحة التحكم (Dashboard)...`);
            const dashboardRes = await request('GET', '/api/dashboard/stats', authHeaders);
            if (dashboardRes.statusCode === 200) {
                console.log(`  ${GREEN}✅ نجح: تم الوصول للوحة التحكم وجلب البيانات العامة (الحالة: 200 OK).${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: رمز استجابة غير متوقع للوحة التحكم (الحالة: ${dashboardRes.statusCode})${RESET}`);
                failed = true;
            }

            // Test 3.4: Fetch patients list
            console.log(`\n[3.4] اختبار الوصول لقائمة المرضى (Patients List)...`);
            const patientsRes = await request('GET', '/api/patients', authHeaders);
            if (patientsRes.statusCode === 200) {
                // PHI Logging Guard
                console.log(`  ${GREEN}✅ نجح: تم جلب قائمة المرضى بنجاح (الحالة: 200 OK). [تنبيه أمان: تم حظر طباعة تفاصيل المرضى لمنع تسريب PHI]${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: رمز استجابة غير متوقع للمرضى (الحالة: ${patientsRes.statusCode})${RESET}`);
                failed = true;
            }

            // Test 3.5: Fetch appointments list
            console.log(`\n[3.5] اختبار الوصول لقائمة المواعيد (Appointments List)...`);
            const apptsRes = await request('GET', '/api/appointments', authHeaders);
            if (apptsRes.statusCode === 200) {
                console.log(`  ${GREEN}✅ نجح: تم جلب قائمة المواعيد بنجاح (الحالة: 200 OK). [تنبيه أمان: تم حظر طباعة تفاصيل المواعيد لمنع تسريب PHI]${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: رمز استجابة غير متوقع للمواعيد (الحالة: ${apptsRes.statusCode})${RESET}`);
                failed = true;
            }

            // Test 3.6: Fetch invoices list
            console.log(`\n[3.6] اختبار الوصول لقائمة الفواتير (Invoices List)...`);
            const invoicesRes = await request('GET', '/api/invoices', authHeaders);
            if (invoicesRes.statusCode === 200) {
                console.log(`  ${GREEN}✅ نجح: تم جلب قائمة الفواتير بنجاح (الحالة: 200 OK).${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: رمز استجابة غير متوقع للفواتير (الحالة: ${invoicesRes.statusCode})${RESET}`);
                failed = true;
            }

            // Test 3.7: Logout
            console.log(`\n[3.7] اختبار تسجيل الخروج (Logout)...`);
            const logoutRes = await request('POST', '/api/auth/logout', authHeaders);
            if (logoutRes.statusCode === 200) {
                console.log(`  ${GREEN}✅ نجح: تم تسجيل الخروج بنجاح وتدمير الجلسة (الحالة: 200 OK).${RESET}`);
            } else {
                console.log(`  ${RED}❌ فشل: رمز استجابة غير متوقع لتسجيل الخروج (الحالة: ${logoutRes.statusCode})${RESET}`);
                failed = true;
            }
        }

        // Test 3.8: Rate Limit check
        console.log(`\n[3.8] اختبار محدد الطلبات (Rate Limiting)...`);
        console.log("  إرسال 25 طلباً متتالياً لتجاوز حد المحاولات المسموح بها (20 محاولة)...");
        let rateLimited = false;
        for (let i = 1; i <= 25; i++) {
            const r = await request('POST', '/api/auth/login', {}, { username: E2E_TEST_USERNAME, password: 'bad' });
            if (r.statusCode === 429) {
                console.log(`  ${GREEN}✅ نجح: تم تفعيل محدد الطلبات والحظر برمز 429 Too Many Requests (عند الطلب رقم ${i}).${RESET}`);
                rateLimited = true;
                break;
            }
        }
        if (!rateLimited) {
            console.log(`  ${RED}❌ فشل: لم يتم تفعيل محدد الطلبات ولم نحصل على رمز 429!${RESET}`);
            failed = true;
        }

    } catch (error) {
        console.error(`\n${RED}⛔ حدث خطأ أثناء تنفيذ اختبارات E2E: ${error.message}${RESET}`);
        failed = true;
    } finally {
        // Clean up spawned server
        if (serverProcess) {
            console.log(`\n[4] إيقاف خادم Express الطبي...`);
            serverProcess.kill('SIGINT');
        }

        // Restore original password hash
        if (!E2E_READ_ONLY_MODE && originalHash) {
            console.log(`[5] إعادة تعيين هاش كلمة مرور admin الأصلي في قاعدة البيانات...`);
            await pool.query("UPDATE system_users SET password_hash = $1 WHERE username = $2", [originalHash, E2E_TEST_USERNAME]);
            console.log(`  ${GREEN}✅ تم تنظيف وإرجاع قاعدة البيانات لوضعها الأصلي.${RESET}`);
        }

        await pool.end();
    }

    console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
    if (failed) {
        console.log(`${BOLD}${RED}🔴 نتيجة اختبارات E2E Local: فشل الاختبار!${RESET}`);
        process.exit(1);
    } else {
        console.log(`${BOLD}${GREEN}🟢 نتيجة اختبارات E2E Local: نجاح كافة الفحوصات 100%!${RESET}`);
        process.exit(0);
    }
    console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);
}

runSmokeTests();
