/**
 * gate10_revenue_cycle_test.js
 * Integration test for Gate 10 Revenue Cycle Completion:
 * - Posting NPHIES remittance advice to Accounts Receivable (AR) and General Ledger (GL)
 * - Verifying creation of balanced GL journal entries (Debits = Credits)
 * - Verifying idempotency and blocking double posting (Conflict 409)
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');

// Set env variables to connect as postgres superuser and development mode BEFORE importing db_postgres
process.env.NODE_ENV = 'development';
process.env.DB_USER = 'postgres';
const { pool, initDatabase } = require('./db_postgres');

const TEST_PORT = 3015;
const TEST_USERNAME = 'gate10_finance_user';
const TEST_PASSWORD = 'FINANCE_PASSWORD_CHANGE_ME';

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
    console.log('--- STARTING GATE 10 REVENUE CYCLE INTEGRATION TESTS ---');

    try {
        console.log('Initializing database tables locally as postgres...');
        await initDatabase();
        
        // Run specific schema migrations for insurance_claims to align with server expectations
        const schemaClient = await pool.connect();
        try {
            console.log('Applying necessary insurance_claims and GL column updates for testing...');
            await schemaClient.query('ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0');
            await schemaClient.query("ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending'");
            await schemaClient.query('ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS payment_date DATE');
            await schemaClient.query("ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'draft'");

            await schemaClient.query('ALTER TABLE finance_chart_of_accounts ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1');
            await schemaClient.query('ALTER TABLE finance_chart_of_accounts ADD COLUMN IF NOT EXISTS account_class TEXT');

            await schemaClient.query('ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1');
            await schemaClient.query("ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posting_status TEXT DEFAULT 'DRAFT'");
            await schemaClient.query("ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL'");
            await schemaClient.query('ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posted_by TEXT');
            await schemaClient.query('ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP');
            await schemaClient.query('ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS balanced_at TIMESTAMP');
            await schemaClient.query('ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS reversal_of INTEGER');

            await schemaClient.query('ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1');
        } finally {
            schemaClient.release();
        }
    } catch (e) {
        console.error('Database initialization failed:', e);
    }

    const payerId = 9911;
    const claimId = 9912;
    const remittanceId = 9913;
    const userId = 9914;
    
    const client = await pool.connect();

    try {
        await client.query("SET app.tenant_id = '1'");

        // Clean up any old data
        await client.query('DELETE FROM nphies_remittance_advice WHERE id = $1', [remittanceId]);
        await client.query('DELETE FROM insurance_claims WHERE id = $1', [claimId]);
        await client.query('DELETE FROM insurance_companies WHERE id = $1', [payerId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [userId]);

        // Insert payer
        await client.query(
            'INSERT INTO insurance_companies (id, name_ar, name_en, tenant_id) VALUES ($1, $2, $3, 1)',
            [payerId, 'شركة تأمين تجريبية', 'Test Insurance Co']
        );

        // Insert claim
        await client.query(
            "INSERT INTO insurance_claims (id, patient_name, insurance_company, claim_amount, status, tenant_id) VALUES ($1, $2, $3, 1000.00, 'Pending', 1)",
            [claimId, 'John Doe', 'Test Insurance Co']
        );

        // Insert remittance advice
        await client.query(
            `INSERT INTO nphies_remittance_advice (id, claim_id, payer_id, payment_amount, denial_amount, posted_to_gl, tenant_id) 
             VALUES ($1, $2, $3, 750.00, 250.00, false, 1)`,
            [remittanceId, claimId, payerId]
        );

        // Insert finance user with role 'Finance'
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            `INSERT INTO system_users (id, username, password_hash, display_name, role, is_active) 
             VALUES ($1, $2, $3, $4, 'Finance', 1)`,
            [userId, TEST_USERNAME, hashedPassword, 'Finance User']
        );

        // Associate user with tenant 1
        await client.query('INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)', [userId]);

    } finally {
        client.release();
    }

    // Start local server with production env for app RLS testing
    server = spawn('node', ['server.js'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: TEST_PORT, SKIP_DB_INIT: '1', NODE_ENV: 'production' }
    });

    // Wait for server to boot
    await new Promise(resolve => setTimeout(resolve, 6000));

    try {
        // Log in
        console.log('Logging in finance user...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        
        const cookie = loginRes.headers['set-cookie'][0];

        // Post remittance to AR/GL
        console.log('Posting remittance to AR/GL...');
        const postRes = await makeRequest('POST', `/api/nphies/remittance/${remittanceId}/post-to-ar`, null, {
            'Cookie': cookie
        });
        
        assert.strictEqual(postRes.statusCode, 200, 'Posting to AR should succeed');
        assert.strictEqual(postRes.body.success, true, 'Response success should be true');

        // Check DB for posted status and claim status
        console.log('Verifying database state after posting...');
        const dbClient = await pool.connect();
        try {
            await dbClient.query("SET app.tenant_id = '1'");
            const ra = (await dbClient.query('SELECT * FROM nphies_remittance_advice WHERE id = $1', [remittanceId])).rows[0];
            assert.strictEqual(ra.posted_to_gl, true, 'Remittance posted_to_gl should be true');

            const claim = (await dbClient.query('SELECT * FROM insurance_claims WHERE id = $1', [claimId])).rows[0];
            assert.strictEqual(claim.payment_status, 'Paid', 'Claim payment_status should be Paid');
            assert.strictEqual(parseFloat(claim.paid_amount), 750.00, 'Claim paid_amount should be 750.00');

            // Verify GL Journal Entry creation
            const je = (await dbClient.query("SELECT * FROM finance_journal_entries WHERE reference = $1 AND tenant_id = 1", [`NPHIES-RA-${remittanceId}`])).rows[0];
            assert.ok(je, 'Journal entry should be created in GL');
            assert.strictEqual(je.posting_status, 'POSTED', 'Journal entry should be posted directly');

            // Verify GL Journal Lines balance
            const lines = (await dbClient.query("SELECT * FROM finance_journal_lines WHERE entry_id = $1", [je.id])).rows;
            assert.strictEqual(lines.length, 3, 'There should be 3 journal lines (Cash, Write-off, Receivables)');

            let totalDebit = 0;
            let totalCredit = 0;
            for (const line of lines) {
                totalDebit += parseFloat(line.debit || 0);
                totalCredit += parseFloat(line.credit || 0);
            }
            assert.strictEqual(totalDebit, 1000.00, 'Total debit must be 1000.00');
            assert.strictEqual(totalCredit, 1000.00, 'Total credit must be 1000.00');
            assert.strictEqual(totalDebit, totalCredit, 'Journal entry must be balanced');

        } finally {
            dbClient.release();
        }

        // Try posting again (Conflict check)
        console.log('Verifying duplicate posting rejection...');
        const postDupRes = await makeRequest('POST', `/api/nphies/remittance/${remittanceId}/post-to-ar`, null, {
            'Cookie': cookie
        });
        assert.strictEqual(postDupRes.statusCode, 409, 'Duplicate posting should fail with 409');
        assert.strictEqual(postDupRes.body.error, 'Already posted to GL/AR', 'Should return already posted error');

        console.log('ALL TESTS PASSED SUCCESSFULLY!');
        cleanUpAndExit(0);

    } catch (e) {
        console.error('TEST FAILED:', e);
        cleanUpAndExit(1);
    }
}

async function cleanUpAndExit(code) {
    if (server) {
        server.kill();
    }
    
    // Clean up DB rows
    console.log('Cleaning up database test rows...');
    const client = await pool.connect();
    try {
        await client.query("SET app.tenant_id = '1'");
        
        // Find journal entry id to clean lines
        const je = (await client.query("SELECT id FROM finance_journal_entries WHERE reference = 'NPHIES-RA-9913'")).rows[0];
        if (je) {
            await client.query('DELETE FROM finance_journal_lines WHERE entry_id = $1', [je.id]);
            await client.query('DELETE FROM finance_journal_entries WHERE id = $1', [je.id]);
        }
        
        await client.query('DELETE FROM nphies_remittance_advice WHERE id = 9913');
        await client.query('DELETE FROM insurance_claims WHERE id = 9912');
        await client.query('DELETE FROM insurance_companies WHERE id = 9911');
        await client.query('DELETE FROM user_tenants WHERE user_id = 9914');
        await client.query('DELETE FROM system_users WHERE id = 9914');
    } catch (e) {
        console.error('Cleanup failed:', e);
    } finally {
        client.release();
    }
    process.exit(code);
}

runTests();
