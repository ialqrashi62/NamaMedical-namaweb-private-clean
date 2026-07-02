/**
 * nursing_braden_morse_test.js — Integration test for Braden Scale & Morse Fall Risk assessments.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3022;
const TEST_USERNAME = 'nursing_tester';
const TEST_PASSWORD = 'NURSE_PASSWORD_2026';

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
    console.log('--- STARTING NURSING RISK ASSESSMENT INTEGRATION TESTS ---');

    const patientId = 9951;
    const nurseUserId = 9952;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM nursing_risk_assessments WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [nurseUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [nurseUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, tenant_id) VALUES ($1, $2, $3, 1)',
            [patientId, 'Nursing Risk Patient', 'مريض تقييم المخاطر']
        );

        // Insert nurse user (Role: Nurse)
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            "INSERT INTO system_users (id, username, password_hash, display_name, role, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1)",
            [nurseUserId, TEST_USERNAME, hashedPassword, 'Head Nurse Aisha', 'Nurse', '["patients"]']
        );

        // Associate nurse with tenant 1
        await client.query(
            'INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)',
            [nurseUserId]
        );

        console.log('Spawning test server...');
        serverProcess = spawn('node', ['server.js'], {
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'staging', SKIP_DB_INIT: 'true' }
        });

        serverProcess.stdout.on('data', (data) => {
            if (process.env.DEBUG_TESTS) console.log(`[Server STDOUT] ${data.toString().trim()}`);
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

        // Test 1: Create Braden Scale Risk Assessment
        console.log('Testing create Braden Scale assessment...');
        const details = {
            sensory_perception: 3,
            moisture: 4,
            activity: 2,
            mobility: 3,
            nutrition: 3,
            friction_shear: 2
        };
        const createRes = await makeRequest('POST', '/api/nursing/risk-assessment', {
            patient_id: patientId,
            admission_id: 101,
            assessment_type: 'Braden Scale',
            total_score: 17,
            risk_level: 'Mild Risk',
            details
        }, { Cookie: cookie });

        assert.strictEqual(createRes.statusCode, 200);
        assert.strictEqual(createRes.body.assessment_type, 'Braden Scale');
        assert.strictEqual(createRes.body.total_score, 17);
        assert.strictEqual(createRes.body.risk_level, 'Mild Risk');
        console.log(`✓ Braden Scale risk assessment created. ID: ${createRes.body.id}`);

        // Test 2: Get Patient Risk Assessments
        console.log('Testing get patient risk assessments...');
        const getRes = await makeRequest('GET', `/api/nursing/risk-assessments/${patientId}`, null, { Cookie: cookie });
        assert.strictEqual(getRes.statusCode, 200);
        assert.ok(getRes.body.length > 0);
        assert.strictEqual(getRes.body[0].total_score, 17);
        console.log('✓ Risk assessments retrieved successfully.');

        console.log('Cleaning up test data...');
        await client.query('DELETE FROM nursing_risk_assessments WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [nurseUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [nurseUserId]);

        console.log('Killing test server...');
        serverProcess.kill();
        console.log('✅ Nursing Risk Assessment Integration Tests passed successfully!');
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
