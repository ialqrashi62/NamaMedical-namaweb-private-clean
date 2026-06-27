/**
 * e1_cpoe_guard_test.js — E1 CPOE + clinical routes: structural + unit (mock) assertions.
 * No DB/HTTP, no PHI. Run: node e1_cpoe_guard_test.js
 *
 * Covers:
 *  - clinical_cpoe.js exports mountClinicalRoutes; CPOE creates orders via the E-X `orders`/`order_items`
 *    tables in ONE transaction with explicit set_config app.tenant_id (FORCE-RLS safe) + tenant stamping.
 *  - CDS gate: CRITICAL allergy => 422 hard-stop (no DB write); override_reason => order created + CDS_OVERRIDE audit.
 *  - problems/notes routes stamp tenant_id, audit, and validate inputs.
 *  - server.js wires mountClinicalRoutes additively BEFORE the SPA catch-all and requires ./cds + ./clinical_cpoe;
 *    /api/prescriptions enhanced with a CDS gate (422 + override audit); requireRole untouched.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// ---------- 1) static source: clinical_cpoe.js ----------
const src = fs.readFileSync(path.join(__dirname, 'clinical_cpoe.js'), 'utf8');
ok(/module\.exports\s*=\s*{[^}]*mountClinicalRoutes/.test(src), 'clinical_cpoe.js exports mountClinicalRoutes');
ok(src.includes("INSERT INTO orders (tenant_id"), 'CPOE inserts into the E-X orders table, tenant_id first');
ok(src.includes("INSERT INTO order_items (tenant_id"), 'CPOE inserts order_items, tenant_id first');
ok(src.includes("client.query('BEGIN')") && src.includes("client.query('COMMIT')") && src.includes("client.query('ROLLBACK')"),
   'CPOE uses a single transaction (BEGIN/COMMIT/ROLLBACK)');
ok(/set_config\('app\.tenant_id'/.test(src), 'CPOE binds app.tenant_id on the dedicated client (FORCE-RLS safe)');
ok(src.includes('client.release()'), 'CPOE always releases the dedicated client (finally)');
ok(src.includes('cds.evaluateOrder') && src.includes('cds.decide'), 'CPOE runs the CDS engine (evaluateOrder + decide)');
ok(src.includes('res.status(422)') && src.includes('blocked: true'), 'CPOE returns 422 hard-stop with blocked flag on critical');
ok(src.includes("'CDS_BLOCK'") && src.includes("'CDS_OVERRIDE'") && src.includes("'CREATE_ORDER'"),
   'CPOE audits CDS_BLOCK / CDS_OVERRIDE / CREATE_ORDER');
ok(src.includes('SELECT id FROM order_sets WHERE id=$1 AND tenant_id=$2'), 'CPOE validates order_set ownership in-txn (FK-RLS-bypass defense)');
ok(src.includes("INSERT INTO problems (tenant_id"), 'problems INSERT stamps tenant_id first');
ok(src.includes("INSERT INTO clinical_notes (tenant_id"), 'clinical_notes INSERT stamps tenant_id first');
ok(src.includes("'CREATE_PROBLEM'") && src.includes("'CREATE_SOAP_NOTE'") && src.includes("'SIGN_LOCK_SOAP_NOTE'"),
   'problems/notes routes audited');
ok(src.includes("emr_status='locked'") && src.includes('integrity_hash'), 'SOAP sign+lock mirrors medical_records (integrity hash)');

// ---------- 2) static source: server.js wiring ----------
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
ok(server.includes("require('./cds')") && server.includes("require('./clinical_cpoe')"), 'server.js requires ./cds + ./clinical_cpoe');
ok(server.includes('mountClinicalRoutes(app, {'), 'server.js mounts clinical routes');
const mountIdx = server.indexOf('mountClinicalRoutes(app,');
const spaIdx = server.indexOf("app.get('*'");
ok(mountIdx > 0 && spaIdx > 0 && mountIdx < spaIdx, 'clinical routes mounted BEFORE SPA catch-all');
ok(/function requireRole\(\.\.\.modules\)/.test(server), 'requireRole definition untouched');
ok(server.includes("app.post('/api/employees', requireAuth, requireRole('hr')"), 'existing requireRole call site untouched');
// prescriptions CDS gate
ok(server.includes("cds.checkDrugAllergy(medication_name") && server.includes('cds.decide(rxCdsAlerts, override_reason)'),
   '/api/prescriptions enhanced with server-side CDS gate');
ok(/res\.status\(422\)\.json\(\{ error: 'CDS hard-stop', blocked: true/.test(server), '/api/prescriptions returns 422 hard-stop on critical');
// drug-interactions DB augmentation (additive, fail-safe)
ok(server.includes('FROM drug_interactions') && server.includes('cds.mapSeverity'), 'drug-interactions endpoint augmented with DB table (cds.mapSeverity)');

// CRITICAL-1: /api/prescriptions now ALSO runs a server-side drug-drug interaction check against
// the patient's CURRENT active meds derived SERVER-SIDE (never trusted from the client body).
ok(server.includes('async function getPatientActiveMeds('), 'CRITICAL-1: server-side active-meds helper defined (getPatientActiveMeds)');
ok(server.includes('cds.checkDrugDrugInteraction([medication_name].concat(activeMeds))'),
   'CRITICAL-1: prescriptions runs drug-drug interaction (new drug + server-derived active meds)');
ok(server.includes('await getPatientActiveMeds(patient_id, tenantId)'),
   'CRITICAL-1: active meds queried server-side scoped to patient + tenant');
// the helper sources from the authoritative server tables (queue + med orders), NOT the request body
ok(/FROM pharmacy_prescriptions_queue WHERE patient_id=\$1[\s\S]*NOT IN \('Dispensed'/.test(server),
   'CRITICAL-1: active meds include non-dispensed pharmacy queue rows (tenant-scoped)');
ok(/FROM order_items oi JOIN orders o[\s\S]*o\.type='med' AND o\.status IN \('pending','active'\)/.test(server),
   'CRITICAL-1: active meds include active/pending med-type orders (E-X orders table)');
ok(!/req\.body[\s\S]{0,40}active_meds/.test(server), 'CRITICAL-1: prescriptions route does not trust client active_meds');

// CRITICAL-2: clinical_cpoe CPOE no longer trusts client active_meds; derives them server-side.
ok(!/activeMeds: Array\.isArray\(active_meds\)/.test(src), 'CRITICAL-2: CPOE no longer feeds client active_meds into evaluateOrder');
ok(/activeMeds: serverActiveMeds/.test(src), 'CRITICAL-2: CPOE feeds SERVER-derived active meds into evaluateOrder');
ok(/FROM order_items oi JOIN orders o[\s\S]*o\.type='med' AND o\.status IN \('pending','active'\)/.test(src),
   'CRITICAL-2: CPOE derives active meds from active/pending med orders (server-side)');

// IMPORTANT-4: clinical reads FAIL-CLOSED when there is no tenant context (no unfiltered query).
ok((src.match(/if \(!tenantId\) return res\.json\(\[\]\);/g) || []).length >= 2,
   'IMPORTANT-4: GET /api/problems and /api/clinical-notes fail-closed (empty) when tenant context is null');

// ---------- 3) unit: drive mountClinicalRoutes with mocks (no real DB) ----------
(async () => {
    const { mountClinicalRoutes } = require('./clinical_cpoe');
    const cds = require('./cds');

    const routes = {};
    const app = {
        post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; },
        get: (p, ...h) => { routes['GET ' + p] = h[h.length - 1]; },
        patch: (p, ...h) => { routes['PATCH ' + p] = h[h.length - 1]; },
    };

    // Mock pool: pool.query (auto-bound wrapper) + pool.connect (dedicated tx client).
    const sql = [];
    let patientAllergies = 'penicillin';   // tenant patient has a penicillin allergy
    // CRITICAL-2: the patient's REAL active meds live on the SERVER (med orders). The client cannot
    // see or alter this; the test will send an empty/forged active_meds yet the gate must still fire.
    let serverActiveMedOrders = [];        // e.g. [{ catalog_ref: 'Sildenafil' }]
    const client = {
        query: async (text, params) => {
            sql.push(text.replace(/\s+/g, ' ').trim());
            if (/SELECT id FROM patients/.test(text)) return { rows: [{ id: params[0] }], rowCount: 1 };
            if (/INSERT INTO orders/.test(text)) return { rows: [{ id: 777, type: params[4], status: params[5], patient_id: params[3], encounter_id: params[2] }], rowCount: 1 };
            return { rows: [], rowCount: 0 };
        },
        release: () => { sql.push('RELEASE'); },
    };
    const pool = {
        connect: async () => client,
        query: async (text, params) => {
            if (/SELECT allergies FROM patients/.test(text)) return { rows: [{ allergies: patientAllergies }] };
            // CRITICAL-2: server-derived active meds (med-type orders). Authoritative, client-independent.
            if (/FROM order_items oi JOIN orders o/.test(text)) return { rows: serverActiveMedOrders };
            // pharmacy queue source for server-derived active meds (none in this mock)
            if (/FROM pharmacy_prescriptions_queue WHERE patient_id/.test(text)) return { rows: [] };
            if (/FROM orders WHERE patient_id/.test(text)) return { rows: [] };
            if (/SELECT id FROM patients/.test(text)) return { rows: [{ id: (params && params[0]) }] };
            if (/INSERT INTO problems/.test(text)) return { rows: [{ id: 11, status: params[7], description: params[6] }] };
            if (/INSERT INTO clinical_notes/.test(text)) return { rows: [{ id: 22, emr_status: 'draft' }] };
            return { rows: [] };
        },
    };

    const audits = [];
    mountClinicalRoutes(app, {
        pool,
        requireAuth: (req, res, next) => next(),
        requireTenantScope: (req, res, next) => next(),
        getRequestTenantContext: () => ({ tenantId: 5, facilityId: 2 }),
        logAudit: (...a) => audits.push(a),
        requireRole: () => (req, res, next) => next(),
        cds,
    });

    ok(typeof routes['POST /api/cpoe/order'] === 'function', 'POST /api/cpoe/order registered');
    ok(typeof routes['POST /api/problems'] === 'function', 'POST /api/problems registered');
    ok(typeof routes['PATCH /api/problems/:id'] === 'function', 'PATCH /api/problems/:id registered');
    ok(typeof routes['POST /api/clinical-notes'] === 'function', 'POST /api/clinical-notes registered');
    ok(typeof routes['POST /api/clinical-notes/:id/sign'] === 'function', 'POST /api/clinical-notes/:id/sign registered');

    function invoke(handler, body, query, params) {
        return new Promise((resolve) => {
            const req = { body: body || {}, query: query || {}, params: params || {}, session: { user: { id: 3, display_name: 'Dr Y', role: 'Doctor' } }, ip: '127.0.0.1' };
            const res = { _code: 200, status(c) { this._code = c; return this; }, json(p) { resolve({ code: this._code, payload: p }); } };
            handler(req, res);
        });
    }
    const drain = () => new Promise(r => setTimeout(r, 0));

    // 3a: invalid order type -> 400, no transaction
    sql.length = 0;
    const bad = await invoke(routes['POST /api/cpoe/order'], { patient_id: 1, type: 'mri' });
    ok(bad.code === 400, 'CPOE rejects invalid type with 400');
    await drain();
    ok(!sql.includes('BEGIN'), 'CPOE: no transaction opened for invalid type');

    // 3b: CRITICAL allergy med order, NO override_reason -> 422 hard-stop, NO order INSERT
    sql.length = 0; audits.length = 0;
    const blocked = await invoke(routes['POST /api/cpoe/order'], { patient_id: 9, type: 'med', items: [{ catalog_ref: 'Amoxicillin', qty: 1 }] });
    ok(blocked.code === 422 && blocked.payload.blocked === true, 'CPOE: med + penicillin allergy + no reason => 422 hard-stop');
    ok(Array.isArray(blocked.payload.alerts) && blocked.payload.alerts.some(a => a.severity === 'critical'), 'CPOE: 422 returns the critical alert(s)');
    await drain();
    ok(!sql.some(s => /INSERT INTO orders/.test(s)), 'CPOE: NO order row written on hard-stop');
    ok(audits.some(a => a[2] === 'CDS_BLOCK'), 'CPOE: hard-stop audited as CDS_BLOCK');

    // 3c: same order WITH override_reason -> creates order (set_config FIRST, BEGIN, INSERT orders/items, COMMIT) + CDS_OVERRIDE
    sql.length = 0; audits.length = 0;
    const overridden = await invoke(routes['POST /api/cpoe/order'], { patient_id: 9, type: 'med', items: [{ catalog_ref: 'Amoxicillin', qty: 1 }], override_reason: 'No alternative; patient tolerated previously' });
    ok(overridden.code === 200 && overridden.payload.id === 777, 'CPOE: override_reason => order created (200)');
    await drain();
    const begin = sql.indexOf('BEGIN');
    const setcfg = sql.findIndex(s => /set_config\('app.tenant_id', \$1, false\)/.test(s));
    const insOrder = sql.findIndex(s => /INSERT INTO orders/.test(s));
    const insItem = sql.findIndex(s => /INSERT INTO order_items/.test(s));
    const commit = sql.indexOf('COMMIT');
    ok(setcfg >= 0 && setcfg < begin, 'CPOE: set_config app.tenant_id BEFORE BEGIN');
    ok(begin < insOrder && insOrder < insItem && insItem < commit, 'CPOE: BEGIN -> INSERT orders -> INSERT items -> COMMIT order');
    ok(sql[sql.length - 1] === 'RELEASE' || sql.includes('RELEASE'), 'CPOE: client released');
    ok(audits.some(a => a[2] === 'CREATE_ORDER'), 'CPOE: success audited as CREATE_ORDER');
    ok(audits.some(a => a[2] === 'CDS_OVERRIDE'), 'CPOE: override audited as CDS_OVERRIDE');

    // 3d: non-med safe order (lab) -> created, no critical block
    sql.length = 0; audits.length = 0;
    const lab = await invoke(routes['POST /api/cpoe/order'], { patient_id: 9, type: 'lab', items: [{ catalog_ref: 'CBC', qty: 1 }] });
    ok(lab.code === 200, 'CPOE: lab order with no critical alert => 200');

    // 3d-1: CRITICAL-2 — client-supplied active_meds CANNOT hide an interaction. The patient is
    //       already on Sildenafil (server-side med order). The client orders a Nitrate and forges an
    //       EMPTY active_meds (omitting the Sildenafil) to dodge the gate. The server must STILL derive
    //       the real list and 422 on the fatal Nitrate+Sildenafil combo. No allergy here.
    patientAllergies = '';
    serverActiveMedOrders = [{ catalog_ref: 'Sildenafil' }];
    sql.length = 0; audits.length = 0;
    const spoofed = await invoke(routes['POST /api/cpoe/order'], {
        patient_id: 9, type: 'med', items: [{ catalog_ref: 'Nitroglycerin', qty: 1 }],
        active_meds: [],                 // FORGED: client omits the dangerous Sildenafil
    });
    ok(spoofed.code === 422 && spoofed.payload.blocked === true,
       'CRITICAL-2: forged empty active_meds cannot hide Nitrate+Sildenafil — server derives list => 422');
    ok(Array.isArray(spoofed.payload.alerts) && spoofed.payload.alerts.some(a => a.rule === 'drug-drug' && a.severity === 'critical'),
       'CRITICAL-2: 422 carries the critical drug-drug interaction');
    await drain();
    ok(!sql.some(s => /INSERT INTO orders/.test(s)), 'CRITICAL-2: NO order written on the spoofed interaction hard-stop');

    // 3d-2: same order WITH override_reason -> proceeds (200) + CDS_OVERRIDE audited
    sql.length = 0; audits.length = 0;
    const spoofedOverride = await invoke(routes['POST /api/cpoe/order'], {
        patient_id: 9, type: 'med', items: [{ catalog_ref: 'Nitroglycerin', qty: 1 }],
        active_meds: [], override_reason: 'Cardiology aware; nitrate-free interval enforced',
    });
    ok(spoofedOverride.code === 200, 'CRITICAL-2: interaction proceeds with explicit override reason (200)');
    await drain();
    ok(audits.some(a => a[2] === 'CDS_OVERRIDE'), 'CRITICAL-2: override audited as CDS_OVERRIDE');
    // reset shared mock state for subsequent cases
    patientAllergies = 'penicillin';
    serverActiveMedOrders = [];

    // 3e: problems POST validation + tenant stamping
    const probBad = await invoke(routes['POST /api/problems'], { patient_id: 9 });
    ok(probBad.code === 400, 'problems: missing description => 400');
    sql.length = 0; audits.length = 0;
    const prob = await invoke(routes['POST /api/problems'], { patient_id: 9, description: 'Hypertension', icd10: 'I10' });
    ok(prob.code === 200 && prob.payload.id === 11, 'problems: valid create => 200');
    ok(audits.some(a => a[2] === 'CREATE_PROBLEM'), 'problems: create audited');

    // 3f: clinical-notes create + audit
    sql.length = 0; audits.length = 0;
    const note = await invoke(routes['POST /api/clinical-notes'], { patient_id: 9, subjective: 'cough', assessment: 'URTI' });
    ok(note.code === 200 && note.payload.id === 22, 'clinical-notes: valid create => 200');
    ok(audits.some(a => a[2] === 'CREATE_SOAP_NOTE'), 'clinical-notes: create audited');

    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
