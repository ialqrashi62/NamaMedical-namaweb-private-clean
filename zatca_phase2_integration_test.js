/**
 * zatca_phase2_integration_test.js
 * Integration tests for ZATCA Phase-2 cryptographic signing, QR codes generation,
 * and transmission logic via mock Express server.
 */
'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const Z = require('./zatca_phase2');
const fe = require('./finance_engine');

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
    console.log('Running ZATCA Phase-2 Integration Tests...');

    // 1. Setup in-memory SQLite DB
    const db = new Database(':memory:');
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS integration_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER,
            integration_name TEXT,
            provider TEXT,
            api_key TEXT,
            api_secret TEXT,
            endpoint_url TEXT,
            is_enabled INTEGER DEFAULT 0,
            config_json TEXT DEFAULT '{}',
            last_sync TEXT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS zatca_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER,
            invoice_number TEXT DEFAULT '',
            invoice_type TEXT DEFAULT 'Standard',
            seller_name TEXT DEFAULT '',
            seller_vat TEXT DEFAULT '',
            buyer_name TEXT DEFAULT '',
            buyer_vat TEXT DEFAULT '',
            total_before_vat REAL DEFAULT 0,
            vat_amount REAL DEFAULT 0,
            total_with_vat REAL DEFAULT 0,
            qr_code TEXT DEFAULT '',
            qr_tlv TEXT DEFAULT '',
            ubl_xml TEXT DEFAULT '',
            xml_hash TEXT DEFAULT '',
            digital_stamp TEXT DEFAULT '',
            submission_status TEXT DEFAULT 'Pending',
            clearance_status TEXT DEFAULT 'NOT_SUBMITTED',
            submission_date TEXT DEFAULT '',
            zatca_response TEXT DEFAULT '',
            tenant_id INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT,
            total REAL,
            patient_name TEXT,
            tenant_id INTEGER
        )
    `);

    // Insert dummy invoice
    db.prepare("INSERT INTO invoices (invoice_number, total, patient_name, tenant_id) VALUES (?, ?, ?, ?)").run('INV-00000001', 115.00, 'Ahmad', 1);

    // 2. Setup Express application
    const app = express();
    app.use(express.json());

    // Mock authentication and tenant context middlewares
    const requireAuth = (req, res, next) => {
        req.session = { user: { id: 10, display_name: 'Test Admin', role: 'Admin' } };
        next();
    };
    
    const requireTenantScope = (req, res, next) => {
        req.tenantId = 1;
        next();
    };

    const e10RequireTenant = (req) => req.tenantId;
    const e10IntId = (v) => parseInt(v, 10);
    const e10Err = (res, e) => res.status(500).json({ error: e.message });
    const logAudit = () => {};
    const e10ZatcaEnabled = () => true;

    const pool = buildMockPool(db);

    // Generate Route (from server.js)
    app.post('/api/zatca/generate', requireAuth, requireTenantScope, async (req, res) => {
        try {
            const tenantId = e10RequireTenant(req);
            const invoiceId = e10IntId(req.body.invoice_id);
            if (!invoiceId) return res.status(422).json({ error: 'Invalid invoice_id' });
            
            const inv = (await pool.query('SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2', [invoiceId, tenantId])).rows[0];
            if (!inv) return res.status(404).json({ error: 'Invoice not found' });

            const vatBreak = fe.vatFromInclusive(inv.total);
            const issueDate = '2026-07-02';
            const issueTime = '12:00:00';
            const sellerName = 'Test Hospital';
            const sellerVat = '300000000000003';
            const invNumber = inv.invoice_number;

            const qrTlv = fe.buildZatcaQR({
                sellerName, sellerVat, timestamp: issueDate + 'T' + issueTime + 'Z',
                total: vatBreak.total_incl, vat: vatBreak.vat_amount
            });
            const ubl = fe.buildUBLInvoice({
                invoiceNumber: invNumber, issueDate, issueTime, invoiceTypeCode: '388',
                sellerName, sellerVat, buyerName: inv.patient_name,
                buyerVat: '', baseExcl: vatBreak.base_excl, vat: vatBreak.vat_amount, total: vatBreak.total_incl,
                currency: 'SAR', stampPlaceholder: 'UNSIGNED-NO-CSID'
            });
            const xmlHash = fe.ublHash(ubl);
            const stampPlaceholder = 'PLACEHOLDER:' + xmlHash.slice(0, 32);

            // Clean previous entry if exists to avoid UNIQUE constraint issue in sqlite test
            await pool.query('DELETE FROM zatca_invoices WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId]);

            const result = await pool.query(
                `INSERT INTO zatca_invoices
                   (invoice_id, invoice_number, seller_name, seller_vat, buyer_name, total_before_vat, vat_amount, total_with_vat,
                    qr_code, qr_tlv, ubl_xml, xml_hash, digital_stamp, submission_status, clearance_status, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,$11,$12,'Generated','NOT_SUBMITTED',$13)`,
                [invoiceId, invNumber, sellerName, sellerVat, inv.patient_name,
                vatBreak.base_excl, vatBreak.vat_amount, vatBreak.total_incl, qrTlv, ubl, xmlHash, stampPlaceholder, tenantId]);

            const inserted = (await pool.query('SELECT * FROM zatca_invoices WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId])).rows[0];
            res.json(inserted);
        } catch (e) { e10Err(res, e); }
    });

    // Submit Route (from server.js, modified)
    app.post('/api/zatca/submit', requireAuth, requireTenantScope, async (req, res) => {
        try {
            const tenantId = e10RequireTenant(req);
            const invoiceId = e10IntId(req.body.invoice_id);
            if (!invoiceId) return res.status(422).json({ error: 'Invalid invoice_id' });
            
            const z = (await pool.query('SELECT * FROM zatca_invoices WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId])).rows[0];
            if (!z) return res.status(404).json({ error: 'E-invoice not generated yet' });
            
            const settings = (await pool.query('SELECT * FROM integration_settings WHERE tenant_id=$1 AND integration_name=$2', [tenantId, 'ZATCA'])).rows[0];
            const isZatcaEnabled = e10ZatcaEnabled() && settings && settings.is_enabled === 1 && settings.api_key && settings.api_secret;
            
            if (!isZatcaEnabled) {
                await pool.query(
                    `UPDATE zatca_invoices 
                     SET clearance_status=$1, submission_status=$2, submission_date=$3, zatca_response=$4 
                     WHERE invoice_id=$5 AND tenant_id=$6`,
                    ['RECORDED', 'Submitted_Mock', new Date().toISOString(), JSON.stringify({ message: 'ZATCA clearance simulated or disabled' }), invoiceId, tenantId]
                );
                return res.json({ 
                    success: true, 
                    clearance_status: 'RECORDED', 
                    submission_status: 'Submitted_Mock', 
                    message: 'ZATCA clearance simulated or disabled (sandbox/mock mode)' 
                });
            }
            
            const zatcaPhase2 = require('./zatca_phase2');
            let configJson = {};
            try {
                configJson = JSON.parse(settings.config_json || '{}');
            } catch (_) {}
            
            const privKey = configJson.private_key_pem;
            const pubKey = configJson.public_key_pem;
            const environment = configJson.environment || 'sandbox';
            
            if (!privKey || !pubKey) {
                return res.status(422).json({ error: 'ZATCA private/public keys are missing in config_json' });
            }
            
            const xmlHash = zatcaPhase2.invoiceHash(z.ubl_xml);
            const signatureB64 = zatcaPhase2.signHashECDSA(xmlHash, privKey);
            const pubDer = zatcaPhase2.publicKeyDer(pubKey);
            
            const qr = zatcaPhase2.buildPhase2QR({
                sellerName: z.seller_name,
                sellerVat: z.seller_vat,
                timestamp: new Date(z.created_at || Date.now()).toISOString().slice(0, 19) + 'Z',
                total: z.total_with_vat,
                vat: z.vat_amount,
                invoiceHashB64: xmlHash,
                signatureB64,
                publicKeyDerBuf: pubDer
            });
            
            const payload = {
                invoiceHash: xmlHash,
                uuid: z.xml_hash ? z.xml_hash.slice(0, 36) : 'dummy-uuid',
                invoice: Buffer.from(z.ubl_xml, 'utf8').toString('base64')
            };
            
            // Mock fetch implementation for test
            const mockFetch = async (url, opts) => {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ clearanceStatus: 'CLEARED', warnings: [] })
                };
            };

            const client = new zatcaPhase2.FatooraClient({
                environment: environment,
                productionCsid: settings.api_key,
                productionSecret: settings.api_secret,
                enabled: true,
                fetchImpl: mockFetch
            });
            
            let result;
            const isSimplified = z.invoice_type && z.invoice_type.toLowerCase() === 'simplified';
            if (isSimplified) {
                result = await client.reportInvoice(payload);
            } else {
                result = await client.clearInvoice(payload);
            }
            
            const clearanceStatus = result.ok ? 'CLEARED' : 'FAILED';
            const submissionStatus = result.ok ? 'Reported' : 'Failed';
            const responseText = JSON.stringify(result.body);
            
            await pool.query(
                `UPDATE zatca_invoices 
                 SET qr_code=$1, xml_hash=$2, digital_stamp=$3, submission_status=$4, clearance_status=$5, submission_date=$6, zatca_response=$7 
                 WHERE invoice_id=$8 AND tenant_id=$9`,
                [qr, xmlHash, signatureB64, submissionStatus, clearanceStatus, new Date().toISOString(), responseText, invoiceId, tenantId]
            );
            
            res.json({
                success: result.ok,
                clearance_status: clearanceStatus,
                submission_status: submissionStatus,
                zatca_response: result.body
            });
        } catch (e) { e10Err(res, e); }
    });

    // Start HTTP server
    const srv = app.listen(0);
    await new Promise(r => srv.once('listening', r));
    const port = srv.address().port;

    // Test 1: Generate E-Invoice XML
    let resGen = await req(port, 'POST', '/api/zatca/generate', { invoice_id: 1 });
    ok('E-invoice generation returns 200', resGen.status === 200);
    ok('Generated UBL XML is not empty', resGen.json.ubl_xml && resGen.json.ubl_xml.length > 0);

    // Test 2: Submit with disabled settings (Mock fallback)
    let resSubmitMock = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 1 });
    ok('Submit returns 200 with mock fallback', resSubmitMock.status === 200);
    ok('Clearance status is RECORDED', resSubmitMock.json.clearance_status === 'RECORDED');

    // Test 3: Submit with active sandbox credentials (Real signing & crypto)
    const keys = Z.generateKeyPair();
    const config_json = JSON.stringify({
        private_key_pem: keys.privateKeyPem,
        public_key_pem: keys.publicKeyPem,
        environment: 'sandbox'
    });
    
    // Seed active ZATCA settings
    db.prepare(`
        INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, is_enabled, config_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'ZATCA', 'ZATCA Sandbox', 'sandbox-csid', 'sandbox-secret', 1, config_json);

    let resSubmitReal = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 1 });
    ok('Submit returns 200 with active credentials', resSubmitReal.status === 200);
    ok('Clearance status is CLEARED', resSubmitReal.json.clearance_status === 'CLEARED');

    // Retrieve database record
    const updatedInvoice = db.prepare("SELECT * FROM zatca_invoices WHERE invoice_id = 1").get();
    ok('QR code generated and saved', updatedInvoice.qr_code.length > 50);
    ok('Digital stamp (ECDSA signature) saved', updatedInvoice.digital_stamp.length > 20);

    srv.close();
    console.log(`ZATCA Phase-2 Integration Tests: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
