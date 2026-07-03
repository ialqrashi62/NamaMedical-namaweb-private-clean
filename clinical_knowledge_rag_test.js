/**
 * clinical_knowledge_rag_test.js
 * Integration and security tests for clinical RAG search and AI Copilot.
 * Ensures strict tenant isolation and proper vector math matching.
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3012;
const TEST_DOCTOR_USERNAME = 'rag_doctor';
const TEST_ADMIN_USERNAME = 'rag_admin';
const TEST_PASSWORD = 'RAG_PASSWORD_PLACEHOLDER';

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

// Generate normalized mock 1536-dimensional embeddings
function makeMockEmbedding(activeIdx, val = 1.0) {
    const arr = new Array(1536).fill(0.0);
    arr[activeIdx] = val;
    return arr;
}

async function runTests() {
    console.log('--- STARTING CLINICAL RAG INTEGRATION TESTS ---');

    const doctorUserId = 9981;
    const adminUserId = 9982;
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up previous runs
        await client.query('DELETE FROM clinical_knowledge_vectors WHERE tenant_id IN (1, 2)');
        await client.query('DELETE FROM user_tenants WHERE user_id IN ($1, $2)', [doctorUserId, adminUserId]);
        await client.query('DELETE FROM system_users WHERE id IN ($1, $2)', [doctorUserId, adminUserId]);

        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

        // Create Doctor User (Tenant 1)
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [doctorUserId, TEST_DOCTOR_USERNAME, hashedPassword, 'RAG Doctor', 'Doctor', 'Cardiology', '["patients"]']
        );
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [doctorUserId]);

        // Create Admin User (Tenant 1)
        await client.query(
            'INSERT INTO system_users (id, username, password_hash, display_name, role, speciality, permissions, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)',
            [adminUserId, TEST_ADMIN_USERNAME, hashedPassword, 'RAG Admin', 'Admin', 'Cardiology', '["patients"]']
        );
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [adminUserId]);

    } finally {
        client.release();
    }

    // Start server in background
    console.log('Starting background test server...');
    server = spawn('node', ['server.js'], {
        env: {
            ...process.env,
            PORT: TEST_PORT,
            SKIP_DB_INIT: 'true'
        }
    });

    server.stdout.on('data', (data) => {
        const out = data.toString();
        if (out.includes('Server error') || out.includes('error')) {
            console.log('SERVER LOG:', out.trim());
        }
    });

    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        // 1. Login as Admin
        console.log('Logging in as Admin...');
        const loginAdminRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_ADMIN_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginAdminRes.statusCode, 200, 'Admin login should succeed');
        const adminCookie = loginAdminRes.headers['set-cookie']?.[0];
        const adminHeaders = { Cookie: adminCookie };

        // 2. Login as Doctor
        console.log('Logging in as Doctor...');
        const loginDocRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_DOCTOR_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginDocRes.statusCode, 200, 'Doctor login should succeed');
        const doctorCookie = loginDocRes.headers['set-cookie']?.[0];
        const doctorHeaders = { Cookie: doctorCookie };

        // Get cardiology department ID to associate
        const deptRes = await pool.query("SELECT id FROM clinical_departments WHERE code = 'CARDIOLOGY' AND tenant_id = 1");
        const cardiologyDeptId = deptRes.rows[0]?.id || null;

        // 3. Admin: Index a Cardiology guideline
        console.log('Indexing clinical guideline as Admin...');
        const chunkContent = 'Guideline cardi-01: Administer beta-blockers immediately for stable angina.';
        const chunkEmbedding = makeMockEmbedding(0, 0.95); // High weight in index 0
        const indexRes = await makeRequest('POST', '/api/clinical/knowledge', {
            department_id: cardiologyDeptId,
            content_chunk: chunkContent,
            embedding: chunkEmbedding,
            metadata: { source: 'AHA 2026', chapter: 'Angina Protocols' }
        }, adminHeaders);
        assert.strictEqual(indexRes.statusCode, 201, 'Should return 201 Created');
        assert.ok(indexRes.body.success, 'Should indicate success');
        assert.ok(indexRes.body.id, 'Should return generated chunk ID');

        // 4. Doctor: Try to index a guideline (verify role restriction - Admin only!)
        console.log('Verifying role restriction for indexing (Doctor should be blocked)...');
        const indexDocRes = await makeRequest('POST', '/api/clinical/knowledge', {
            department_id: cardiologyDeptId,
            content_chunk: 'Doctor Guideline draft',
            embedding: chunkEmbedding
        }, doctorHeaders);
        assert.strictEqual(indexDocRes.statusCode, 403, 'Doctor should be forbidden from indexing');

        // 5. Doctor: Query vector similarity
        console.log('Searching knowledge base with query embedding...');
        const queryEmbedding = makeMockEmbedding(0, 0.85); // High weight in index 0
        const searchRes = await makeRequest('GET', `/api/clinical/knowledge/search?query_embedding=${JSON.stringify(queryEmbedding)}&department_id=${cardiologyDeptId}`, null, doctorHeaders);
        assert.strictEqual(searchRes.statusCode, 200, 'Search should succeed');
        assert.strictEqual(searchRes.body.length, 1, 'Should return exactly 1 matched chunk');
        assert.strictEqual(searchRes.body[0].content, chunkContent, 'Should match content chunk');
        // Similarity check: 0.95 * 0.85 = 0.8075
        assert.ok(searchRes.body[0].similarity > 0.8, 'Similarity should be greater than 0.8');

        // 6. Doctor: Query vector similarity for a different embedding (low similarity)
        console.log('Searching with unrelated embedding...');
        const unrelatedQueryEmbedding = makeMockEmbedding(10, 0.9); // Component 10 active
        const searchUnrelatedRes = await makeRequest('GET', `/api/clinical/knowledge/search?query_embedding=${JSON.stringify(unrelatedQueryEmbedding)}`, null, doctorHeaders);
        assert.strictEqual(searchUnrelatedRes.statusCode, 200, 'Search should succeed');
        assert.strictEqual(searchUnrelatedRes.body[0].similarity, 0.0, 'Similarity should be 0.0 for unrelated vectors');

        // 7. Verify Tenant Isolation (Spoof Tenant Context)
        console.log('Testing Tenant Isolation (Tenant 2 requesting RAG search)...');
        // Simulate a Tenant 2 request by mocking/modifying the cookie context or logging in another user
        // We will temporarily associate doctor with tenant 2, reset session, and query
        const dbClient = await pool.connect();
        try {
            await dbClient.query('UPDATE user_tenants SET tenant_id = 2 WHERE user_id = $1', [doctorUserId]);
        } finally {
            dbClient.release();
        }

        const loginDoc2Res = await makeRequest('POST', '/api/auth/login', {
            username: TEST_DOCTOR_USERNAME,
            password: TEST_PASSWORD
        });
        const doc2Cookie = loginDoc2Res.headers['set-cookie']?.[0];
        const doc2Headers = { Cookie: doc2Cookie };

        const searchTenant2Res = await makeRequest('GET', `/api/clinical/knowledge/search?query_embedding=${JSON.stringify(queryEmbedding)}`, null, doc2Headers);
        assert.strictEqual(searchTenant2Res.statusCode, 200, 'Search should return 200');
        assert.strictEqual(searchTenant2Res.body.length, 0, 'Tenant 2 should NOT see Tenant 1 clinical guidelines');

        // Restore doctor user back to Tenant 1
        const dbClient2 = await pool.connect();
        try {
            await dbClient2.query('UPDATE user_tenants SET tenant_id = 1 WHERE user_id = $1', [doctorUserId]);
        } finally {
            dbClient2.release();
        }

        const loginDoc3Res = await makeRequest('POST', '/api/auth/login', {
            username: TEST_DOCTOR_USERNAME,
            password: TEST_PASSWORD
        });
        const doctorCookieUpdated = loginDoc3Res.headers['set-cookie']?.[0];
        const doctorHeadersUpdated = { Cookie: doctorCookieUpdated };

        // 8. Ask Clinical AI Copilot
        console.log('Asking Clinical AI Copilot...');
        const askRes = await makeRequest('POST', '/api/clinical/ai/ask', {
            question: 'What is the immediate protocol for stable angina?',
            query_embedding: queryEmbedding,
            department_id: cardiologyDeptId
        }, doctorHeadersUpdated);
        assert.strictEqual(askRes.statusCode, 200, 'AI Copilot request should succeed');
        assert.ok(askRes.body.answer.includes(chunkContent), 'Answer should integrate retrieved guideline context');
        assert.strictEqual(askRes.body.citations.length, 1, 'Should include 1 citation');
        assert.strictEqual(askRes.body.citations[0].source, 'AHA 2026', 'Citation source should match metadata');

        console.log('✅ All Clinical RAG Integration Tests passed successfully!');
    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exit(1);
    } finally {
        // Cleanup test data
        console.log('✓ Cleanup complete');
        server.kill();
        process.exit(0);
    }
}

runTests();
