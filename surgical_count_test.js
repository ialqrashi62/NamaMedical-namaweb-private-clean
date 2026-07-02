/**
 * surgical_count_test.js — Integration test for the Surgical Count Sheets API.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3024;
const TEST_USERNAME = 'surg_tester';
const TEST_PASSWORD = 'SURG_PASSWORD_2026';

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
    console.log('--- STARTING SURGICAL COUNT SHEETS INTEGRATION TESTS ---');

    const surgeryId = 8871;
    const staffUserId = 8872;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM surgery_count_sheets WHERE surgery_id = $1', [surgeryId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [staffUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [staffUserId]);

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            "INSERT INTO system_users (id, username, password_hash, display_name, role, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1)",
            [staffUserId, TEST_USERNAME, hashedPassword, 'Dr. Sarah Surgeon', 'Doctor', '["patients"]']
        );

        // Associate doctor with tenant 1
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
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('Logging in...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0];

        // Test 1: Create matching count sheet
        console.log('Testing create matching surgical count sheet...');
        const createRes1 = await makeRequest('POST', '/api/surgery/count-sheet', {
            surgery_id: surgeryId,
            sponge_count_initial: 10,
            sponge_count_final: 10,
            needle_count_initial: 15,
            needle_count_final: 15,
            instrument_count_initial: 24,
            instrument_count_final: 24,
            witness1_name: 'Nurse Aisha',
            witness2_name: 'Dr. Sarah',
            notes: 'All items accounted for.'
        }, { Cookie: cookie });

        assert.strictEqual(createRes1.statusCode, 200);
        assert.strictEqual(createRes1.body.counts_match, true, 'Counts should match');
        console.log(`✓ Matching count sheet created successfully. ID: ${createRes1.body.id}`);

        // Test 2: Create mismatching count sheet
        console.log('Testing create mismatching surgical count sheet...');
        const createRes2 = await makeRequest('POST', '/api/surgery/count-sheet', {
            surgery_id: surgeryId,
            sponge_count_initial: 10,
            sponge_count_final: 9, // mismatch
            needle_count_initial: 15,
            needle_count_final: 15,
            instrument_count_initial: 24,
            instrument_count_final: 24,
            witness1_name: 'Nurse Aisha',
            witness2_name: 'Dr. Sarah',
            notes: 'Sponges missing!'
        }, { Cookie: cookie });

        assert.strictEqual(createRes2.statusCode, 200);
        assert.strictEqual(createRes2.body.counts_match, false, 'Counts should mismatch');
        console.log(`✓ Mismatching count sheet created successfully. ID: ${createRes2.body.id}`);

        // Test 3: Get Surgery Count Sheets
        console.log('Testing get surgical count sheets...');
        const getRes = await makeRequest('GET', `/api/surgery/count-sheet/${surgeryId}`, null, { Cookie: cookie });
        assert.strictEqual(getRes.statusCode, 200);
        assert.strictEqual(getRes.body.length, 2);
        console.log('✓ Count sheets list retrieved successfully.');

        console.log('Cleaning up test data...');
        await client.query('DELETE FROM surgery_count_sheets WHERE surgery_id = $1', [surgeryId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [staffUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [staffUserId]);

        console.log('Killing test server...');
        serverProcess.kill();
        console.log('✅ Surgical Count Sheets Integration Tests passed successfully!');
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
