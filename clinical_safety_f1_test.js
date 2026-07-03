/**
 * clinical_safety_f1_test.js
 * Integration test for Phase F1 clinical safety features:
 * - Surgical Count Sheet mismatches and overrides
 * - Braden Scale assessment and High Risk flag calculation
 * - Morse Fall Risk assessment and High Risk flag calculation
 * - Neonatal APGAR score validation and critical value alert
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3012;
const TEST_USERNAME = 'clinical_safety_doc';
const TEST_PASSWORD = 'SAFETY_' + 'DOC_' + 'PASSWORD';

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
    console.log('--- STARTING CLINICAL SAFETY F1 INTEGRATION TESTS ---');

    const patientId = 9993;
    const doctorUserId = 9994;
    const client = await pool.connect();

    let surgTemplateId, bradenTemplateId, morseTemplateId, apgarTemplateId;

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM clinical_records WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'F1 Test Patient', 'مريض اختبار السلامة السريرية', '+966555555557']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Safety Doctor', 'Doctor', 'General Surgery', '["patients"]']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [doctorUserId]);

        // Fetch template IDs
        const surgTemp = await client.query(
            "SELECT t.id FROM clinical_templates t JOIN clinical_departments d ON t.department_id = d.id WHERE d.code = 'GENERAL_SURGERY' AND t.template_name_en = 'Surgical Count Sheet'"
        );
        surgTemplateId = surgTemp.rows[0].id;

        const bradenTemp = await client.query(
            "SELECT t.id FROM clinical_templates t JOIN clinical_departments d ON t.department_id = d.id WHERE d.code = 'PEDIATRICS' AND t.template_name_en = 'Braden Scale Assessment'"
        );
        bradenTemplateId = bradenTemp.rows[0].id;

        const morseTemp = await client.query(
            "SELECT t.id FROM clinical_templates t JOIN clinical_departments d ON t.department_id = d.id WHERE d.code = 'PEDIATRICS' AND t.template_name_en = 'Morse Fall Risk Assessment'"
        );
        morseTemplateId = morseTemp.rows[0].id;

        const apgarTemp = await client.query(
            "SELECT t.id FROM clinical_templates t JOIN clinical_departments d ON t.department_id = d.id WHERE d.code = 'NEONATOLOGY_NICU' AND t.template_name_en = 'Neonatal Apgar Score'"
        );
        apgarTemplateId = apgarTemp.rows[0].id;

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
    await new Promise(resolve => setTimeout(resolve, 6000));

    try {
        // Log in
        console.log('Logging in safety doctor...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
        const authHeaders = { 'Cookie': cookie };

        // Test 1: Surgical Count Sheet Mismatch without override reason should be blocked
        console.log('Testing Surgical Count Mismatch (should block)...');
        const blockRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: surgTemplateId,
            record_data: {
                sponge_count_pre: 10,
                sponge_count_post: 9,
                instrument_count_pre: 20,
                instrument_count_post: 20,
                sharp_count_pre: 5,
                sharp_count_post: 5
            }
        }, authHeaders);
        assert.strictEqual(blockRes.statusCode, 422, 'Mismatch without override should be blocked (422)');
        assert.strictEqual(blockRes.body.blocked, true);
        assert.ok(blockRes.body.error.includes('mismatch'));
        console.log('✓ Blocked mismatch count sheet successfully.');

        // Test 2: Surgical Count Sheet Mismatch with override reason should succeed
        console.log('Testing Surgical Count Mismatch with override reason (should succeed)...');
        const passRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: surgTemplateId,
            record_data: {
                sponge_count_pre: 10,
                sponge_count_post: 9,
                instrument_count_pre: 20,
                instrument_count_post: 20,
                sharp_count_pre: 5,
                sharp_count_post: 5,
                override_reason: 'Intentionally left sponge inside pack due to packaging mismatch, checked patient'
            }
        }, authHeaders);
        assert.strictEqual(passRes.statusCode, 201, 'Should succeed with 201 when override reason is provided');
        assert.ok(passRes.body.clinical_warning.includes('overridden'));
        console.log('✓ Saved overridden count sheet successfully.');

        // Test 3: Braden Scale Assessment (High Risk)
        console.log('Testing Braden Scale Assessment (High Risk)...');
        const bradenRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: bradenTemplateId,
            record_data: {
                sensory_perception: 2,
                moisture: 2,
                activity: 2,
                mobility: 2,
                nutrition: 2,
                friction_shear: 1
            }
        }, authHeaders);
        assert.strictEqual(bradenRes.statusCode, 201);
        assert.strictEqual(bradenRes.body.high_risk_flag, true);
        assert.ok(bradenRes.body.clinical_warning.includes('Ulcers'));
        console.log('✓ Braden Scale High Risk processed successfully.');

        // Test 4: Morse Fall Risk Assessment (High Risk)
        console.log('Testing Morse Fall Risk Assessment (High Risk)...');
        const morseRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: morseTemplateId,
            record_data: {
                history_of_falls: 25,
                secondary_diagnosis: 15,
                ambulatory_aid: 15,
                iv_heparin_lock: 0,
                gait_transferring: 10,
                mental_status: 0
            }
        }, authHeaders);
        assert.strictEqual(morseRes.statusCode, 201);
        assert.strictEqual(morseRes.body.high_risk_flag, true);
        assert.ok(morseRes.body.clinical_warning.includes('Falls'));
        console.log('✓ Morse Fall Risk High Risk processed successfully.');

        // Test 5: Neonatal APGAR Score (Invalid Values)
        console.log('Testing Neonatal APGAR (Invalid Values, should block)...');
        const invalidApgarRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: apgarTemplateId,
            record_data: {
                apgrid_1m_appearance: 3, // invalid
                apgar_1m_pulse: 2,
                apgar_1m_grimace: 2,
                apgar_1m_activity: 2,
                apgar_1m_respiration: 2
            }
        }, authHeaders);
        // Wait, the field name is typoed or we should check validated fields
        const invalidApgarResReal = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: apgarTemplateId,
            record_data: {
                apgar_1m_appearance: 3, // invalid
                apgar_1m_pulse: 2,
                apgar_1m_grimace: 2,
                apgar_1m_activity: 2,
                apgar_1m_respiration: 2
            }
        }, authHeaders);
        assert.strictEqual(invalidApgarResReal.statusCode, 400, 'Invalid APGAR value should return 400');
        console.log('✓ Blocked invalid APGAR values successfully.');

        // Test 6: Neonatal APGAR Score (Critical)
        console.log('Testing Neonatal APGAR (Critical)...');
        const criticalApgarRes = await makeRequest('POST', '/api/clinical/records', {
            patient_id: patientId,
            template_id: apgarTemplateId,
            record_data: {
                apgar_1m_appearance: 1,
                apgar_1m_pulse: 1,
                apgar_1m_grimace: 1,
                apgar_1m_activity: 1,
                apgar_1m_respiration: 1,
                apgar_5m_appearance: 1,
                apgar_5m_pulse: 1,
                apgar_5m_grimace: 1,
                apgar_5m_activity: 1,
                apgar_5m_respiration: 1
            }
        }, authHeaders);
        assert.strictEqual(criticalApgarRes.statusCode, 201);
        assert.strictEqual(criticalApgarRes.body.apgar_critical, true);
        assert.ok(criticalApgarRes.body.clinical_warning.includes('APGAR'));
        console.log('✓ Critical Neonatal APGAR processed successfully.');

        console.log('✅ All Clinical Safety F1 Integration Tests passed successfully!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exitCode = 1;
    } finally {
        // Clean up
        server.kill();
        const cleanClient = await pool.connect();
        try {
            await cleanClient.query("SET app.tenant_id = '1'");
            await cleanClient.query('DELETE FROM clinical_records WHERE patient_id = $1', [patientId]);
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
