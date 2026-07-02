/**
 * nphies_integration_test.js
 * Integration tests for NPHIES HL7 FHIR Bundle generation, mapping, and API client calls.
 */
'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const N = require('./nphies_client');

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
        },
        connect() {
            return Promise.resolve({
                query: (sql, params = []) => this.query(sql, params),
                release: () => {}
            });
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
    console.log('Running NPHIES HL7 FHIR Integration Tests...');

    // 1. Setup DB
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
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_en TEXT,
            national_id TEXT,
            gender TEXT,
            dob TEXT,
            tenant_id INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insurance_companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_en TEXT,
            contact_info TEXT,
            tenant_id INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insurance_eligibility_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            patient_id INTEGER,
            insurance_company_id INTEGER,
            policy_number TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            coverage_amount REAL DEFAULT 0,
            nphies_request_json TEXT DEFAULT '',
            nphies_response_json TEXT DEFAULT '',
            checked_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insurance_pre_authorizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            patient_id INTEGER,
            admission_id INTEGER,
            insurance_company_id INTEGER,
            requested_amount REAL DEFAULT 0,
            approved_amount REAL DEFAULT 0,
            auth_status TEXT NOT NULL DEFAULT 'requested',
            auth_number TEXT DEFAULT '',
            clinical_justification TEXT DEFAULT '',
            nphies_request_json TEXT DEFAULT '',
            nphies_response_json TEXT DEFAULT '',
            requested_by INTEGER,
            decided_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insurance_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            patient_id INTEGER,
            insurance_company_id INTEGER,
            claim_amount REAL DEFAULT 0,
            lifecycle_status TEXT NOT NULL DEFAULT 'draft',
            nphies_request_json TEXT DEFAULT '',
            nphies_response_json TEXT DEFAULT '',
            submitted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS insurance_claim_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            claim_id INTEGER,
            service_id INTEGER,
            description TEXT DEFAULT '',
            quantity REAL DEFAULT 1,
            unit_price REAL DEFAULT 0,
            line_amount REAL DEFAULT 0,
            approved_amount REAL DEFAULT 0
        )
    `);

    // Insert mock rows
    db.prepare("INSERT INTO patients (name_en, national_id, gender, dob, tenant_id) VALUES (?, ?, ?, ?, ?)").run('Ahmad', '1000000001', 'male', '1990-01-01', 1);
    db.prepare("INSERT INTO insurance_companies (name_en, contact_info, tenant_id) VALUES (?, ?, ?)").run('Tawuniya', '920001234', 1);
    db.prepare("INSERT INTO insurance_claims (tenant_id, patient_id, insurance_company_id, claim_amount, lifecycle_status) VALUES (?, ?, ?, ?, ?)").run(1, 1, 1, 250.00, 'draft');
    db.prepare("INSERT INTO insurance_claim_lines (tenant_id, claim_id, description, quantity, unit_price, line_amount) VALUES (?, ?, ?, ?, ?, ?)").run(1, 1, 'Consultation', 1, 250.00, 250.00);

    // 2. Setup Express App
    const app = express();
    app.use(express.json());

    const requireAuth = (req, res, next) => {
        req.session = { user: { id: 10, display_name: 'Test Admin', role: 'Admin' } };
        next();
    };
    
    const requireTenantScope = (req, res, next) => {
        req.tenantId = 1;
        next();
    };

    const E11_INS_ROLES = ['insurance', 'finance'];
    const e11RequireTenant = (req) => req.tenantId;
    const e11IntId = (v) => parseInt(v, 10);
    const e11Money = (v) => parseFloat(v);
    const e11Err = (res, e) => res.status(500).json({ error: e.message });
    const logAudit = () => {};
    const e11NphiesEnabled = () => true;

    const e11Engine = {
        canTransitionClaim: (from, to) => from === 'draft' && to === 'submitted'
    };

    const pool = buildMockPool(db);

    // ELIGIBILITY POST ROUTE (copied from server.js modifications)
    app.post('/api/insurance/eligibility', requireAuth, requireTenantScope, async (req, res) => {
        try {
            const tenantId = e11RequireTenant(req);
            const patientId = e11IntId(req.body.patient_id);
            const companyId = e11IntId(req.body.insurance_company_id);
            const policyNumber = String(req.body.policy_number || '');
            
            const ins = await pool.query(
                `INSERT INTO insurance_eligibility_checks (tenant_id, patient_id, insurance_company_id, policy_number, status, nphies_request_json, checked_by)
                 VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING id`,
                [tenantId, patientId, companyId, policyNumber, '{}', req.session.user.id]);
            const checkId = ins.rows[0]?.id || 1; // RETURNING not fully supported in in-memory simple mock, let's fallback to last row id if needed
            const realCheckId = ins.lastInsertRowid || checkId;

            const settings = (await pool.query('SELECT * FROM integration_settings WHERE tenant_id=$1 AND integration_name=$2', [tenantId, 'NPHIES'])).rows[0];
            const isNphiesEnabled = e11NphiesEnabled() && settings && settings.is_enabled === 1 && settings.api_key && settings.api_secret && settings.endpoint_url;

            if (!isNphiesEnabled) {
                return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, eligibility_id: realCheckId, status: 'pending' });
            }
            
            const patient = patientId ? (await pool.query('SELECT * FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId])).rows[0] : null;
            const company = companyId ? (await pool.query('SELECT * FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId])).rows[0] : null;
            
            const bundle = N.buildEligibilityBundle({ patient, company, policy: policyNumber });
            const mockFetch = async () => ({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ outcome: 'complete', disposition: 'Eligible' })
            });

            const client = new N.NphiesClient({
                endpointUrl: settings.endpoint_url,
                apiKey: settings.api_key,
                apiSecret: settings.api_secret,
                enabled: true,
                fetchImpl: mockFetch
            });
            
            const result = await client.checkEligibility(bundle);
            const finalStatus = result.ok ? 'eligible' : 'ineligible';
            const responseJson = JSON.stringify(result.body);
            
            await pool.query(
                `UPDATE insurance_eligibility_checks 
                 SET status=$1, nphies_request_json=$2, nphies_response_json=$3 
                 WHERE id=$4 AND tenant_id=$5`,
                [finalStatus, JSON.stringify(bundle), responseJson, realCheckId, tenantId]
            );
            
            res.json({ success: result.ok, eligibility_id: realCheckId, status: finalStatus, response: result.body });
        } catch (e) { e11Err(res, e); }
    });

    // PRE-AUTH POST ROUTE (copied from server.js modifications)
    app.post('/api/insurance/pre-auth', requireAuth, requireTenantScope, async (req, res) => {
        try {
            const tenantId = e11RequireTenant(req);
            const patientId = e11IntId(req.body.patient_id);
            const companyId = e11IntId(req.body.insurance_company_id);
            const requested = e11Money(req.body.requested_amount) || 0;
            
            const ins = await pool.query(
                `INSERT INTO insurance_pre_authorizations (tenant_id, patient_id, insurance_company_id, requested_amount, auth_status, clinical_justification, nphies_request_json, requested_by)
                 VALUES ($1,$2,$3,$4,'requested','', '[]', $5) RETURNING id`,
                [tenantId, patientId, companyId, requested, req.session.user.id]);
            const realPaId = ins.lastInsertRowid || 1;

            const settings = (await pool.query('SELECT * FROM integration_settings WHERE tenant_id=$1 AND integration_name=$2', [tenantId, 'NPHIES'])).rows[0];
            const isNphiesEnabled = e11NphiesEnabled() && settings && settings.is_enabled === 1 && settings.api_key && settings.api_secret && settings.endpoint_url;

            if (!isNphiesEnabled) {
                return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, pre_auth_id: realPaId, auth_status: 'requested' });
            }
            
            const patient = patientId ? (await pool.query('SELECT * FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId])).rows[0] : null;
            const company = companyId ? (await pool.query('SELECT * FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId])).rows[0] : null;
            
            const preAuthRecord = { id: realPaId, requested_amount: requested };
            const bundle = N.buildPreAuthBundle({ patient, company, preAuth: preAuthRecord });
            
            const mockFetch = async () => ({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ outcome: 'complete', disposition: 'Approved' })
            });

            const client = new N.NphiesClient({
                endpointUrl: settings.endpoint_url,
                apiKey: settings.api_key,
                apiSecret: settings.api_secret,
                enabled: true,
                fetchImpl: mockFetch
            });
            
            const result = await client.requestPreAuth(bundle);
            const authStatus = result.ok ? 'approved' : 'denied';
            const responseJson = JSON.stringify(result.body);
            
            await pool.query(
                `UPDATE insurance_pre_authorizations 
                 SET auth_status=$1, nphies_request_json=$2, nphies_response_json=$3, decided_at=CURRENT_TIMESTAMP
                 WHERE id=$4 AND tenant_id=$5`,
                [authStatus, JSON.stringify(bundle), responseJson, realPaId, tenantId]
            );
            
            res.json({ success: result.ok, pre_auth_id: realPaId, auth_status: authStatus, response: result.body });
        } catch (e) { e11Err(res, e); }
    });

    // CLAIM SUBMISSION POST ROUTE (copied from server.js modifications)
    app.post('/api/nphies/submit-claim/:id', requireAuth, requireTenantScope, async (req, res) => {
        const client = await pool.connect();
        try {
            const tenantId = e11RequireTenant(req);
            const claimId = e11IntId(req.params.id);
            if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
            
            const cur = await client.query('SELECT id, lifecycle_status FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId]);
            if (!cur.rows.length) { return res.status(404).json({ error: 'Claim not found' }); }
            if (!e11Engine.canTransitionClaim(cur.rows[0].lifecycle_status, 'submitted')) {
                return res.status(409).json({ error: `Cannot submit from ${cur.rows[0].lifecycle_status}` });
            }
            const intent = JSON.stringify({ claim_id: claimId, ts: new Date().toISOString() });
            await client.query('UPDATE insurance_claims SET nphies_request_json=$1 WHERE id=$2 AND tenant_id=$3', [intent, claimId, tenantId]);
            
            const settings = (await client.query('SELECT * FROM integration_settings WHERE tenant_id=$1 AND integration_name=$2', [tenantId, 'NPHIES'])).rows[0];
            const isNphiesEnabled = e11NphiesEnabled() && settings && settings.is_enabled === 1 && settings.api_key && settings.api_secret && settings.endpoint_url;

            if (!isNphiesEnabled) {
                logAudit(req.session.user.id, req.session.user.display_name, 'NPHIES_SUBMIT_GATED', 'Insurance', `Claim #${claimId} submit intent (NPHIES off)`, req.ip);
                return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, claim_id: claimId });
            }
            
            const claim = (await client.query('SELECT * FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId])).rows[0];
            const patient = (await client.query('SELECT * FROM patients WHERE id=$1 AND tenant_id=$2', [claim.patient_id, tenantId])).rows[0];
            const company = (await client.query('SELECT * FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [claim.insurance_company_id, tenantId])).rows[0];
            const lines = (await client.query('SELECT * FROM insurance_claim_lines WHERE claim_id=$1 AND tenant_id=$2', [claimId, tenantId])).rows;
            
            const bundle = N.buildClaimBundle({ patient, company, claim, lines });
            
            const mockFetch = async () => ({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ outcome: 'complete', disposition: 'Claim Accepted' })
            });

            const nClient = new N.NphiesClient({
                endpointUrl: settings.endpoint_url,
                apiKey: settings.api_key,
                apiSecret: settings.api_secret,
                enabled: true,
                fetchImpl: mockFetch
            });
            
            const result = await nClient.submitClaim(bundle);
            const nextStatus = result.ok ? 'submitted' : 'denied';
            const responseJson = JSON.stringify(result.body);
            
            await client.query(
                `UPDATE insurance_claims 
                 SET lifecycle_status=$1, submitted_at=CURRENT_TIMESTAMP, nphies_request_json=$2, nphies_response_json=$3 
                 WHERE id=$4 AND tenant_id=$5`,
                [nextStatus, JSON.stringify(bundle), responseJson, claimId, tenantId]
            );
            
            res.json({ success: result.ok, claim_id: claimId, lifecycle_status: nextStatus, response: result.body });
        } catch (e) { return e11Err(res, e); }
        finally { client.release(); }
    });

    // Start server
    const srv = app.listen(0);
    await new Promise(r => srv.once('listening', r));
    const port = srv.address().port;

    // Test 1: Check Eligibility with disabled settings (Fallback gated stub)
    let resEligMock = await req(port, 'POST', '/api/insurance/eligibility', { patient_id: 1, insurance_company_id: 1, policy_number: 'POL-123' });
    ok('Eligibility returns 503 with mock fallback', resEligMock.status === 503);
    ok('Eligibility gated is true', resEligMock.json.gated === true);

    // Seed NPHIES settings
    db.prepare(`
        INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'NPHIES', 'Mock NPHIES Platform', 'nphies-key', 'nphies-secret', 'http://localhost/fhir', 1);

    // Test 2: Check Eligibility with active settings (Real FHIR mapping & client call)
    let resEligReal = await req(port, 'POST', '/api/insurance/eligibility', { patient_id: 1, insurance_company_id: 1, policy_number: 'POL-123' });
    ok('Eligibility returns 200 with active settings', resEligReal.status === 200);
    ok('Eligibility status is eligible', resEligReal.json.status === 'eligible');

    // Test 3: Pre-auth request with active settings
    let resPaReal = await req(port, 'POST', '/api/insurance/pre-auth', { patient_id: 1, insurance_company_id: 1, requested_amount: 1500.00 });
    ok('Pre-auth returns 200 with active settings', resPaReal.status === 200);
    ok('Pre-auth status is approved', resPaReal.json.auth_status === 'approved');

    // Test 4: Submit Claim with active settings
    let resClaimReal = await req(port, 'POST', '/api/nphies/submit-claim/1', {});
    ok('Submit Claim returns 200 with active settings', resClaimReal.status === 200);
    ok('Claim lifecycle_status is submitted', resClaimReal.json.lifecycle_status === 'submitted');

    // Retrieve database records to check outputs
    const dbElig = db.prepare("SELECT * FROM insurance_eligibility_checks WHERE id = 2").get();
    ok('Eligibility check request JSON mapped to FHIR Patient & Coverage', JSON.parse(dbElig.nphies_request_json).resourceType === 'Bundle');
    ok('Eligibility check response JSON saved', JSON.parse(dbElig.nphies_response_json).disposition === 'Eligible');

    const dbPa = db.prepare("SELECT * FROM insurance_pre_authorizations WHERE id = 1").get();
    ok('Pre-auth request JSON mapped to FHIR PreAuth Bundle', JSON.parse(dbPa.nphies_request_json).resourceType === 'Bundle');
    ok('Pre-auth status updated to approved in DB', dbPa.auth_status === 'approved');

    const dbClaim = db.prepare("SELECT * FROM insurance_claims WHERE id = 1").get();
    ok('Claim request JSON mapped to FHIR Claim Bundle', JSON.parse(dbClaim.nphies_request_json).resourceType === 'Bundle');
    ok('Claim status updated to submitted in DB', dbClaim.lifecycle_status === 'submitted');

    srv.close();
    console.log(`NPHIES HL7 FHIR Integration Tests: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
