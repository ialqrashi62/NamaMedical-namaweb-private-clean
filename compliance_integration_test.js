/**
 * compliance_integration_test.js
 * Integration tests for Jumanasoft SaaS Saudi Compliance (ZATCA, NPHIES, CBAHI, PDPL)
 * seeding, dynamic toggle configuration, and schema عزل المستأجرين (tenant isolation).
 */
'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) {
        pass++;
        console.log(`  PASS: ${name}`);
    } else {
        fail++;
        console.error(`  FAIL: ${name}`);
    }
}

// Mock pool wrapper similar to server.js
function buildMockPool(db) {
    return {
        query(sql, params = []) {
            // Translate PG placeholders ($1, $2, etc.) to SQLite (?)
            let sqliteSql = sql;
            if (params.length > 0) {
                sqliteSql = sql.replace(/\$(\d+)/g, '?');
            }
            try {
                if (sql.trim().toLowerCase().startsWith('select')) {
                    const stmt = db.prepare(sqliteSql);
                    const rows = stmt.all(...params);
                    return Promise.resolve({ rows });
                } else {
                    const stmt = db.prepare(sqliteSql);
                    const info = stmt.run(...params);
                    return Promise.resolve({ rows: [], lastInsertRowid: info.lastInsertRowid, affectedRows: info.changes });
                }
            } catch (err) {
                return Promise.reject(err);
            }
        }
    };
}

async function req(port, method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
        const options = {
            host: '127.0.0.1',
            port,
            method,
            path,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        const r = http.request(options, (res) => {
            let resBody = '';
            res.on('data', d => resBody += d);
            res.on('end', () => {
                let json;
                try { json = JSON.parse(resBody); } catch { json = {}; }
                resolve({ status: res.statusCode, json });
            });
        });
        if (body) {
            r.write(JSON.stringify(body));
        }
        r.end();
    });
}

