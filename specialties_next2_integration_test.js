/**
 * specialties_next2_integration_test.js — Integration test for G21, G24, and G25 clinical modules.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3024;
const TEST_USERNAME = 'spec_next2_doctor';
const TEST_PASSWORD = 'SPEC_NEXT2_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING G21, G24, & G25 MODULE INTEGRATION TESTS ---');

    const patientId = 9977;
    const doctorUserId = 9978;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM obgyn_pregnancies WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM psychiatric_evaluations WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM dermatology_lesions WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, tenant_id) VALUES ($1, $2, $3, 1)',
            [patientId, 'Spec Next2 Patient', 'مريض التخصصات الجديدة 2']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Dr. Specialist OBGYN', 'Doctor', 'OBGYN', '["patients", "prescriptions"]']
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

        // 1. Test POST /api/obgyn/pregnancies
        console.log('Testing create OBGYN pregnancy record...');
        const obgynRes = await makeRequest('POST', '/api/obgyn/pregnancies', {
            patient_id: patientId,
            gravida: 2,
            para: 1,
            abortions: 0,
            living: 1,
            lmp_date: '2026-01-01',
            gestational_weeks: 25,
            notes: 'Uneventful pregnancy'
        }, { 'Cookie': cookie });

        assert.strictEqual(obgynRes.statusCode, 200, 'Should return 200 OK');
        assert.strictEqual(obgynRes.body.success, true);
        assert.ok(obgynRes.body.id);
        const pregId = obgynRes.body.id;
        console.log(`✓ Pregnancy record created. ID: ${pregId}`);

        // 2. Test GET /api/obgyn/pregnancies/patient/:patient_id
        console.log('Testing get patient pregnancy records...');
        const getObgynRes = await makeRequest('GET', `/api/obgyn/pregnancies/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getObgynRes.statusCode, 200);
        assert.strictEqual(getObgynRes.body.length, 1);
        assert.strictEqual(getObgynRes.body[0].id, pregId);
        assert.strictEqual(getObgynRes.body[0].gravida, 2);
        assert.strictEqual(getObgynRes.body[0].gestational_weeks, 25); // (June 30 - Jan 1) / 7
        console.log('✓ Patient pregnancy records retrieved.');

        // 3. Test POST /api/psychiatry/evaluations
        console.log('Testing create psychiatric evaluation...');
        const psychRes = await makeRequest('POST', '/api/psychiatry/evaluations', {
            patient_id: patientId,
            mse_appearance: 'Neat',
            mse_behavior: 'Cooperative',
            mse_speech: 'Normal',
            mse_mood: 'Euthymic',
            mse_affect: 'Congruent',
            mse_insight: 'Good',
            mse_judgment: 'Intact',
            diagnostic_summary: 'No active mental health issues'
        }, { 'Cookie': cookie });

        assert.strictEqual(psychRes.statusCode, 200);
        assert.ok(psychRes.body.id);
        const psychId = psychRes.body.id;
        console.log(`✓ Psychiatric evaluation created. ID: ${psychId}`);

        // 4. Test GET /api/psychiatry/evaluations/patient/:patient_id
        console.log('Testing get patient psychiatric evaluations...');
        const getPsychRes = await makeRequest('GET', `/api/psychiatry/evaluations/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getPsychRes.statusCode, 200);
        assert.strictEqual(getPsychRes.body.length, 1);
        assert.strictEqual(getPsychRes.body[0].id, psychId);
        assert.strictEqual(getPsychRes.body[0].mse_appearance, 'Neat');
        assert.strictEqual(getPsychRes.body[0].mse_judgment, 'Intact');
        console.log('✓ Patient psychiatric evaluations retrieved.');

        // 5. Test POST /api/dermatology/lesions
        console.log('Testing create dermatology lesion...');
        const dermRes = await makeRequest('POST', '/api/dermatology/lesions', {
            patient_id: patientId,
            body_site: 'Right arm',
            lesion_type: 'Papule',
            color: 'Red',
            size_mm: 3.5,
            distribution: 'Isolated',
            biopsy_taken: true,
            notes: 'Slightly itchy'
        }, { 'Cookie': cookie });

        assert.strictEqual(dermRes.statusCode, 200);
        assert.ok(dermRes.body.id);
        const dermId = dermRes.body.id;
        console.log(`✓ Dermatology lesion created. ID: ${dermId}`);

        // 6. Test GET /api/dermatology/lesions/patient/:patient_id
        console.log('Testing get patient dermatology lesions...');
        const getDermRes = await makeRequest('GET', `/api/dermatology/lesions/patient/${patientId}`, null, { 'Cookie': cookie });
        assert.strictEqual(getDermRes.statusCode, 200);
        assert.strictEqual(getDermRes.body.length, 1);
        assert.strictEqual(getDermRes.body[0].id, dermId);
        assert.strictEqual(getDermRes.body[0].body_site, 'Right arm');
        assert.strictEqual(parseFloat(getDermRes.body[0].size_mm), 3.5);
        assert.strictEqual(getDermRes.body[0].biopsy_taken, true);
        console.log('✓ Patient dermatology lesions retrieved.');

    } finally {
        console.log('Cleaning up test data...');
        await client.query("SET app.tenant_id = '1'");
        await client.query('DELETE FROM obgyn_pregnancies WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM psychiatric_evaluations WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM dermatology_lesions WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);
        client.release();

        if (serverProcess) {
            console.log('Killing test server...');
            serverProcess.kill();
        }
    }

    console.log('✅ G21, G24, & G25 Module Integration Tests passed successfully!\n');
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
