/**
 * super_admin_test.js — Tenant Control Center tests.
 *   Part A: pure unit tests (no DB, no server).
 *   Part B: in-process HTTP integration (express + mocked pool/audit) for permissions, audit, no-leak.
 * Run: node super_admin_test.js   (exit 0 = all pass)
 */
'use strict';
const http = require('http');
const express = require('express');
const SA = require('./super_admin');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } }

// ---------- Part A: pure ----------
ok('parseAllowlist splits/trims', (() => { const s = SA.parseAllowlist(' op , boss ,'); return s.has('op') && s.has('boss') && s.size === 2; })());
ok('isSuperAdmin allows listed active', SA.isSuperAdmin({ username: 'op', is_active: 1 }, SA.parseAllowlist('op')) === true);
ok('isSuperAdmin denies unlisted', SA.isSuperAdmin({ username: 'x', is_active: 1 }, SA.parseAllowlist('op')) === false);
ok('isSuperAdmin denies inactive', SA.isSuperAdmin({ username: 'op', is_active: 0 }, SA.parseAllowlist('op')) === false);
ok('isSuperAdmin denies tenant Admin (no escalation)', SA.isSuperAdmin({ username: 'tadmin', role: 'Admin', is_active: 1 }, SA.parseAllowlist('op')) === false);
ok('isSuperAdmin denies null', SA.isSuperAdmin(null, SA.parseAllowlist('op')) === false);

ok('canTransition active->suspended', SA.canTransition('active', 'suspended') === true);
ok('canTransition suspended->active', SA.canTransition('suspended', 'active') === true);
ok('canTransition trial->active', SA.canTransition('trial', 'active') === true);
ok('canTransition rejects cancelled->active', SA.canTransition('cancelled', 'active') === false);
ok('canTransition rejects unknown status', SA.canTransition('active', 'bogus') === false);

(() => {
  const f = SA.parseTenantFilters({ status: 'active', plan: 'standard', q: '  jum  ' });
  ok('filters status', f.status === 'active');
  ok('filters plan', f.plan === 'standard');
  ok('filters q trimmed', f.q === 'jum');
  ok('filters drop bad status', SA.parseTenantFilters({ status: 'hax' }).status === undefined);
})();

(() => {
  const s = SA.deriveTenantSummary({ id: 3, name: 'X', subdomain: 'x', status: 'active', plan_type: 'pro', created_at: 'd' }, { users: 5, facilities: 2, last_activity: 'la' });
  ok('summary maps fields', s.id === 3 && s.plan === 'pro' && s.users === 5 && s.facilities === 2 && s.last_activity === 'la');
  ok('summary defaults bad status to active', SA.deriveTenantSummary({ id: 1, status: 'weird' }).status === 'active');
  ok('summary null-safe', SA.deriveTenantSummary(null) === null);
})();

// ---------- Part B: HTTP integration ----------
function fakePool(audit) {
  const calls = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const s = sql.replace(/\s+/g, ' ');
      if (/FROM tenants WHERE id=\$1/.test(s)) {
        if (params[0] === 99) return Promise.resolve({ rows: [] }); // not found
        return Promise.resolve({ rows: [{ id: params[0], name: 'Acme', subdomain: 'acme', status: 'active', plan_type: 'standard', created_at: '2026-01-01' }] });
      }
      if (/UPDATE tenants SET status=\$1/.test(s)) return Promise.resolve({ rows: [{ id: params[1], name: 'Acme', subdomain: 'acme', status: params[0], plan_type: 'standard', created_at: '2026-01-01' }] });
      if (/FROM tenants/.test(s)) return Promise.resolve({ rows: [{ id: 1, name: 'Acme', subdomain: 'acme', status: 'active', plan_type: 'standard', created_at: '2026-01-01' }] });
      if (/FROM user_tenants/.test(s)) return Promise.resolve({ rows: [{ c: 7 }] });
      if (/FROM facilities/.test(s)) return Promise.resolve({ rows: [{ c: 2 }] });
      if (/FROM audit_trail/.test(s)) return Promise.resolve({ rows: [{ m: '2026-06-30' }] });
      if (/SUM\(total\)/.test(s)) return Promise.resolve({ rows: [{ total: 12500 }] });
      if (/FROM tenant_plan_assignments/.test(s)) {
        if (/GROUP BY/.test(s)) return Promise.resolve({ rows: [{ plan_key: 'free_trial', count: 5 }, { plan_key: 'basic', count: 4 }] });
        return Promise.resolve({ rows: [{ count: 9 }] });
      }
      return Promise.resolve({ rows: [] });
    }
  };
}

