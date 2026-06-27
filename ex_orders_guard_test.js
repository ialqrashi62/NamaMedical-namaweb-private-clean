/**
 * ex_orders_guard_test.js — E-X1 unified orders: structural + unit assertions.
 * No DB/HTTP, no PHI. Run: node ex_orders_guard_test.js
 *
 * Covers:
 *  - orders.js exports mountOrderRoutes + VALID_TYPES (lab/rad/med/consult).
 *  - POST handler: single transaction (BEGIN/COMMIT/ROLLBACK), explicit set_config app.tenant_id on the
 *    dedicated client (FORCE-RLS safe), tenant_id stamped on INSERT, CREATE_ORDER audit, type CHECK validation.
 *  - server.js wires mountOrderRoutes additively (require + mount) and does NOT touch requireRole call sites.
 *  - mountOrderRoutes builds the route via a mock app and exercises type-validation + transaction order
 *    against a mock pool/client (unit-level behavior, no real DB).
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// ---------- 1) static source assertions on orders.js ----------
const ordersSrc = fs.readFileSync(path.join(__dirname, 'orders.js'), 'utf8');
ok(/module\.exports\s*=\s*{[^}]*mountOrderRoutes/.test(ordersSrc), 'orders.js exports mountOrderRoutes');
ok(/VALID_TYPES\s*=\s*\[\s*'lab',\s*'rad',\s*'med',\s*'consult'\s*\]/.test(ordersSrc), 'VALID_TYPES = lab/rad/med/consult (matches DB CHECK)');
ok(ordersSrc.includes("client.query('BEGIN')") && ordersSrc.includes("client.query('COMMIT')") && ordersSrc.includes("client.query('ROLLBACK')"),
   'POST uses a single transaction (BEGIN/COMMIT/ROLLBACK)');
ok(/set_config\('app\.tenant_id'/.test(ordersSrc), "POST sets app.tenant_id on the dedicated client (FORCE-RLS safe)");
ok(/INSERT INTO orders \(tenant_id/.test(ordersSrc), 'orders INSERT stamps tenant_id first');
ok(/INSERT INTO order_items \(tenant_id/.test(ordersSrc), 'order_items INSERT stamps tenant_id');
ok(ordersSrc.includes("'CREATE_ORDER'"), 'POST audited (CREATE_ORDER)');
ok(ordersSrc.includes("VALID_TYPES.includes(type)"), 'POST validates type against VALID_TYPES (400 on bad type)');
// I2: status validation, mirroring VALID_TYPES
ok(/VALID_STATUSES\s*=\s*\[\s*'pending',\s*'active',\s*'completed',\s*'cancelled'\s*\]/.test(ordersSrc), 'VALID_STATUSES = pending/active/completed/cancelled (matches DB CHECK)');
ok(ordersSrc.includes('VALID_STATUSES.includes(orderStatus)'), 'POST validates status against VALID_STATUSES (400 on bad status)');
ok(/module\.exports\s*=\s*{[^}]*VALID_STATUSES/.test(ordersSrc), 'orders.js exports VALID_STATUSES');
// C1: order_set ownership validated in-txn before INSERT (RLS-bypass-via-FK defense)
ok(/SELECT id FROM order_sets WHERE id=\$1 AND tenant_id=\$2/.test(ordersSrc), 'C1: POST validates order_set tenant ownership before INSERT (FK-RLS-bypass defense)');
ok(ordersSrc.includes("'Invalid order_set'"), 'C1: cross-tenant order_set -> 400 Invalid order_set');
ok(ordersSrc.includes("requirePermission('orders:create')"), 'POST guarded by requirePermission(orders:create) when provided');
ok(ordersSrc.includes("requirePermission('orders:view')"), 'GET guarded by requirePermission(orders:view) when provided');
ok(/encounter_id \|\| null/.test(ordersSrc), 'encounter_id is nullable (no encounters parent table yet)');
ok(ordersSrc.includes('client.release()'), 'dedicated client always released (finally)');

// ---------- 2) static source assertions on server.js wiring ----------
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
ok(serverSrc.includes("require('./orders')") && serverSrc.includes('mountOrderRoutes'), 'server.js requires + mounts orders module');
ok(serverSrc.includes('mountOrderRoutes(app, { pool, requireAuth, requireTenantScope, getRequestTenantContext, logAudit, requirePermission })'),
   'mountOrderRoutes wired with auth + tenant scope + permission guard');
// mounted before SPA catch-all
const mountIdx = serverSrc.indexOf('mountOrderRoutes(app,');
const spaIdx = serverSrc.indexOf("app.get('*'");
ok(mountIdx > 0 && spaIdx > 0 && mountIdx < spaIdx, 'orders routes mounted BEFORE SPA catch-all');
// non-breaking: requireRole definition + employee call sites untouched
ok(serverSrc.includes("app.post('/api/employees', requireAuth, requireRole('hr')"), 'existing requireRole call site (POST /api/employees) untouched');
ok(/function requireRole\(\.\.\.modules\)/.test(serverSrc), 'requireRole definition untouched');

// ---------- 3) unit: drive mountOrderRoutes with mocks (no real DB) ----------
(async () => {
    const { mountOrderRoutes, VALID_TYPES } = require('./orders');
    ok(Array.isArray(VALID_TYPES) && VALID_TYPES.length === 4, 'VALID_TYPES exported as 4-item array');

    // mock express app: capture POST handler
    const routes = {};
    const app = {
        post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; },
        get: (p, ...h) => { routes['GET ' + p] = h[h.length - 1]; },
    };
    // mock transaction-capable pool.
    // `ownedSetId` controls which order_set id the mock "owns" for the tenant (C1 cross-tenant simulation).
    const sql = [];
    let ownedSetId = 99; // the tenant owns order_set 99; anything else is cross-tenant -> rowCount 0
    const client = {
        query: async (text, params) => {
            sql.push(text.replace(/\s+/g, ' ').trim());
            if (/SELECT id FROM patients/.test(text)) return { rows: [{ id: params[0] }], rowCount: 1 };
            if (/SELECT id FROM order_sets/.test(text)) {
                const owns = params[0] === ownedSetId;
                return { rows: owns ? [{ id: params[0] }] : [], rowCount: owns ? 1 : 0 };
            }
            if (/INSERT INTO orders/.test(text)) return { rows: [{ id: 555, type: params[4], status: params[5], patient_id: params[3], encounter_id: params[2] }], rowCount: 1 };
            return { rows: [], rowCount: 0 };
        },
        release: () => { sql.push('RELEASE'); },
    };
    const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
    let auditCalled = null;
    mountOrderRoutes(app, {
        pool,
        requireAuth: (req, res, next) => next(),
        requireTenantScope: (req, res, next) => next(),
        getRequestTenantContext: () => ({ tenantId: 7, facilityId: 3 }),
        logAudit: (...a) => { auditCalled = a; },
    });
    ok(typeof routes['POST /api/orders'] === 'function', 'POST /api/orders registered');
    ok(typeof routes['GET /api/orders'] === 'function', 'GET /api/orders registered');

    // helper to invoke a handler with a mock req/res
    function invoke(handler, body) {
        return new Promise((resolve) => {
            const req = { body, query: {}, session: { user: { id: 9, display_name: 'Dr X', role: 'Doctor' } }, ip: '127.0.0.1' };
            const res = {
                _code: 200,
                status(c) { this._code = c; return this; },
                json(payload) { resolve({ code: this._code, payload }); },
            };
            handler(req, res);
        });
    }

    // 3a: invalid type -> 400, no transaction
    sql.length = 0;
    const bad = await invoke(routes['POST /api/orders'], { patient_id: 1, type: 'xray' });
    ok(bad.code === 400, 'POST rejects invalid type with 400');
    ok(!sql.some(s => s === 'BEGIN'), 'no transaction opened for invalid type');

    // 3b: missing patient_id -> 400
    const noPatient = await invoke(routes['POST /api/orders'], { type: 'lab' });
    ok(noPatient.code === 400, 'POST rejects missing patient_id with 400');

    // 3c: valid order -> set_config FIRST, then BEGIN, INSERT orders, INSERT items, COMMIT
    sql.length = 0; auditCalled = null;
    const good = await invoke(routes['POST /api/orders'], { patient_id: 42, type: 'lab', items: [{ catalog_ref: 'CBC', qty: 2 }] });
    // res.json resolves before the handler's finally block runs; let the microtask/timer queue drain.
    await new Promise(r => setTimeout(r, 10));
    ok(good.code === 200, 'POST valid order returns 200');
    ok(/set_config\('app\.tenant_id', \$1/.test(sql[0]), 'app.tenant_id bound on client BEFORE any data query');
    const beginAt = sql.findIndex(s => s === 'BEGIN');
    const ordAt = sql.findIndex(s => /INSERT INTO orders/.test(s));
    const itemAt = sql.findIndex(s => /INSERT INTO order_items/.test(s));
    const commitAt = sql.findIndex(s => s === 'COMMIT');
    ok(beginAt >= 0 && ordAt > beginAt && itemAt > ordAt && commitAt > itemAt, 'order: BEGIN -> INSERT orders -> INSERT order_items -> COMMIT (single txn)');
    ok(auditCalled && auditCalled[2] === 'CREATE_ORDER', 'CREATE_ORDER audit fired on success');
    ok(sql[sql.length - 1] === 'RELEASE' && /set_config\('app\.tenant_id', ''/.test(sql[sql.length - 2]), 'tenant_id reset + client released in finally');

    // 3d (I2): invalid status -> 400, no transaction opened
    sql.length = 0;
    const badStatus = await invoke(routes['POST /api/orders'], { patient_id: 42, type: 'lab', status: 'frozen' });
    ok(badStatus.code === 400 && badStatus.payload && badStatus.payload.error === 'Invalid order status', 'I2: invalid status -> 400 Invalid order status');
    ok(!sql.some(s => s === 'BEGIN'), 'I2: no transaction opened for invalid status');

    // 3e (I2): absent status defaults to 'pending' on the orders INSERT
    sql.length = 0;
    await invoke(routes['POST /api/orders'], { patient_id: 42, type: 'lab' });
    await new Promise(r => setTimeout(r, 10));
    {
        const insertIdx = sql.findIndex(s => /INSERT INTO orders/.test(s));
        ok(insertIdx >= 0, 'I2: orders INSERT reached when status absent');
    }

    // 3f (C1): order_set owned by THIS tenant -> proceeds (BEGIN .. set ownership check .. INSERT .. COMMIT)
    sql.length = 0;
    const okSet = await invoke(routes['POST /api/orders'], { patient_id: 42, type: 'lab', order_set_id: ownedSetId, items: [] });
    await new Promise(r => setTimeout(r, 10));
    ok(okSet.code === 200, 'C1: own-tenant order_set -> 200');
    {
        const setChkAt = sql.findIndex(s => /SELECT id FROM order_sets/.test(s));
        const ordAt2 = sql.findIndex(s => /INSERT INTO orders/.test(s));
        ok(setChkAt >= 0 && ordAt2 > setChkAt, 'C1: order_set ownership checked BEFORE orders INSERT');
    }

    // 3g (C1): order_set from ANOTHER tenant -> 400 + ROLLBACK, no orders INSERT (no cross-tenant insert)
    sql.length = 0;
    const crossSet = await invoke(routes['POST /api/orders'], { patient_id: 42, type: 'lab', order_set_id: 12345, items: [] });
    await new Promise(r => setTimeout(r, 10));
    ok(crossSet.code === 400 && crossSet.payload && crossSet.payload.error === 'Invalid order_set', 'C1: cross-tenant order_set -> 400 Invalid order_set');
    ok(sql.some(s => s === 'ROLLBACK'), 'C1: cross-tenant order_set -> ROLLBACK issued');
    ok(!sql.some(s => /INSERT INTO orders/.test(s)), 'C1: NO orders INSERT for cross-tenant order_set (no cross-tenant insert)');

    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
