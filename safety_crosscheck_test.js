/**
 * safety_crosscheck_test.js — Integration test for the Drug-Allergy cross-check safety endpoint.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3020;
const TEST_USERNAME = 'safety_doc';
const TEST_PASSWORD = 'SAFETY_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING DRUG-ALLERGY SAFETY CROSS-CHECK INTEGRATION TESTS ---');

    const patientId = 9961;
    const doctorUserId = 9962;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient with allergy documented in notes
        await client.query(
            "INSERT INTO patients (id, name_en, name_ar, notes, tenant_id) VALUES ($1, $2, $3, 'Allergic to Penicillin and Sulfa drugs', 1)",
            [patientId, 'Allergy Test Patient', 'مريض فحص الحساسية']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            "INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)",
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Dr. Safety Officer', 'Doctor', 'General Medicine', '["patients", "prescriptions"]']
        );

        // Associate doctor with tenant 1
        await client.query(
            'INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)',
            [doctorUserId]
        );

        console.log('Spawning test server...');
        serverProcess = spawn('node', ['server.js'], {
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'staging', SKIP_DB_INIT: 'true' }
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`[Server STDOUT] ${data.toString().trim()}`);
        });
        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server STDERR] ${data.toString().trim()}`);
        });

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('Logging in...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0];

        // Test 1: Conflict expected for Penicillin
        console.log('Testing safety check for allergic drug (Penicillin)...');
        const check1 = await makeRequest('POST', '/api/clinical/safety-check', {
            patient_id: patientId,
            drug_name: 'Penicillin'
        }, { Cookie: cookie });
        
        assert.strictEqual(check1.statusCode, 200, 'Allergy check failed: ' + JSON.stringify(check1.body || check1.rawBody));
        assert.strictEqual(check1.body.alert, true, 'Alert should be true for Penicillin');
        assert.ok(check1.body.message.includes('Potential allergy conflict'), 'Message should contain warning');
        console.log('✓ Penicillin conflict detected successfully.');

        // Test 2: No conflict expected for Aspirin
        console.log('Testing safety check for non-allergic drug (Aspirin)...');
        const check2 = await makeRequest('POST', '/api/clinical/safety-check', {
            patient_id: patientId,
            drug_name: 'Aspirin'
        }, { Cookie: cookie });
        
        assert.strictEqual(check2.statusCode, 200);
        assert.strictEqual(check2.body.alert, false, 'Alert should be false for Aspirin');
        console.log('✓ Aspirin check cleared successfully.');

        console.log('Cleaning up test data...');
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        console.log('Killing test server...');
        serverProcess.kill();
        console.log('✅ Drug-Allergy Safety Cross-Check Integration Tests passed successfully!');
        process.exit(0);

    } catch (e) {
        console.error('❌ Test failed:', e);
        if (serverProcess) serverProcess.kill();
        process.exit(1);
    } finally {
        client.release();
    }
}

runTests();