function buildApp(currentUserRef, auditLog, tenantBindLog) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: currentUserRef.user }; next(); });
  const pool = fakePool();
  app._pool = pool;
  app.use('/api/super-admin', SA.makeSuperAdminRouter({
    pool,
    getActor: (req) => req.session.user,
    runWithTenant: (tenantId, fn) => { tenantBindLog.push(tenantId); return fn(); },
    logAudit: (...a) => auditLog.push(a),
    allowlist: 'op',
    enabled: true
  }));
  return app;
}

function req(port, method, path) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      let body = ''; res.on('data', d => body += d); res.on('end', () => {
        let json; try { json = JSON.parse(body); } catch { json = {}; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.end();
  });
}

(async () => {
  const userRef = { user: { id: 1, username: 'op', display_name: 'Operator', is_active: 1 } };
  const audit = [], binds = [];
  const app = buildApp(userRef, audit, binds);
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;

  // super admin can get stats
  let rStats = await req(port, 'GET', '/api/super-admin/stats');
  ok('super admin gets stats 200', rStats.status === 200 && rStats.json.total_revenue === 12500 && rStats.json.active_subscriptions === 9 && rStats.json.plans_breakdown.length === 2);

  // super admin can list
  let r1 = await req(port, 'GET', '/api/super-admin/tenants');
  ok('super admin lists tenants 200', r1.status === 200 && Array.isArray(r1.json.tenants));

  // non-super (unlisted) denied
  userRef.user = { id: 2, username: 'nobody', role: 'Admin', is_active: 1 };
  let r2 = await req(port, 'GET', '/api/super-admin/tenants');
  ok('tenant Admin denied 403', r2.status === 403 && r2.json.code === 'SUPER_ADMIN_REQUIRED');

  // unauthenticated denied
  userRef.user = null;
  let r3 = await req(port, 'GET', '/api/super-admin/tenants');
  ok('no session denied 403', r3.status === 403);

  // back to super admin: details reads inside tenant RLS context (runWithTenant called with id)
  userRef.user = { id: 1, username: 'op', display_name: 'Operator', is_active: 1 };
  binds.length = 0;
  let r4 = await req(port, 'GET', '/api/super-admin/tenants/5');
  ok('details 200 with stats', r4.status === 200 && r4.json.tenant.users === 7 && r4.json.tenant.facilities === 2);
  ok('no cross-tenant leak: runWithTenant bound to id 5 only', binds.length === 1 && binds[0] === 5);

  // details 404 for missing
  let r5 = await req(port, 'GET', '/api/super-admin/tenants/99');
  ok('details 404 when missing', r5.status === 404);

  // suspend writes audit + changes status
  audit.length = 0;
  let r6 = await req(port, 'POST', '/api/super-admin/tenants/5/suspend');
  ok('suspend 200', r6.status === 200 && r6.json.tenant.status === 'suspended');
  ok('suspend wrote audit (TENANT_SUSPEND)', audit.length === 1 && audit[0][2] === 'TENANT_SUSPEND');

  // invalid id rejected
  let r7 = await req(port, 'GET', '/api/super-admin/tenants/abc');
  ok('invalid id 400', r7.status === 400);

  srv.close();

  // disabled router mounts nothing
  const app2 = express(); app2.use((req, res, next) => { req.session = { user: userRef.user }; next(); });
  app2.use('/api/super-admin', SA.makeSuperAdminRouter({ enabled: false }));
  app2.use((req, res) => res.status(404).json({ fell_through: true }));
  const srv2 = app2.listen(0); await new Promise(r => srv2.once('listening', r));
  let r8 = await req(srv2.address().port, 'GET', '/api/super-admin/tenants');
  ok('disabled router is inert (falls through 404)', r8.status === 404 && r8.json.fell_through === true);
  srv2.close();

  console.log(`super_admin_test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
