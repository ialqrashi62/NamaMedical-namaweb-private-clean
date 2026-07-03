/**
 * icu_bundles_f3_test.js
 * Integration test for Phase F3 ICU Prevention Bundles & Infection Control:
 * - Recording daily VAP bundle with 100% compliance
 * - Blocking daily CLABSI bundle with < 100% compliance and no reason
 * - Accepting daily CLABSI bundle with < 100% compliance and override reason
 * - Retrieving prevention bundle logs
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3014;
const TEST_USERNAME = 'icu_infection_nurse';
const TEST_PASSWORD = 'ICU_' + 'INFS_' + 'PASSWORD';

let server;

function makeRequest(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = http.request({
            hostname: 'localhost',
            port: TEST_PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: data });
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('--- STARTING ICU PREVENTION BUNDLES F3 INTEGRATION TESTS ---');

    const patientId = 9993;
    const doctorUserId = 9994;
    const admissionId = 9995;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM icu_prevention_bundles WHERE admission_id = $1', [admissionId]);
        await client.query('DELETE FROM admissions WHERE id = $1', [admissionId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'ICU Patient', 'مريض العناية المركزة', '+966555555559']
        );

        // Insert doctor user with roles: 'icu' and 'nursing'
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            `INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) 
             VALUES ($1, $2, $3, $4, 'Nurse', 'ICU', '["icu", "nursing"]', 1)`,
            [doctorUserId, TEST_USERNAME, hashedPassword, 'ICU Infection Nurse']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [doctorUserId]);

        // Insert admission
        await client.query(
            `INSERT INTO admissions (id, tenant_id, patient_id, status, department) 
             VALUES ($1, 1, $2, 'Active', 'ICU')`,
            [admissionId, patientId]
        );

    } finally {
        client.release();
    }

    // Start local server
    server = spawn('node', ['server.js'], {
        env: { ...process.env, PORT: TEST_PORT, SKIP_DB_INIT: '1' }
    });

    server.stdout.on('data', (data) => {
        // console.log('SERVER OUT:', data.toString().trim());
    });

    server.stderr.on('data', (data) => {
        // console.error('SERVER ERR:', data.toString().trim());
    });

    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 6000));

    try {
        // Log in
        console.log('Logging in ICU infection nurse...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
        const authHeaders = { 'Cookie': cookie };

        // Test 1: Save VAP bundle checklist with 100% compliance
        console.log('Testing Save VAP Bundle 100% Compliance...');
        const vapRes = await makeRequest('POST', '/api/icu/prevention-bundles', {
            admission_id: admissionId,
            bundle_type: 'VAP',
            audit_date: '2026-07-03',
            checked_items: {
                head_of_bed_elevation: true,
                sedation_interruption: true,
                pud_prophylaxis: true,
                dvt_prophylaxis: true,
                oral_care: true
            }
        }, authHeaders);
        assert.strictEqual(vapRes.statusCode, 201, 'Should return 201 Created');
        assert.strictEqual(parseFloat(vapRes.body.compliance_rate), 100.00, 'Compliance should be 100%');
        console.log('✓ VAP bundle recorded successfully.');

        // Test 2: Try to save CLABSI bundle with < 100% compliance and NO reason (should block)
        console.log('Testing Save CLABSI Bundle < 100% Compliance with NO reason (should block)...');
        const clabsiFailRes = await makeRequest('POST', '/api/icu/prevention-bundles', {
            admission_id: admissionId,
            bundle_type: 'CLABSI',
            audit_date: '2026-07-03',
            checked_items: {
                hand_hygiene: true,
                sterile_barrier: true,
                skin_antisepsis: true,
                site_selection: false, // Non-compliant site
                daily_review: true
            }
        }, authHeaders);
        assert.strictEqual(clabsiFailRes.statusCode, 422, 'Should return 422 Unprocessable Entity');
        assert.ok(clabsiFailRes.body.error.includes('non_compliance_reason is required'), 'Should report missing reason');
        console.log('✓ Blocked CLABSI non-compliant audit successfully.');

        // Test 3: Save CLABSI bundle with < 100% compliance AND override reason
        console.log('Testing Save CLABSI Bundle < 100% Compliance with override reason...');
        const clabsiPassRes = await makeRequest('POST', '/api/icu/prevention-bundles', {
            admission_id: admissionId,
            bundle_type: 'CLABSI',
            audit_date: '2026-07-03',
            checked_items: {
                hand_hygiene: true,
                sterile_barrier: true,
                skin_antisepsis: true,
                site_selection: false, // Non-compliant site
                daily_review: true
            },
            non_compliance_reason: 'Femoral line placed in emergency, scheduled for replacement within 24 hours.'
        }, authHeaders);
        assert.strictEqual(clabsiPassRes.statusCode, 201, 'Should succeed with 201 Created');
        assert.strictEqual(parseFloat(clabsiPassRes.body.compliance_rate), 80.00, 'Compliance should be 80%');
        assert.strictEqual(clabsiPassRes.body.non_compliance_reason, 'Femoral line placed in emergency, scheduled for replacement within 24 hours.');
        console.log('✓ Recorded non-compliant CLABSI audit with reason successfully.');

        // Test 4: Retrieve daily bundles for the admission
        console.log('Testing Get ICU Prevention Bundles...');
        const getRes = await makeRequest('GET', `/api/icu/prevention-bundles?admission_id=${admissionId}`, {}, authHeaders);
        assert.strictEqual(getRes.statusCode, 200, 'Should return 200 OK');
        assert.ok(Array.isArray(getRes.body));
        assert.strictEqual(getRes.body.length, 2, 'Should contain 2 records');
        console.log('✓ Retrieved daily bundles list successfully.');

        console.log('✅ All ICU Prevention Bundles F3 Integration Tests passed successfully!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exitCode = 1;
    } finally {
        // Clean up
        server.kill();
        const cleanClient = await pool.connect();
        try {
            await cleanClient.query("SET app.tenant_id = '1'");
            await cleanClient.query('DELETE FROM icu_prevention_bundles WHERE admission_id = $1', [admissionId]);
            await cleanClient.query('DELETE FROM admissions WHERE id = $1', [admissionId]);
            await cleanClient.query('DELETE FROM patients WHERE id = $1', [patientId]);
            await cleanClient.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
            await cleanClient.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);
        } finally {
            cleanClient.release();
        }
        await pool.end();
        console.log('✓ Cleanup complete');
    }
}

runTests();