(async () => {
    console.log('Running Saudi Compliance Integration Tests...');

    // 1. Setup in-memory SQLite DB
    const db = new Database(':memory:');
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS integration_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER,
            integration_name TEXT DEFAULT '',
            provider TEXT DEFAULT '',
            api_key TEXT DEFAULT '',
            api_secret TEXT DEFAULT '',
            endpoint_url TEXT DEFAULT '',
            is_enabled INTEGER DEFAULT 0,
            config_json TEXT DEFAULT '',
            last_sync TEXT DEFAULT ''
        )
    `);

    // Seed default integrations
    const insertInt = db.prepare(`
        INSERT INTO integration_settings (tenant_id, integration_name, provider, endpoint_url, is_enabled, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertInt.run(1, 'ZATCA', 'ZATCA', 'https://gw-fatoora.zatca.gov.sa/sdk/api/v2', 1, '{}');
    insertInt.run(1, 'NPHIES', 'NPHIES', 'https://nphies.sa/api/v1/fhir', 1, '{}');
    insertInt.run(1, 'CBAHI', 'CBAHI', 'https://cbahi.gov.sa/api/v1', 0, '{}');
    insertInt.run(1, 'PDPL', 'Jumanasoft-Sec', 'https://www.jumanasoft.com/api/pdpl', 1, '{}');

    // Verify seeding succeeded
    const count = db.prepare("SELECT COUNT(*) as cnt FROM integration_settings WHERE tenant_id = 1").get().cnt;
    ok('Integrations seeded successfully for tenant 1', count === 4);

    // 2. Setup Express application
    const app = express();
    app.use(express.json());

    // Mock authentication and tenant context middlewares
    let sessionUser = { id: 10, display_name: 'Test Admin', role: 'Admin' };
    const requireAuth = (req, res, next) => {
        req.session = { user: sessionUser };
        next();
    };
    
    const requireTenantContext = (req, res, next) => {
        const tid = req.headers['x-tenant-id'] || '1';
        req.tenantId = parseInt(tid, 10);
        next();
    };

    const logAudit = () => {};
    const pool = buildMockPool(db);

    // Mount compliance API routes
    app.get('/api/settings/integrations', requireAuth, requireTenantContext, async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const result = await pool.query('SELECT * FROM integration_settings WHERE tenant_id = $1', [tenantId]);
            res.json(result.rows);
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    app.post('/api/settings/integrations', requireAuth, requireTenantContext, async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json } = req.body;
            if (!integration_name) return res.status(400).json({ error: 'Missing integration_name' });

            try {
                JSON.parse(config_json || '{}');
            } catch (_) {
                return res.status(400).json({ error: 'Invalid config_json format' });
            }

            const exists = (await pool.query('SELECT id FROM integration_settings WHERE tenant_id = $1 AND integration_name = $2', [tenantId, integration_name])).rows[0];
            if (exists) {
                await pool.query(
                    `UPDATE integration_settings 
                     SET provider = $1, api_key = $2, api_secret = $3, endpoint_url = $4, is_enabled = $5, config_json = $6, last_sync = 'MOCK_TIMESTAMP'
                     WHERE tenant_id = $7 AND integration_name = $8`,
                    [provider, api_key, api_secret, endpoint_url, parseInt(is_enabled) || 0, config_json || '{}', tenantId, integration_name]
                );
            } else {
                await pool.query(
                    `INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MOCK_TIMESTAMP')`,
                    [tenantId, integration_name, provider, api_key, api_secret, endpoint_url, parseInt(is_enabled) || 0, config_json || '{}']
                );
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Start HTTP server
    const srv = app.listen(0);
    await new Promise(r => srv.once('listening', r));
    const port = srv.address().port;

    // Test A: Get integrations for tenant 1
    let resGet1 = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '1' });
    ok('GET integrations returns 200', resGet1.status === 200);
    ok('GET integrations returns 4 seeded modules', resGet1.json.length === 4);
    ok('GET integrations contains ZATCA', resGet1.json.some(i => i.integration_name === 'ZATCA'));

    // Test B: Modify integration settings (Toggle/Update)
    let resPost = await req(port, 'POST', '/api/settings/integrations', {
        integration_name: 'ZATCA',
        provider: 'ZATCA Sandbox',
        endpoint_url: 'https://new-endpoint.zatca',
        is_enabled: 1,
        config_json: '{"sandbox": true}'
    }, { 'x-tenant-id': '1' });
    ok('POST updates ZATCA configuration successfully', resPost.status === 200 && resPost.json.success === true);

    // Verify change in GET
    let resGet2 = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '1' });
    const updatedZatca = resGet2.json.find(i => i.integration_name === 'ZATCA');
    ok('ZATCA changes persisted', updatedZatca.provider === 'ZATCA Sandbox' && updatedZatca.endpoint_url === 'https://new-endpoint.zatca');

    // Test C: Tenant isolation (different tenant x-tenant-id: 2)
    let resGetTenant2 = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '2' });
    ok('Tenant 2 has empty integrations initially', resGetTenant2.status === 200 && resGetTenant2.json.length === 0);

    // Add ZATCA for tenant 2
    let resPostTenant2 = await req(port, 'POST', '/api/settings/integrations', {
        integration_name: 'ZATCA',
        provider: 'ZATCA Prod',
        is_enabled: 0,
        config_json: '{}'
    }, { 'x-tenant-id': '2' });
    ok('POST adds configuration for Tenant 2', resPostTenant2.status === 200);

    // Verify isolation: tenant 1 is unaffected, tenant 2 has its own record
    let check1 = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '1' });
    let check2 = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '2' });
    ok('Tenant 1 has ZATCA with Sandbox provider', check1.json.find(i => i.integration_name === 'ZATCA').provider === 'ZATCA Sandbox');
    ok('Tenant 2 has ZATCA with Prod provider', check2.json.find(i => i.integration_name === 'ZATCA').provider === 'ZATCA Prod');

    // Test D: Invalid JSON payload rejected with 400
    let resPostBadJson = await req(port, 'POST', '/api/settings/integrations', {
        integration_name: 'ZATCA',
        config_json: '{invalid-json: true}'
    }, { 'x-tenant-id': '1' });
    ok('POST rejects invalid config_json format with 400', resPostBadJson.status === 400);

    srv.close();
    console.log(`Saudi Compliance Integration Tests: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
