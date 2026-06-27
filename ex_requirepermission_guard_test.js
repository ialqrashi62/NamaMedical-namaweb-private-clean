/**
 * ex_requirepermission_guard_test.js — E-X3 requirePermission middleware: unit + structural assertions.
 * No DB/HTTP, no PHI. Run: node ex_requirepermission_guard_test.js
 *
 * Covers (with a mock pool — no real DB):
 *  - unauthenticated -> 401.
 *  - Admin short-circuit -> next() (no DB query, mirrors ROLE_PERMISSIONS '*').
 *  - matrix HIT (role has the key) -> next().
 *  - matrix explicit-miss (role has rows but NOT the key) -> 403 (no bypass).
 *  - matrix EMPTY for role -> non-breaking fallback to roleFallback (allow or deny).
 *  - empty matrix + NO fallback -> open (preserves pre-matrix behavior).
 *  - DB error -> fail-closed to fallback.
 *  - server.js wires requirePermission additively without touching requireRole.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const { makeRequirePermission } = require('./rbac');

function makeRes() {
    return { _code: 200, _json: null, status(c) { this._code = c; return this; }, json(p) { this._json = p; return this; } };
}
function run(mw, req) {
    return new Promise((resolve) => {
        const res = makeRes();
        let nexted = false;
        const next = () => { nexted = true; resolve({ nexted, code: res._code, json: res._json }); };
        const maybe = mw(req, res, next);
        if (maybe && typeof maybe.then === 'function') maybe.then(() => { if (!nexted) resolve({ nexted, code: res._code, json: res._json }); });
        else setImmediate(() => { if (!nexted) resolve({ nexted, code: res._code, json: res._json }); });
    });
}

(async () => {
    const getCtx = () => ({ tenantId: 7 });

    // mock pool factory: returns given rows, or throws if `err`
    const mkPool = (rows, err) => ({ query: async () => { if (err) throw new Error('boom'); return { rows }; } });

    // 1) unauthenticated -> 401
    {
        const rp = makeRequirePermission({ pool: mkPool([]), getRequestTenantContext: getCtx })('orders:create');
        const r = await run(rp, { session: {} });
        ok(!r.nexted && r.code === 401, 'unauthenticated -> 401');
    }

    // 2) Admin short-circuit (no DB needed)
    {
        let queried = false;
        const pool = { query: async () => { queried = true; return { rows: [] }; } };
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx })('orders:create');
        const r = await run(rp, { session: { user: { role: 'Admin' } } });
        ok(r.nexted && !queried, 'Admin short-circuits to next() without querying DB');
    }

    // 2b) I3: ONLY 'Admin' short-circuits — 'administrator' / case-variants do NOT (mirror canonical server.js set).
    {
        let queried = false;
        const pool = { query: async () => { queried = true; return { rows: [] }; } };
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx, roleFallback: () => false })('orders:create');
        const r = await run(rp, { session: { user: { role: 'administrator' } } });
        ok(queried && !r.nexted && r.code === 403, "I3: 'administrator' does NOT short-circuit (queries DB, then fallback-deny)");
    }
    {
        let queried = false;
        const pool = { query: async () => { queried = true; return { rows: [] }; } };
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx, roleFallback: () => false })('orders:create');
        const r = await run(rp, { session: { user: { role: 'admin' } } });
        ok(queried && !r.nexted && r.code === 403, "I3: lowercase 'admin' does NOT short-circuit");
    }

    // 3) matrix HIT
    {
        const pool = mkPool([{ permission_key: 'orders:create' }, { permission_key: 'orders:view' }]);
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx })('orders:create');
        const r = await run(rp, { session: { user: { role: 'Doctor' } } });
        ok(r.nexted, 'matrix HIT (Doctor has orders:create) -> next()');
    }

    // 4) matrix explicit-miss -> 403 (NO bypass)
    {
        const pool = mkPool([{ permission_key: 'orders:view' }]); // has rows, but not the key
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx })('orders:create');
        const r = await run(rp, { session: { user: { role: 'Nurse' } } });
        ok(!r.nexted && r.code === 403 && r.json && r.json.error === 'Access denied', 'matrix explicit-miss -> 403 Access denied (no bypass)');
    }

    // 5) matrix EMPTY -> fallback allow
    {
        const pool = mkPool([]);
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx, roleFallback: () => true })('orders:create');
        const r = await run(rp, { session: { user: { role: 'LegacyRole' } } });
        ok(r.nexted, 'empty matrix -> fallback allow -> next()');
    }

    // 6) matrix EMPTY -> fallback deny
    {
        const pool = mkPool([]);
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx, roleFallback: () => false })('orders:create');
        const r = await run(rp, { session: { user: { role: 'LegacyRole' } } });
        ok(!r.nexted && r.code === 403, 'empty matrix -> fallback deny -> 403');
    }

    // 7) matrix EMPTY + NO fallback -> open (preserves pre-matrix behavior)
    {
        const pool = mkPool([]);
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx })('orders:create');
        const r = await run(rp, { session: { user: { role: 'LegacyRole' } } });
        ok(r.nexted, 'empty matrix + no fallback -> open (non-breaking)');
    }

    // 8) DB error -> fail-closed to fallback (deny here)
    {
        const pool = mkPool([], true);
        const rp = makeRequirePermission({ pool, getRequestTenantContext: getCtx, roleFallback: () => false })('orders:create');
        const r = await run(rp, { session: { user: { role: 'Doctor' } } });
        ok(!r.nexted && r.code === 403, 'DB error -> fail-closed to fallback (403)');
    }

    // 9) factory guards
    {
        let threw = false;
        try { makeRequirePermission({}); } catch (e) { threw = true; }
        ok(threw, 'makeRequirePermission throws without pool/getRequestTenantContext');
    }

    // ---------- static: I3 — rbac.js ADMIN_ROLES mirrors canonical server.js set EXACTLY ('Admin' only) ----------
    const rbacSrc = fs.readFileSync(path.join(__dirname, 'rbac.js'), 'utf8');
    const adminSetMatch = rbacSrc.match(/const ADMIN_ROLES = new Set\(\[([^\]]*)\]\)/);
    ok(adminSetMatch && /^\s*'Admin'\s*$/.test(adminSetMatch[1]), "I3: ADMIN_ROLES = new Set(['Admin']) (canonical, not over-broad)");
    // inspect only the Set's contents (not explanatory comments) for over-broad variants.
    // The canonical entry is 'Admin' (capital A); reject lowercase 'admin' and any 'administrator'/'Administrator'.
    const adminEntries = adminSetMatch ? (adminSetMatch[1].match(/'[^']*'/g) || []) : [];
    ok(adminEntries.length === 1 && adminEntries[0] === "'Admin'", 'I3: no over-broad administrator/case-variant in ADMIN_ROLES Set (only \'Admin\')');

    // ---------- static: server.js wiring is additive ----------
    const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    ok(serverSrc.includes("require('./rbac')") && serverSrc.includes('makeRequirePermission'), 'server.js requires rbac.makeRequirePermission');
    ok(serverSrc.includes('const requirePermission = makeRequirePermission({'), 'server.js builds requirePermission instance');
    ok(serverSrc.includes('roleFallback:'), 'requirePermission given a legacy roleFallback (non-breaking)');
    // requireRole untouched
    ok(/function requireRole\(\.\.\.modules\)/.test(serverSrc), 'requireRole definition untouched');
    ok(!/requireRole\s*=\s*makeRequirePermission/.test(serverSrc), 'requireRole NOT replaced by requirePermission');

    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
