/**
 * clinical_specialties_test.js
 * Integration test for EMR clinical specialties and dynamic templates.
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3011;
const TEST_USERNAME = 'specialty_doctor';
const TEST_PASSWORD = 'DOCTOR_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING CLINICAL SPECIALTIES INTEGRATION TESTS ---');

    const patientId = 9991;
    const doctorUserId = 9992;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM patient_clinical_records WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'EMR Test Patient', 'مريض اختبار السجل', '+966555555556']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Specialty Doctor', 'Doctor', 'Cardiology', '["patients"]']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [doctorUserId]);

    } finally {
        client.release();
    }

    // Start local server
    server = spawn('node', ['server.js'], {
        env: { ...process.env, PORT: TEST_PORT, SKIP_DB_INIT: '1' }
    });

    server.stderr.on('data', (data) => {
        console.error('SERVER ERR:', data.toString());
    });

    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 6000));

    try {
        // Log in
        console.log('Logging in...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
        const authHeaders = { 'Cookie': cookie };

        // 1. Fetch departments
        console.log('Fetching clinical departments...');
        const deptsRes = await makeRequest('GET', '/api/clinical/departments', {}, authHeaders);
        assert.strictEqual(deptsRes.statusCode, 200);
        assert.ok(Array.isArray(deptsRes.body), 'Should return an array of departments');
        const hasCardiology = deptsRes.body.some(d => d.code === 'CARDIOLOGY');
        assert.ok(hasCardiology, 'Should contain CARDIOLOGY department');
        console.log('✓ Clinical departments retrieved successfully.');

        // Get cardiology department ID from response
        const cardDept = deptsRes.body.find(d => d.code === 'CARDIOLOGY');
        const cardDeptId = cardDept.id;

        // 2. Fetch templates for Cardiology
        console.log('Fetching templates for Cardiology...');
        const templatesRes = await makeRequest('GET', `/api/clinical/templates/${cardDeptId}`, {}, authHeaders);
        assert.strictEqual(templatesRes.statusCode, 200);
        assert.ok(Array.isArray(templatesRes.body), 'Should return templates array');
        assert.ok(templatesRes.body.length > 0, 'Should have at least one template');
        const template = templatesRes.body[0];
        assert.ok(template.form_structure.fields, 'Template should have form structure fields');
        console.log('✓ Cardiology clinical templates retrieved successfully.');

        // 3. Save a patient clinical record (EMR) with dynamic values
        console.log('Saving patient clinical record...');
        const recordRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: template.id,
            recorded_values: {
                chest_pain: 'Typical Angina',
                bp_systolic: 130,
                bp_diastolic: 85,
                ecg_finding: 'ST elevation in V1-V3',
                ejec_fraction: 45
            }
        }, authHeaders);
        assert.strictEqual(recordRes.statusCode, 201, 'Record saving should succeed');
        assert.ok(recordRes.body.id, 'Should return the saved record ID');
        const recordId = recordRes.body.id;
        console.log('✓ Patient clinical record saved successfully.');

        // Verify database state
        const dbRecord = (await pool.query('SELECT * FROM patient_clinical_records WHERE id = $1', [recordId])).rows[0];
        assert.strictEqual(dbRecord.recorded_values.chest_pain, 'Typical Angina');
        assert.strictEqual(dbRecord.recorded_values.bp_systolic, 130);
        assert.strictEqual(dbRecord.is_locked, false, 'Record should initially be unlocked');

        // 4. Lock and sign the EMR record
        console.log('Locking and signing EMR record...');
        const lockRes = await makeRequest('POST', `/api/clinical/records/${recordId}/lock`, {}, authHeaders);
        assert.strictEqual(lockRes.statusCode, 200, 'Record locking should succeed');
        assert.ok(lockRes.body.signature, 'Should return a digital signature');
        console.log('✓ EMR record successfully locked and signed.');

        // Verify locked state in database
        const dbLockedRecord = (await pool.query('SELECT is_locked, signature FROM patient_clinical_records WHERE id = $1', [recordId])).rows[0];
        assert.strictEqual(dbLockedRecord.is_locked, true, 'Record should now be locked');
        assert.ok(dbLockedRecord.signature, 'Record signature should be populated');

        console.log('✅ All Clinical Specialties EMR Integration Tests passed successfully!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exitCode = 1;
    } finally {
        // Clean up
        server.kill();
        const cleanClient = await pool.connect();
        try {
            await cleanClient.query("SET app.tenant_id = '1'");
            await cleanClient.query('DELETE FROM patient_clinical_records WHERE patient_id = $1', [patientId]);
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
