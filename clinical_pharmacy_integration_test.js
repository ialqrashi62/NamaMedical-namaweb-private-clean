/**
 * clinical_pharmacy_integration_test.js
 * Integration test for Phase E6 Clinical Pharmacy Integration:
 * - Seeding drug-drug interactions and verifying global retrieval
 * - Creating, retrieving, and resolving clinical reviews with tenant isolation
 * - Logging and retrieving patient drug education counseling sessions
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3014;
const TEST_USERNAME = 'clinical_pharmacist';
const TEST_PASSWORD = 'PHARM_PASS_123';

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
    console.log('--- STARTING CLINICAL PHARMACY INTEGRATION TESTS ---');

    const patientId = 9870;
    const pharmacistUserId = 9871;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up pre-existing test data
        await client.query('DELETE FROM clinical_pharmacy_reviews WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patient_drug_education WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [pharmacistUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [pharmacistUserId]);

        // Insert test patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'Pharmacy Test Patient', 'مريض اختبار الصيدلية السريرية', '+966555555512']
        );

        // Insert pharmacist user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [pharmacistUserId, TEST_USERNAME, hashedPassword, 'Clinical Pharmacist', 'pharmacist', 'Clinical Pharmacy', '["patients","pharmacy"]']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [pharmacistUserId]);

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
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // Log in
        console.log('Logging in clinical pharmacist...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
        const authHeaders = { 'Cookie': cookie };

        // Test 1: GET /api/clinical-pharmacy/interactions
        console.log('Testing GET interactions catalog...');
        const interactionsRes = await makeRequest('GET', '/api/clinical-pharmacy/interactions', null, authHeaders);
        assert.strictEqual(interactionsRes.statusCode, 200, 'Should return 200 OK');
        assert(Array.isArray(interactionsRes.body), 'Should return an array');
        assert(interactionsRes.body.length >= 8, 'Should return seeded drug interactions');
        console.log(`✓ Retrieved ${interactionsRes.body.length} drug interactions successfully.`);

        // Test 2: POST /api/clinical-pharmacy/reviews
        console.log('Testing Create Clinical Pharmacy Review...');
        const reviewRes = await makeRequest('POST', '/api/clinical-pharmacy/reviews', {
            patient_id: patientId,
            patient_name: 'Pharmacy Test Patient',
            prescription_id: 101,
            review_type: 'Drug-Drug Interaction',
            findings: 'Aspirin + Warfarin risk detected.',
            recommendations: 'Monitor INR or substitute Aspirin.',
            interventions: 'Discussed with physician, changed Aspirin to Paracetamol.',
            severity: 'High'
        }, authHeaders);
        assert.strictEqual(reviewRes.statusCode, 200, 'Should create review successfully');
        assert.strictEqual(reviewRes.body.patient_id, patientId);
        assert.strictEqual(reviewRes.body.severity, 'High');
        assert.strictEqual(reviewRes.body.status, 'Open');
        const reviewId = reviewRes.body.id;
        console.log('✓ Clinical Review created successfully.');

        // Test 3: GET /api/clinical-pharmacy/reviews
        console.log('Testing List Clinical Pharmacy Reviews...');
        const listRes = await makeRequest('GET', '/api/clinical-pharmacy/reviews', null, authHeaders);
        assert.strictEqual(listRes.statusCode, 200, 'Should retrieve reviews list');
        assert(listRes.body.some(r => r.id === reviewId), 'Reviews list should contain created review');
        console.log('✓ Clinical Reviews listed successfully.');

        // Test 4: PUT /api/clinical-pharmacy/reviews/:id
        console.log('Testing Resolve Clinical Pharmacy Review...');
        const resolveRes = await makeRequest('PUT', `/api/clinical-pharmacy/reviews/${reviewId}`, {
            outcome: 'Resolved',
            status: 'Closed'
        }, authHeaders);
        assert.strictEqual(resolveRes.statusCode, 200, 'Should resolve review successfully');
        
        // Double check status is now updated in DB
        const checkRes = await pool.query('SELECT status, outcome FROM clinical_pharmacy_reviews WHERE id=$1', [reviewId]);
        assert.strictEqual(checkRes.rows[0].status, 'Closed');
        assert.strictEqual(checkRes.rows[0].outcome, 'Resolved');
        console.log('✓ Clinical Review resolved and closed successfully.');

        // Test 5: POST /api/clinical-pharmacy/education
        console.log('Testing Create Patient Drug Education...');
        const eduRes = await makeRequest('POST', '/api/clinical-pharmacy/education', {
            patient_id: patientId,
            patient_name: 'Pharmacy Test Patient',
            medication: 'Warfarin 5mg',
            instructions: 'Take one tablet daily at 6 PM.',
            side_effects: 'Bleeding, bruising.',
            precautions: 'Avoid sudden dietary changes in vitamin K foods.'
        }, authHeaders);
        assert.strictEqual(eduRes.statusCode, 200, 'Should log education session successfully');
        assert.strictEqual(eduRes.body.medication, 'Warfarin 5mg');
        const eduId = eduRes.body.id;
        console.log('✓ Patient Drug Education logged successfully.');

        // Test 6: GET /api/clinical-pharmacy/education
        console.log('Testing List Patient Drug Educations...');
        const listEduRes = await makeRequest('GET', '/api/clinical-pharmacy/education', null, authHeaders);
        assert.strictEqual(listEduRes.statusCode, 200, 'Should retrieve education logs');
        assert(listEduRes.body.some(e => e.id === eduId), 'List should contain created log');
        console.log('✓ Patient Drug Education listed successfully.');

        console.log('--- ALL CLINICAL PHARMACY TESTS PASSED SUCCESSFULLY! ---');
    } catch (err) {
        console.error('Test assertion failed:', err);
        process.exitCode = 1;
    } finally {
        // Clean up test database records
        const cleanupClient = await pool.connect();
        try {
            await cleanupClient.query("SET app.tenant_id = '1'");
            await cleanupClient.query('DELETE FROM clinical_pharmacy_reviews WHERE patient_id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM patient_drug_education WHERE patient_id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM patients WHERE id = $1', [patientId]);
            await cleanupClient.query('DELETE FROM user_tenants WHERE user_id = $1', [pharmacistUserId]);
            await cleanupClient.query('DELETE FROM system_users WHERE id = $1', [pharmacistUserId]);
            console.log('✓ Test database records cleaned up successfully.');
        } catch (cleanupErr) {
            console.error('Error during cleanup:', cleanupErr);
        } finally {
            cleanupClient.release();
        }

        // Stop the server
        if (server) {
            server.kill();
        }
    }
}

runTests();
