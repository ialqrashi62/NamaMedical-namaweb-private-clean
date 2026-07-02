/**
 * inventory_reorder_test.js — Integration test for the Inventory Auto-Reorder Engine.
 */
'use strict';

process.env.NODE_ENV = 'staging';

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const { pool } = require('./db_postgres');

const TEST_PORT = 3027;
const TEST_USERNAME = 'reorder_tester';
const TEST_PASSWORD = 'REORDER_PASSWORD_PLACEHOLDER';

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
    console.log('--- STARTING INVENTORY AUTO-REORDER ENGINE INTEGRATION TESTS ---');

    const itemId = 8841;
    const batchId = 8842;
    const testerUserId = 8843;
    const client = await pool.connect();

    try {
        console.log('Setting up test data...');
        await client.query("SET app.tenant_id = '1'");

        // Clean up old test data
        await client.query('DELETE FROM notifications WHERE record_id = $1 AND module = \'Inventory\'', [itemId]);
        await client.query('DELETE FROM inventory_movements WHERE item_id = $1', [itemId]);
        await client.query('DELETE FROM inventory_batches WHERE item_id = $1', [itemId]);
        await client.query('DELETE FROM inventory_items WHERE id = $1', [itemId]);
        await client.query('DELETE FROM user_tenants WHERE user_id = $1', [testerUserId]);
        await client.query('DELETE FROM system_users WHERE id = $1', [testerUserId]);

        // Insert test inventory item
        await client.query(
            `INSERT INTO inventory_items (id, item_name, item_code, stock_qty, reorder_point, min_qty, is_active, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, 1, 1)`,
            [itemId, 'Test Reorder Drug', 'TEST-REORDER-123', 150, 100, 10]
        );

        // Insert batch for the item
        await client.query(
            `INSERT INTO inventory_batches (id, item_id, lot_number, expiry_date, qty_received, qty_on_hand, unit_cost, status, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
            [batchId, itemId, 'LOT-8842', '2029-12-31', 150, 150, 12.5, 'active']
        );

        // Insert inventory-capable user (Pharmacist has 'inventory' module permission)
        const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
        await client.query(
            `INSERT INTO system_users (id, username, password_hash, display_name, role, permissions, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, 1)`,
            [testerUserId, TEST_USERNAME, hashedPassword, 'Test Pharmacist Reorder', 'Pharmacist', '["inventory"]']
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

        // Verify initial state
        const initialItem = (await client.query('SELECT stock_qty FROM inventory_items WHERE id = $1', [itemId])).rows[0];
        assert.strictEqual(initialItem.stock_qty, 150, 'Initial stock should be 150');

        console.log('Test 1: Decrement stock from 150 to 90 (below reorder point 100)...');
        const movementRes = await makeRequest('POST', '/api/inventory/movements', {
            item_id: itemId,
            qty: 60,
            movement_type: 'issue',
            reason: 'Patient prescription issue'
        }, { Cookie: cookie });
        
        assert.strictEqual(movementRes.statusCode, 200, 'Movement should be processed');
        assert.strictEqual(movementRes.body.balance_after, 90, 'Balance after should be 90');

        // Let async background notification worker execute
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check if notification is generated
        const alertRes = await client.query(
            "SELECT * FROM notifications WHERE record_id = $1 AND module = 'Inventory' AND type = 'warning' AND tenant_id = 1",
            [itemId]
        );
        assert.strictEqual(alertRes.rowCount, 1, 'Exactly one warning notification should have been generated');
        const alert = alertRes.rows[0];
        assert.strictEqual(alert.is_read, 0, 'Notification should be unread');
        assert.ok(alert.title.includes('Low Stock Alert'), 'Title should indicate low stock');
        assert.ok(alert.title_ar.includes('تنبيه انخفاض المخزون'), 'Arabic title should indicate low stock');

        console.log('Test 2: Decrement stock again from 90 to 80 (should NOT create a duplicate unread alert)...');
        const movementRes2 = await makeRequest('POST', '/api/inventory/movements', {
            item_id: itemId,
            qty: 10,
            movement_type: 'issue',
            reason: 'Additional patient issue'
        }, { Cookie: cookie });

        assert.strictEqual(movementRes2.statusCode, 200, 'Second movement should succeed');
        assert.strictEqual(movementRes2.body.balance_after, 80, 'Balance after should be 80');

        await new Promise(resolve => setTimeout(resolve, 300));

        const alertRes2 = await client.query(
            "SELECT * FROM notifications WHERE record_id = $1 AND module = 'Inventory' AND type = 'warning' AND tenant_id = 1",
            [itemId]
        );
        assert.strictEqual(alertRes2.rowCount, 1, 'Should still have only 1 warning notification (no duplicates)');

        console.log('Test 3: Mark notification as read, then decrement stock from 80 to 70 (should create a NEW alert)...');
        await client.query('UPDATE notifications SET is_read = 1 WHERE id = $1', [alert.id]);

        const movementRes3 = await makeRequest('POST', '/api/inventory/movements', {
            item_id: itemId,
            qty: 10,
            movement_type: 'issue',
            reason: 'Third patient issue'
        }, { Cookie: cookie });

        assert.strictEqual(movementRes3.statusCode, 200, 'Third movement should succeed');
        assert.strictEqual(movementRes3.body.balance_after, 70, 'Balance after should be 70');

        await new Promise(resolve => setTimeout(resolve, 300));

        const alertRes3 = await client.query(
            "SELECT * FROM notifications WHERE record_id = $1 AND module = 'Inventory' AND type = 'warning' AND tenant_id = 1 ORDER BY id ASC",
            [itemId]
        );
        assert.strictEqual(alertRes3.rowCount, 2, 'Should now have 2 warning notifications');
        assert.strictEqual(alertRes3.rows[0].is_read, 1, 'First notification should remain read');
        assert.strictEqual(alertRes3.rows[1].is_read, 0, 'Second notification should be unread');

        console.log('✅ ALL INVENTORY AUTO-REORDER ENGINE TESTS PASSED!');
    } catch (e) {
        console.error('❌ TEST FAILED:', e);
        process.exitCode = 1;
    } finally {
        console.log('Cleaning up test data...');
        try {
            await client.query('DELETE FROM notifications WHERE record_id = $1 AND module = \'Inventory\'', [itemId]);
            await client.query('DELETE FROM inventory_movements WHERE item_id = $1', [itemId]);
            await client.query('DELETE FROM inventory_batches WHERE item_id = $1', [itemId]);
            await client.query('DELETE FROM inventory_items WHERE id = $1', [itemId]);
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
