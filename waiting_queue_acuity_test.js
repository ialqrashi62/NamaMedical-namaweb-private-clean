/**
 * waiting_queue_acuity_test.js
 * Integration test for waiting_queue acuity sorting, status mapping, and triage APIs.
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3012;
const TEST_USERNAME = 'queue_admin';
const TEST_PASSWORD = 'QUEUE_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING WAITING QUEUE ACUITY INTEGRATION TESTS ---');

    const patient1Id = 9901;
    const patient2Id = 9902;
    const adminUserId = 9903;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM waiting_queue WHERE patient_id IN ($1, $2)', [patient1Id, patient2Id]);
        await client.query('DELETE FROM patients WHERE id IN ($1, $2)', [patient1Id, patient2Id]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [adminUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [adminUserId]);

        // Insert patients
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patient1Id, 'Acuity Patient A', 'مريض أ', '+966555555501']
        );
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patient2Id, 'Acuity Patient B', 'مريض ب', '+966555555502']
        );

        // Insert admin user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [adminUserId, TEST_USERNAME, hashedPassword, 'Queue Admin', 'Admin', 'General', '["patients", "settings"]']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [adminUserId]);

    } finally {
        client.release();
    }

    // Start server
    server = spawn('node', ['server.js'], {
        env: { ...process.env, PORT: TEST_PORT, SKIP_DB_INIT: '1' }
    });

    server.stderr.on('data', (data) => {
        console.error('SERVER ERR:', data.toString());
    });

    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // 1. Login to get session
        const loginRes = await makeRequest('POST', '/api/auth/login', { username: TEST_USERNAME, password: TEST_PASSWORD });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0];

        // 2. Check-in Patient A (default triage 5)
        const checkinARes = await makeRequest('POST', '/api/queue/checkin', {
            patient_id: patient1Id,
            doctor: 'Dr. Sameer',
            department: 'General Medicine',
            triage_level: 5,
            exam_room_id: 'Room-101',
            acuity_notes: 'Cold symptoms'
        }, { Cookie: cookie });
        assert.strictEqual(checkinARes.statusCode, 201, 'Patient A check-in should succeed');
        assert.strictEqual(checkinARes.body.patient_name, 'مريض أ', 'Patient A name matches');

        // 3. Check-in Patient B (higher priority triage 2)
        const checkinBRes = await makeRequest('POST', '/api/queue/checkin', {
            patient_id: patient2Id,
            doctor: 'Dr. Sameer',
            department: 'General Medicine',
            triage_level: 2,
            exam_room_id: 'Room-102',
            acuity_notes: 'Chest pain'
        }, { Cookie: cookie });
        assert.strictEqual(checkinBRes.statusCode, 201, 'Patient B check-in should succeed');

        // 4. Retrieve queue and verify sorting (Patient B triage_level 2 must be before Patient A triage_level 5)
        const queueRes = await makeRequest('GET', '/api/queue/patients', null, { Cookie: cookie });
        assert.strictEqual(queueRes.statusCode, 200, 'Fetching queue should succeed');
        assert.ok(Array.isArray(queueRes.body), 'Queue response should be an array');
        
        // Find index of Patient A and Patient B in the retrieved array
        const indexA = queueRes.body.findIndex(p => p.patient_id === patient1Id);
        const indexB = queueRes.body.findIndex(p => p.patient_id === patient2Id);
        
        assert.ok(indexA !== -1, 'Patient A should be in the queue');
        assert.ok(indexB !== -1, 'Patient B should be in the queue');
        assert.ok(indexB < indexA, 'Patient B (ESI-2) must be prioritized before Patient A (ESI-5)');

        // 5. Test triage update API
        const triageRes = await makeRequest('PUT', `/api/queue/patients/${checkinARes.body.id}/triage`, {
            triage_level: 1,
            acuity_notes: 'Condition deteriorated - cardiac arrest'
        }, { Cookie: cookie });
        assert.strictEqual(triageRes.statusCode, 200, 'Updating triage should succeed');
        assert.strictEqual(triageRes.body.triage_level, 1, 'Triage level updated correctly');

        // 6. Test status update API
        const statusRes = await makeRequest('PUT', `/api/queue/patients/${checkinARes.body.id}/status`, {
            status: 'InConsultation'
        }, { Cookie: cookie });
        assert.strictEqual(statusRes.statusCode, 200, 'Updating status should succeed');
        assert.strictEqual(statusRes.body.status, 'InConsultation', 'Status updated correctly');

        // 7. Test patient calling API
        const callRes = await makeRequest('PUT', `/api/queue/patients/${checkinARes.body.id}/call`, null, { Cookie: cookie });
        assert.strictEqual(callRes.statusCode, 200, 'Calling patient should succeed');
        assert.strictEqual(callRes.body.success, true, 'Call broadcast successful');

        console.log('✅ ALL WAITING QUEUE ACUITY INTEGRATION TESTS PASSED!');
    } catch (e) {
        console.error('❌ TEST FAILED:', e.message);
        process.exitCode = 1;
    } finally {
        // Cleanup database
        const cleanupClient = await pool.connect();
        try {
            await cleanupClient.query("SET app.tenant_id = '1'");
            await cleanupClient.query('DELETE FROM waiting_queue WHERE patient_id IN ($1, $2)', [patient1Id, patient2Id]);
            await cleanupClient.query('DELETE FROM patients WHERE id IN ($1, $2)', [patient1Id, patient2Id]);
            await cleanupClient.query('DELETE FROM user_tenants WHERE user_id = $1', [adminUserId]);
            await client.query('DELETE FROM system_users WHERE id = $1', [adminUserId]);
        } catch(e) {}
        cleanupClient.release();

        // Stop server
        if (server) {
            server.kill();
        }
    }
}

runTests();
