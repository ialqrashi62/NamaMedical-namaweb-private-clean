/**
 * pediatric_apgar_test.js — Integration test for the Neonatal Apgar Scores API.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3026;
const TEST_USERNAME = 'ped_tester';
const TEST_PASSWORD = 'PED_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING NEONATAL APGAR SCORES INTEGRATION TESTS ---');

    const babyId = 9941;
    const motherId = 9942;
    const staffUserId = 9943;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM neonatal_apgar_scores WHERE patient_id = $1', [babyId]);
        await client.query('DELETE FROM patients WHERE id IN ($1, $2)', [babyId, motherId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [staffUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [staffUserId]);

        // Insert mother patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, tenant_id) VALUES ($1, $2, $3, 1)',
            [motherId, 'Mother Patient', 'الأم المريضة']
        );

        // Insert baby patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, tenant_id) VALUES ($1, $2, $3, 1)',
            [babyId, 'Newborn Baby', 'المولود الجديد']
        );

        // Insert pediatric user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            "INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)",
            [staffUserId, TEST_USERNAME, hashedPassword, 'Dr. Samir Pediatrician', 'Doctor', 'Pediatrics', '["patients"]']
        );

        // Associate user with tenant 1
        await client.query(
            'INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)',
            [staffUserId]
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

        // Test 1: Create Apgar Score
        console.log('Testing create neonatal Apgar score...');
        const details = {
            appearance: 2,
            pulse: 2,
            grimace: 1,
            activity: 2,
            respiration: 2
        };
        const createRes = await makeRequest('POST', '/api/pediatrics/apgar', {
            patient_id: babyId,
            mother_id: motherId,
            apgar_1min: 7,
            apgar_5min: 9,
            apgar_10min: 9,
            details,
            notes: 'Baby is crying well. Good response.'
        }, { Cookie: cookie });

        assert.strictEqual(createRes.statusCode, 200);
        assert.strictEqual(createRes.body.patient_id, babyId);
        assert.strictEqual(createRes.body.mother_id, motherId);
        assert.strictEqual(createRes.body.apgar_1min, 7);
        assert.strictEqual(createRes.body.apgar_5min, 9);
        console.log(`✓ Neonatal Apgar score created successfully. ID: ${createRes.body.id}`);

        // Test 2: Get Patient Apgar Scores
        console.log('Testing get neonatal Apgar scores...');
        const getRes = await makeRequest('GET', `/api/pediatrics/apgar/${babyId}`, null, { Cookie: cookie });
        assert.strictEqual(getRes.statusCode, 200);
        assert.strictEqual(getRes.body.length, 1);
        assert.strictEqual(getRes.body[0].apgar_1min, 7);
        console.log('✓ Apgar scores list retrieved successfully.');

        console.log('Cleaning up test data...');
        await client.query('DELETE FROM neonatal_apgar_scores WHERE patient_id = $1', [babyId]);
        await client.query('DELETE FROM patients WHERE id IN ($1, $2)', [babyId, motherId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [staffUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [staffUserId]);

        console.log('Killing test server...');
        serverProcess.kill();
        console.log('✅ Neonatal Apgar Scores Integration Tests passed successfully!');
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
