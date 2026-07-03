/**
 * clinical_notes_f2_test.js
 * Integration test for Phase F2 Clinical Notes (SOAP) & Smart Templates (Dot Phrases):
 * - Creating, updating, and locking SOAP notes
 * - Blocking modifications of locked SOAP notes
 * - Creating, validating, listing, and deleting Dot Phrases (Smart Templates)
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3013;
const TEST_USERNAME = 'clinical_notes_doc';
const TEST_PASSWORD = 'NOTES_' + 'DOC_' + 'PASSWORD';

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
    console.log('--- STARTING CLINICAL NOTES & TEMPLATES F2 INTEGRATION TESTS ---');

    const patientId = 9983;
    const doctorUserId = 9984;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up
        await client.query('DELETE FROM clinical_notes WHERE patient_id = $1', [patientId]);
        await client.query('DELETE FROM clinical_smart_templates WHERE doctor_id = $1', [doctorUserId]);
        await client.query('DELETE FROM patients WHERE id = $1', [patientId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [doctorUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [doctorUserId]);

        // Insert patient
        await client.query(
            'INSERT INTO patients (id, name_en, name_ar, phone, tenant_id) VALUES ($1, $2, $3, $4, 1)',
            [patientId, 'F2 Test Patient', 'مريض اختبار التوثيق السريري', '+966555555558']
        );

        // Insert doctor user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_USERNAME, hashedPassword, 'Notes Doctor', 'Doctor', 'General Practice', '["patients"]']
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
        console.log('Logging in notes doctor...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
        const authHeaders = { 'Cookie': cookie };

        // Test 1: Save SOAP Clinical Note (Draft)
        console.log('Testing Save SOAP Note Draft...');
        const draftRes = await makeRequest('POST', '/api/clinical/notes', {
            patient_id: patientId,
            subjective: 'Patient reports mild headache.',
            objective: 'Temp 37C, BP 120/80.',
            assessment: 'Tension headache.',
            plan: 'Rest and hydration.'
        }, authHeaders);
        assert.strictEqual(draftRes.statusCode, 201, 'Should return 201 Created');
        assert.strictEqual(draftRes.body.emr_status, 'draft', 'Status should be draft');
        assert.strictEqual(draftRes.body.subjective, 'Patient reports mild headache.');
        const noteId = draftRes.body.id;
        console.log('✓ SOAP Note draft saved successfully.');

        // Test 2: Update SOAP Clinical Note (Draft)
        console.log('Testing Update SOAP Note...');
        const updateRes = await makeRequest('POST', '/api/clinical/notes', {
            id: noteId,
            patient_id: patientId,
            subjective: 'Patient reports moderate headache.',
            objective: 'Temp 37C, BP 120/80.',
            assessment: 'Tension headache.',
            plan: 'Rest and hydration. Paracetamol 500mg.'
        }, authHeaders);
        assert.strictEqual(updateRes.statusCode, 200, 'Should return 200 OK');
        assert.strictEqual(updateRes.body.subjective, 'Patient reports moderate headache.');
        assert.strictEqual(updateRes.body.plan, 'Rest and hydration. Paracetamol 500mg.');
        console.log('✓ SOAP Note draft updated successfully.');

        // Test 3: Lock SOAP Clinical Note
        console.log('Testing Lock SOAP Note...');
        const lockRes = await makeRequest('POST', `/api/clinical/notes/${noteId}/lock`, {}, authHeaders);
        assert.strictEqual(lockRes.statusCode, 200, 'Should lock successfully');
        assert.strictEqual(lockRes.body.emr_status, 'locked', 'Status should be locked');
        assert.ok(lockRes.body.integrity_hash, 'Should compute integrity hash');
        assert.ok(lockRes.body.integrity_hash.includes('Signed by'), 'Should include signature text');
        console.log('✓ SOAP Note locked and signed successfully.');

        // Test 4: Try to modify locked SOAP Clinical Note (should fail)
        console.log('Testing Block Modification of Locked Note...');
        const failRes = await makeRequest('POST', '/api/clinical/notes', {
            id: noteId,
            patient_id: patientId,
            subjective: 'Attempting to bypass lock.'
        }, authHeaders);
        assert.strictEqual(failRes.statusCode, 409, 'Should return 409 Conflict');
        console.log('✓ Blocked locked note modification successfully.');

        // Test 5: Create Smart Note Template (Dot Phrase)
        console.log('Testing Create Dot Phrase...');
        const templRes = await makeRequest('POST', '/api/clinical/smart-templates', {
            shortcut: '.htn',
            template_text: 'Hypertension follow up. BP: [ ] mmHg. Compliance: [ ].'
        }, authHeaders);
        assert.strictEqual(templRes.statusCode, 201, 'Should return 201 Created');
        assert.strictEqual(templRes.body.shortcut, '.htn');
        const templateId = templRes.body.id;
        console.log('✓ Dot phrase created successfully.');

        // Test 6: Create Duplicate Dot Phrase (should fail)
        console.log('Testing Create Duplicate Dot Phrase...');
        const dupRes = await makeRequest('POST', '/api/clinical/smart-templates', {
            shortcut: '.htn',
            template_text: 'Duplicate template text.'
        }, authHeaders);
        assert.strictEqual(dupRes.statusCode, 409, 'Should return 409 Conflict');
        console.log('✓ Duplicate dot phrase creation blocked.');

        // Test 7: Create Invalid Dot Phrase Shortcut (should fail)
        console.log('Testing Create Invalid Dot Phrase Shortcut...');
        const invalidRes1 = await makeRequest('POST', '/api/clinical/smart-templates', {
            shortcut: 'htn', // missing dot
            template_text: 'Invalid shortcut text.'
        }, authHeaders);
        assert.strictEqual(invalidRes1.statusCode, 400);

        const invalidRes2 = await makeRequest('POST', '/api/clinical/smart-templates', {
            shortcut: '.htn with spaces', // spaces
            template_text: 'Invalid shortcut text.'
        }, authHeaders);
        assert.strictEqual(invalidRes2.statusCode, 400);
        console.log('✓ Invalid dot phrase shortcuts blocked.');

        // Test 8: Get Dot Phrases list
        console.log('Testing Get Dot Phrases List...');
        const listRes = await makeRequest('GET', '/api/clinical/smart-templates', {}, authHeaders);
        assert.strictEqual(listRes.statusCode, 200);
        assert.ok(Array.isArray(listRes.body));
        assert.strictEqual(listRes.body.length, 1);
        assert.strictEqual(listRes.body[0].shortcut, '.htn');
        console.log('✓ Retrieved dot phrases list successfully.');

        // Test 9: Delete Dot Phrase
        console.log('Testing Delete Dot Phrase...');
        const delRes = await makeRequest('DELETE', `/api/clinical/smart-templates/${templateId}`, {}, authHeaders);
        assert.strictEqual(delRes.statusCode, 200);
        assert.strictEqual(delRes.body.success, true);
        console.log('✓ Deleted dot phrase successfully.');

        console.log('✅ All Clinical Notes & Templates F2 Integration Tests passed successfully!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exitCode = 1;
    } finally {
        // Clean up
        server.kill();
        const cleanClient = await pool.connect();
        try {
            await cleanClient.query("SET app.tenant_id = '1'");
            await cleanClient.query('DELETE FROM clinical_notes WHERE patient_id = $1', [patientId]);
            await cleanClient.query('DELETE FROM clinical_smart_templates WHERE doctor_id = $1', [doctorUserId]);
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
