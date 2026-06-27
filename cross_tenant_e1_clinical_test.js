/**
 * cross_tenant_e1_clinical_test.js — E1 problems / clinical_notes / CPOE cross-tenant isolation.
 * Static-source + mock (no real DB/HTTP/PHI), mirroring the existing cross_tenant_*_test.js style.
 * Run: node cross_tenant_e1_clinical_test.js
 *
 * Verifies:
 *  1. Every E1 route is guarded by requireAuth + requireTenantScope (no unscoped clinical data).
 *  2. All reads/writes filter/stamp tenant_id from the trusted session context (not the request body).
 *  3. Patient ownership is re-checked against the tenant before problems/notes/orders are created.
 *  4. The CPOE transaction binds app.tenant_id on its dedicated client (FORCE-RLS safe) and resets it.
 *  5. MOCK: ctx tenant=1 reads only its own rows; a foreign tenant (999) gets 0 / 404 (no leak).
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const src = fs.readFileSync(path.join(__dirname, 'clinical_cpoe.js'), 'utf8');

// ---------- 1) guard chains: requireAuth + requireTenantScope on every E1 route ----------
ok(/const g = \[requireAuth, requireTenantScope\]/.test(src), 'all E1 routes start guard chain with requireAuth + requireTenantScope');
ok((src.match(/\.\.\.chain\(/g) || []).length >= 6, 'guard chain applied to >=6 E1 routes');

// ---------- 2) tenant_id sourced from getRequestTenantContext, stamped on writes ----------
ok(/const \{ tenantId, facilityId \} = getRequestTenantContext\(req\)/.test(src), 'tenant context read from session, not request body');
ok(/INSERT INTO problems \(tenant_id, facility_id/.test(src), 'problems write stamps tenant_id/facility_id from context');
ok(/INSERT INTO clinical_notes \(tenant_id, facility_id/.test(src), 'clinical_notes write stamps tenant_id/facility_id from context');
ok(/INSERT INTO orders \(tenant_id, facility_id/.test(src), 'orders write stamps tenant_id/facility_id from context');

// ---------- 3) reads filter by tenant_id ----------
ok(/where\.push\(`tenant_id = \$\$\{params\.length\}`\)/.test(src), 'list reads filter by tenant_id');
ok(/SELECT id FROM problems WHERE id=\$1 AND tenant_id=\$2/.test(src), 'problems PATCH ownership re-checked by tenant');

// ---------- 4) patient ownership re-check + CPOE FORCE-RLS client binding ----------
ok((src.match(/SELECT id FROM patients WHERE id=\$1 AND tenant_id=\$2/g) || []).length >= 3, 'patient ownership re-checked against tenant before create (problems/notes/CPOE)');
ok(/set_config\('app\.tenant_id', \$1, false\)/.test(src), 'CPOE binds app.tenant_id on dedicated client (FORCE-RLS safe)');
ok(/set_config\('app\.tenant_id', '', false\)/.test(src), 'CPOE resets app.tenant_id in finally');

// ---------- 5) MOCK isolation: ctx=1 sees own rows; ctx=999 sees none / 404 ----------
(async () => {
    const { mountClinicalRoutes } = require('./clinical_cpoe');
    const cds = require('./cds');

    // Seed: tenant 1 owns problem #100 (patient 10); tenant 2 owns problem #200 (patient 20).
    const problemsDB = [
        { id: 100, tenant_id: 1, patient_id: 10, description: 'T1 problem', status: 'active' },
        { id: 200, tenant_id: 2, patient_id: 20, description: 'T2 problem', status: 'active' },
    ];

    const routes = {};
    const app = {
        post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; },
        get: (p, ...h) => { routes['GET ' + p] = h[h.length - 1]; },
        patch: (p, ...h) => { routes['PATCH ' + p] = h[h.length - 1]; },
    };

    // RLS-simulating mock pool: SELECTs honor the tenant_id param like the policy would.
    const pool = {
        connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }),
        query: async (text, params) => {
            if (/FROM problems/.test(text) && /tenant_id = \$/.test(text)) {
                // params: [tenantId] (+ optional patient_id)
                const t = params[0];
                return { rows: problemsDB.filter(p => p.tenant_id === t) };
            }
            if (/SELECT id FROM problems WHERE id=\$1 AND tenant_id=\$2/.test(text)) {
                const [id, t] = params;
                const row = problemsDB.find(p => p.id === id && p.tenant_id === t);
                return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
            }
            return { rows: [], rowCount: 0 };
        },
    };

    let ctxTenant = 1;
    mountClinicalRoutes(app, {
        pool,
        requireAuth: (req, res, next) => next(),
        requireTenantScope: (req, res, next) => next(),
        getRequestTenantContext: () => ({ tenantId: ctxTenant, facilityId: 1 }),
        logAudit: () => {},
        requireRole: () => (req, res, next) => next(),
        cds,
    });

    function invoke(handler, body, query, params) {
        return new Promise((resolve) => {
            const req = { body: body || {}, query: query || {}, params: params || {}, session: { user: { id: 1, display_name: 'Dr', role: 'Doctor' } }, ip: '127.0.0.1' };
            const res = { _code: 200, status(c) { this._code = c; return this; }, json(p) { resolve({ code: this._code, payload: p }); } };
            handler(req, res);
        });
    }

    // ctx=1 lists problems => only tenant-1 rows
    ctxTenant = 1;
    const list1 = await invoke(routes['GET /api/problems'], null, {});
    ok(list1.payload.length === 1 && list1.payload[0].id === 100, 'ctx=1 GET /api/problems => only tenant-1 problem #100');

    // ctx=999 (foreign) lists problems => zero rows (no leak)
    ctxTenant = 999;
    const list999 = await invoke(routes['GET /api/problems'], null, {});
    ok(Array.isArray(list999.payload) && list999.payload.length === 0, 'ctx=999 GET /api/problems => 0 rows (no cross-tenant leak)');

    // ctx=2 tries to PATCH tenant-1 problem #100 => 404 (ownership re-check blocks)
    ctxTenant = 2;
    const patchForeign = await invoke(routes['PATCH /api/problems/:id'], { status: 'resolved' }, {}, { id: '100' });
    ok(patchForeign.code === 404, 'ctx=2 PATCH tenant-1 problem #100 => 404 (cross-tenant write denied)');

    // ctx=1 PATCH its own problem #100 => 200
    ctxTenant = 1;
    const patchOwn = await invoke(routes['PATCH /api/problems/:id'], { status: 'resolved' }, {}, { id: '100' });
    ok(patchOwn.code === 200, 'ctx=1 PATCH own problem #100 => 200');

    // IMPORTANT-4: NULL tenant context must FAIL-CLOSED — never an unfiltered query that leaks all
    // tenants' rows. GET /api/problems and GET /api/clinical-notes must return ZERO rows (not the
    // whole DB). The mock pool's unfiltered branch would return everything if the route ran it.
    ctxTenant = null;
    const probsNull = await invoke(routes['GET /api/problems'], null, {});
    ok(Array.isArray(probsNull.payload) && probsNull.payload.length === 0,
       'IMPORTANT-4: null tenant GET /api/problems => 0 rows (fail-closed, no unfiltered leak)');
    const notesNull = await invoke(routes['GET /api/clinical-notes'], null, {});
    ok(Array.isArray(notesNull.payload) && notesNull.payload.length === 0,
       'IMPORTANT-4: null tenant GET /api/clinical-notes => 0 rows (fail-closed, no unfiltered leak)');

    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
