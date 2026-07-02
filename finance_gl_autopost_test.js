/**
 * finance_gl_autopost_test.js — Integration test for AR/AP GL Auto-Posting.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3028;
const TEST_USERNAME = 'gl_autopost_tester';
const TEST_PASSWORD = 'GL_AUTOPOST_PASSWORD_2026';

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
    console.log('--- STARTING FINANCE GL AUTO-POSTING INTEGRATION TESTS ---');

    const testerUserId = 7741;
    const apInvoiceId = 7742;
    const arInvoiceId = 7743;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM finance_journal_lines WHERE tenant_id = 1');
        await client.query('DELETE FROM finance_journal_entries WHERE tenant_id = 1');
        await client.query('DELETE FROM finance_chart_of_accounts WHERE tenant_id = 1');
        await client.query('DELETE FROM finance_accounts_payable WHERE id = $1', [apInvoiceId]);
        await client.query('DELETE FROM finance_accounts_receivable WHERE id = $1', [arInvoiceId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [testerUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [testerUserId]);

        // Insert test AP Invoice
        await client.query(
            `INSERT INTO finance_accounts_payable 
                (id, vendor_name, invoice_number, invoice_date, total_amount, paid_amount, payment_status, gl_account_code, tenant_id)
             VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, 'Unpaid', '210101', 1)`,
            [apInvoiceId, 'Test Vendor', 'INV-AP-7742', 500.00]
        );

        // Insert test AR Invoice
        await client.query(
            `INSERT INTO finance_accounts_receivable 
                (id, patient_name, invoice_number, invoice_date, total_amount, collected_amount, collection_status, tenant_id)
             VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, 'Outstanding', 1)`,
            [arInvoiceId, 'Test Patient', 'INV-AR-7743', 300.00]
        );

        // Insert finance user
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            `INSERT INTO system_users (id, username, password_hash, display_name, role, permissions, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, 1)`,
            [testerUserId, TEST_USERNAME, hashedPassword, 'Test Finance Officer', 'Finance', '["accounts"]']
        );

        // Associate user with tenant 1
        await client.query(
            'INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1, 1, true)',
            [testerUserId]
        );

        console.log('Spawning test server...');
        serverProcess = spawn('node', ['server.js'], {
            env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'staging', SKIP_DB_INIT: 'true' }
        });

        serverProcess.stdout.on('data', (data) => {
            if (process.env.DEBUG_TESTS) console.log(`[Server STDOUT] ${data.toString().trim()}`);
        });
        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server STDERR] ${data.toString().trim()}`);
        });

        // Wait 1.5 seconds for the server to start
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Logging in to obtain session cookie...');
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: TEST_USERNAME,
            password: TEST_PASSWORD
        });
        assert.strictEqual(loginRes.statusCode, 200, 'Login should succeed');
        
        const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : '';
        assert.ok(cookie, 'Should receive session cookie');

        console.log('Test 1: Pay AP Invoice and verify auto GL posting...');
        const payRes = await makeRequest('POST', `/api/finance/ap/${apInvoiceId}/pay`, {
            payment_amount: 500.00,
            payment_method: 'Bank Transfer',
            payment_reference: 'AP-REF-7742'
        }, { Cookie: cookie });
        
        if (payRes.statusCode !== 200) {
            console.error('AP Payment failed with body:', payRes.body || payRes.rawBody);
        }
        assert.strictEqual(payRes.statusCode, 200, 'AP payment should succeed');
        assert.strictEqual(payRes.body.record.payment_status, 'Paid', 'AP status should be Paid');

        // Check if Journal Entry is posted
        const entryRes = await client.query(
            "SELECT * FROM finance_journal_entries WHERE reference = $1 AND tenant_id = 1",
            [`AP-PAY-${apInvoiceId}`]
        );
        assert.strictEqual(entryRes.rowCount, 1, 'Exactly one GL journal entry should be created');
        const entry = entryRes.rows[0];
        assert.strictEqual(entry.posting_status, 'POSTED', 'Journal entry should be marked as POSTED');
        assert.strictEqual(entry.is_posted, 1, 'is_posted should be 1');

        // Check journal lines (should have 2 lines, debit AP and credit Cash/Bank)
        const linesRes = await client.query(
            "SELECT * FROM finance_journal_lines WHERE entry_id = $1 AND tenant_id = 1 ORDER BY debit DESC",
            [entry.id]
        );
        assert.strictEqual(linesRes.rowCount, 2, 'Exactly two journal lines should exist');
        
        const debitLine = linesRes.rows[0];
        const creditLine = linesRes.rows[1];

        assert.strictEqual(parseFloat(debitLine.debit), 500.00, 'Debit should be 500');
        assert.strictEqual(parseFloat(debitLine.credit), 0, 'Debit line credit should be 0');

        assert.strictEqual(parseFloat(creditLine.debit), 0, 'Credit line debit should be 0');
        assert.strictEqual(parseFloat(creditLine.credit), 500.00, 'Credit should be 500');

        // Verify accounts mapping
        const apAccount = (await client.query("SELECT account_code FROM finance_chart_of_accounts WHERE id = $1", [debitLine.account_id])).rows[0];
        const cashAccount = (await client.query("SELECT account_code FROM finance_chart_of_accounts WHERE id = $1", [creditLine.account_id])).rows[0];
        
        assert.strictEqual(apAccount.account_code, '210101', 'Debit account should be Accounts Payable (210101)');
        assert.strictEqual(cashAccount.account_code, '110101', 'Credit account should be Cash/Bank (110101)');

        console.log('Test 2: Collect AR Invoice and verify auto GL posting...');
        const collectRes = await makeRequest('POST', `/api/finance/ar/${arInvoiceId}/collect`, {
            collection_amount: 300.00
        }, { Cookie: cookie });

        assert.strictEqual(collectRes.statusCode, 200, 'AR collection should succeed');
        assert.strictEqual(collectRes.body.record.collection_status, 'Collected', 'AR status should be Collected');

        // Check if Journal Entry is posted
        const entryResAr = await client.query(
            "SELECT * FROM finance_journal_entries WHERE reference = $1 AND tenant_id = 1",
            [`AR-COLLECT-${arInvoiceId}`]
        );
        assert.strictEqual(entryResAr.rowCount, 1, 'Exactly one GL journal entry should be created for AR');
        const entryAr = entryResAr.rows[0];
        assert.strictEqual(entryAr.posting_status, 'POSTED', 'Journal entry should be marked as POSTED');

        // Check journal lines (should have 2 lines, debit Cash/Bank and credit AR)
        const linesResAr = await client.query(
            "SELECT * FROM finance_journal_lines WHERE entry_id = $1 AND tenant_id = 1 ORDER BY debit DESC",
            [entryAr.id]
        );
        assert.strictEqual(linesResAr.rowCount, 2, 'Exactly two journal lines should exist for AR');
        
        const debitLineAr = linesResAr.rows[0];
        const creditLineAr = linesResAr.rows[1];

        assert.strictEqual(parseFloat(debitLineAr.debit), 300.00, 'Debit should be 300');
        assert.strictEqual(parseFloat(debitLineAr.credit), 0, 'Debit line credit should be 0');

        assert.strictEqual(parseFloat(creditLineAr.debit), 0, 'Credit line debit should be 0');
        assert.strictEqual(parseFloat(creditLineAr.credit), 300.00, 'Credit should be 300');

        // Verify accounts mapping
        const cashAccountAr = (await client.query("SELECT account_code FROM finance_chart_of_accounts WHERE id = $1", [debitLineAr.account_id])).rows[0];
        const arAccount = (await client.query("SELECT account_code FROM finance_chart_of_accounts WHERE id = $1", [creditLineAr.account_id])).rows[0];
        
        assert.strictEqual(cashAccountAr.account_code, '110101', 'Debit account should be Cash/Bank (110101)');
        assert.strictEqual(arAccount.account_code, '120101', 'Credit account should be Accounts Receivable (120101)');

        console.log('✅ ALL FINANCE GL AUTO-POSTING TESTS PASSED!');
    } catch (e) {
        console.error('❌ TEST FAILED:', e);
        process.exitCode = 1;
    } finally {
        console.log('Cleaning up test data...');
        try {
            await client.query('DELETE FROM finance_journal_lines WHERE tenant_id = 1');
            await client.query('DELETE FROM finance_journal_entries WHERE tenant_id = 1');
            await client.query('DELETE FROM finance_chart_of_accounts WHERE tenant_id = 1');
            await client.query('DELETE FROM finance_accounts_payable WHERE id = $1', [apInvoiceId]);
            await client.query('DELETE FROM finance_accounts_receivable WHERE id = $1', [arInvoiceId]);
            await client.query('DELETE FROM user_tenants WHERE user_id = $1', [testerUserId]);
            await client.query('DELETE FROM system_users WHERE id = $1', [testerUserId]);
        } catch (err) {
            console.error('Failed to clean up test data:', err);
        }
        client.release();
        if (serverProcess) {
            serverProcess.kill();
        }
    }
}

runTests();
