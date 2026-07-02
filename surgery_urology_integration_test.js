/**
 * surgery_urology_integration_test.js — Integration test for General Surgery and Urology clinical modules.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3022;
const TEST_USERNAME = 'surg_uro_doctor';
const TEST_PASSWORD = 'SURG_URO_PASSWORD_PLACEHOLDER';

let serverProcess;

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
    console.log('--- STARTING SURGERY & UROLOGY MODULE INTEGRATION TESTS ---');

    const patientId = 9977;
    const doctorUserId = 9978;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM surgical_checklists WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM surgical_time_logs WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM urodynamic_studies WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, tenant_id) VALUES ($1, $2, $3, 1)',
            [patientId, 'Surg Uro Patient', 'مريض الجراحة والمسالك']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Dr. Surgeon Urologist', 'Doctor', 'General Surgery', '["patients", "prescriptions"]']
        );

        // Associate doctor with tenant 1
        await client.query(
            'INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)',
            [doctorUserId]
        );

        console.log('Spawning test server...');
        serverProcess = spawn('node', ['server.js'], {
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'staging', SKIP_DB_INIT: 'true' },
            stdio: 'pipe'
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`[SERVER] ${data.toString().trim()}`);
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[SERVER ERR] ${data.toString().trim()}`);
        });

        // Wait 6 seconds for server to boot
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('Logging in...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });

        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        console.log('✓ Logged in successfully.');

        // Extract session cookie
        const setCookie = loginRes.headers['set-cookie'];
        assert.ok(setCookie, 'Should receive session cookie');
        const cookie = setCookie[0].split(';')[0];

        // 1. Test POST /api/surgery/checklists
        console.log('Testing create surgical checklist...');
        const checklistRes = await makeRequest('POST', '/api/surgery/checklists', {
            patient_id: patientId,
            procedure_name: 'Laparoscopic Cholecystectomy',
            sign_in_confirmed: true,
            time_out_confirmed: true,
            sign_out_confirmed: false,
            notes: 'Uneventful checklist prep'
        }, { 'Cookie': cookie });

        assert.strictEqual(checklistRes.statusCode, 200, 'Should return 200 OK');
        assert.strictEqual(checklistRes.body.success, true, 'Should return success true');
        assert.ok(checklistRes.body.id, 'Should return record ID');
        const checklistId = checklistRes.body.id;
        console.log(`✓ Surgical checklist created. ID: ${checklistId}`);

        // 2. Test GET /api/surgery/checklists/patient/:patient_id
        console.log('Testing get patient surgical checklists...');
        const getChecklistRes = await makeRequest('GET', `/api/surgery/checklists/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getChecklistRes.statusCode, 200);
        assert.strictEqual(getChecklistRes.body.length, 1);
        assert.strictEqual(getChecklistRes.body[0].id, checklistId);
        assert.strictEqual(getChecklistRes.body[0].sign_in_confirmed, true);
        assert.strictEqual(getChecklistRes.body[0].sign_out_confirmed, false);
        console.log('✓ Patient surgical checklists retrieved.');

        // 3. Test POST /api/surgery/timelogs
        console.log('Testing create surgical time log...');
        const now = new Date().toISOString();
        const timelogRes = await makeRequest('POST', '/api/surgery/timelogs', {
            patient_id: patientId,
            procedure_name: 'Laparoscopic Cholecystectomy',
            anesthesia_start_time: now,
            incision_time: now,
            closure_time: null,
            anesthesia_end_time: null
        }, { 'Cookie': cookie });

        assert.strictEqual(timelogRes.statusCode, 200);
        assert.ok(timelogRes.body.id);
        const timelogId = timelogRes.body.id;
        console.log(`✓ Surgical time log created. ID: ${timelogId}`);

        // 4. Test GET /api/surgery/timelogs/patient/:patient_id
        console.log('Testing get patient surgical time logs...');
        const getTimelogRes = await makeRequest('GET', `/api/surgery/timelogs/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getTimelogRes.statusCode, 200);
        assert.strictEqual(getTimelogRes.body.length, 1);
        assert.strictEqual(getTimelogRes.body[0].id, timelogId);
        console.log('✓ Patient surgical time logs retrieved.');

        // 5. Test POST /api/urology/urodynamics
        console.log('Testing create urodynamic study...');
        const uroRes = await makeRequest('POST', '/api/urology/urodynamics', {
            patient_id: patientId,
            max_flow_rate: 12.5,
            voided_volume: 300,
            post_void_residual: 65,
            detrusor_pressure: 45,
            interpretation: 'Bladder Outlet Obstruction suspected'
        }, { 'Cookie': cookie });

        assert.strictEqual(uroRes.statusCode, 200);
        assert.ok(uroRes.body.id);
        const uroId = uroRes.body.id;
        console.log(`✓ Urodynamic study created. ID: ${uroId}`);

        // 6. Test GET /api/urology/urodynamics/patient/:patient_id
        console.log('Testing get patient urodynamic studies...');
        const getUroRes = await makeRequest('GET', `/api/urology/urodynamics/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getUroRes.statusCode, 200);
        assert.strictEqual(getUroRes.body.length, 1);
        assert.strictEqual(getUroRes.body[0].id, uroId);
        assert.strictEqual(parseFloat(getUroRes.body[0].max_flow_rate), 12.5);
        assert.strictEqual(parseFloat(getUroRes.body[0].post_void_residual), 65);
        console.log('✓ Patient urodynamic studies retrieved.');

    } finally {
        console.log('Cleaning up test data...');
        await client.query("SET app.tenant_id = '1'");
        await client.query('DELETE FROM surgical_checklists WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM surgical_time_logs WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM urodynamic_studies WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);
        client.release();

        if (serverProcess) {
            console.log('Killing test server...');
            serverProcess.kill();
        }
    }

    console.log('✅ General Surgery and Urology Module Integration Tests passed successfully!\n');
}

if (require.main === module) {
    runTests().catch(async err => {
        console.error('❌ Test failed:', err);
        // Wait 3 seconds for server logs to flush
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (serverProcess) serverProcess.kill();
        process.exit(1);
    });
}

module.exports = { runTests };
