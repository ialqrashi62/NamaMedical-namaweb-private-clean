/**
 * clinical_dental_rehab_integration_test.js
 * Integration test for Dental records and Rehabilitation assessments endpoints.
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3012;
const TEST_USERNAME = 'dental_rehab_doc';
const TEST_PASSWORD = Buffer.from('VEVTVF9ET0NfUEFTU1dPUkQ=', 'base64').toString('utf8');

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
    console.log('--- STARTING DENTAL & REHAB INTEGRATION TESTS ---');

    const patientId = 9993;
    const doctorUserId = 9994;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM dental_records WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM rehab_assessments WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'Dental Rehab Patient', 'مريض أسنان وتأهيل', '+966555555557']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Dental Doctor', 'Doctor', 'Dentistry', '["patients","prescriptions"]', 1]
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
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
        // 1. Log in
        console.log('Logging in...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0];

        // 2. Add Dental Record
        console.log('Adding dental record...');
        const dentalPostRes = await makeRequest('POST', '/api/dental/records', {
            patient_id: patientId,
            tooth_number: 14,
            condition: 'Caries',
            treatment_done: 'Composite Filling'
        }, { 'Cookie': cookie });
        assert.strictEqual(dentalPostRes.statusCode, 200, 'Dental POST should succeed');
        assert.strictEqual(dentalPostRes.body.tooth_number, 14, 'Tooth number should match');

        // 3. Get Dental Record
        console.log('Retrieving dental records...');
        const dentalGetRes = await makeRequest('GET', `/api/dental/records/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(dentalGetRes.statusCode, 200, 'Dental GET should succeed');
        assert.ok(Array.isArray(dentalGetRes.body), 'Should return an array');
        assert.ok(dentalGetRes.body.length > 0, 'Array should not be empty');
        assert.strictEqual(dentalGetRes.body[0].condition, 'Caries', 'Condition should be Caries');

        // 4. Add Rehab Assessment
        console.log('Adding rehab assessment...');
        const rehabPostRes = await makeRequest('POST', '/api/rehab/assessments', {
            rehab_patient_id: 1,
            patient_id: patientId,
            assessment_type: 'Initial Evaluation',
            rom_scores: 'Shoulder Flexion: 120',
            strength_scores: 'Quadriceps: 4/5',
            functional_scores: 'Independent Ambulation',
            balance_scores: 'Berg Balance: 48/56',
            pain_level: 4,
            assessor: 'Specialty Doctor'
        }, { 'Cookie': cookie });
        assert.strictEqual(rehabPostRes.statusCode, 200, 'Rehab Assessment POST should succeed');
        assert.strictEqual(rehabPostRes.body.pain_level, 4, 'Pain level should match');

        // 5. Get Rehab Assessments
        console.log('Retrieving rehab assessments...');
        const rehabGetRes = await makeRequest('GET', `/api/rehab/assessments?patient_id=${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(rehabGetRes.statusCode, 200, 'Rehab Assessment GET should succeed');
        assert.ok(Array.isArray(rehabGetRes.body), 'Should return an array');
        assert.ok(rehabGetRes.body.length > 0, 'Array should not be empty');
        assert.strictEqual(rehabGetRes.body[0].assessment_type, 'Initial Evaluation', 'Assessment type should match');

        console.log('✅ ALL DENTAL & REHAB INTEGRATION TESTS PASSED!');
    } catch (e) {
        console.error('❌ INTEGRATION TEST FAILED:', e);
        process.exit(1);
    } finally {
        // Cleanup DB
        const cleanupClient = await pool.connect();
        try {
            await cleanupClient.query("SET app.tenant_id = '1'");
            await cleanupClient.query('DELETE FROM dental_records WHERE patient_id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM rehab_assessments WHERE patient_id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM patients WHERE id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
            await cleanupClient.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);
        } finally {
            cleanupClient.release();
        }
        server.kill();
        process.exit(0);
    }
}

runTests();
