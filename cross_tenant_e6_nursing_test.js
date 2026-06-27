/**
 * cross_tenant_e6_nursing_test.js — E6 Nursing/MAR cross-tenant isolation.
 * DB-free / HTTP-free / no PHI. Run: node cross_tenant_e6_nursing_test.js
 *
 * Three layers (house style):
 *   [1] STATIC CODE AUDIT — every E6 query carries an explicit tenant_id predicate; the new write
 *       routes are role-gated + tenant-scoped; null-tenant is fail-closed; no unsafe interpolation.
 *   [2] MIGRATION AUDIT   — each E6 table is tenant_id NOT NULL + FK tenants + patient FK + FORCE RLS
 *       + canonical isolation policy; up/validate/down idempotent; down drops the TABLE FIRST.
 *   [3] SIMULATION        — tenant A cannot read/administer/score/assess tenant B's patients; a
 *       cross-tenant id resolves to 0 rows / 404; null tenant => fail-closed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failureLog = [];
const assert = (cond, name, details = '') => {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failureLog.push(name); }
};

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  E6 Nursing/MAR — Cross-Tenant Isolation${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const sNoWs = server.replace(/\s+/g, '');
const has = (p) => server.includes(p) || sNoWs.includes(p.replace(/\s+/g, ''));

// ============================================================================
// [1] STATIC CODE AUDIT
// ============================================================================
console.log(`${BOLD}[ 1 ] Static query/guards audit (server.js)${RESET}`);
const staticChecks = [
  ['FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2', 'MAR: prescription_ref resolved tenant-scoped (anti-IDOR)'],
  ['FROM emar_orders WHERE id=$1 AND tenant_id=$2', 'MAR: emar_order resolved tenant-scoped (anti-IDOR)'],
  ['SELECT id, allergies FROM patients WHERE id=$1 AND tenant_id=$2', 'MAR: patient (right-patient) resolved tenant-scoped'],
  ['INSERT INTO mar_administrations', 'MAR: insert into mar_administrations'],
  ['SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', 'scores/assessment: patient resolved tenant-scoped'],
  ['INSERT INTO nursing_scores', 'scores: insert into nursing_scores with tenant_id'],
  ['ut.tenant_id=$2 AND ut.is_active=true', 'MAR: witness membership checked via user_tenants (tenant-scoped)'],
  ['FROM nursing_vitals WHERE patient_id=$1 AND tenant_id=$2', 'assessment: SELECT carries AND tenant_id'],
  ['UPDATE nursing_vitals SET notes=$1 WHERE id=$2 AND tenant_id=$3', 'assessment: UPDATE carries AND tenant_id (no cross-tenant write)'],
];
for (const [pat, label] of staticChecks) assert(has(pat), label, `looking for: "${pat}"`);

// role + tenant gating on the new/affected write routes
assert(/app\.post\('\/api\/mar\/administer',\s*requireAuth,\s*requireRole\('nursing',\s*'doctor'\),\s*requireTenantScope/.test(server),
  '/api/mar/administer: requireAuth + requireRole(nursing,doctor) + requireTenantScope');
assert(/app\.post\('\/api\/nursing\/scores',\s*requireAuth,\s*requireRole\('nursing',\s*'doctor'\),\s*requireTenantScope/.test(server),
  '/api/nursing/scores: requireAuth + requireRole(nursing,doctor) + requireTenantScope');
assert(/app\.post\('\/api\/nursing\/assessment',\s*requireAuth,\s*requireRole\('nursing',\s*'doctor'\),\s*requireTenantScope/.test(server),
  '/api/nursing/assessment: now role-gated + tenant-scoped (item 3)');
// emar routes now role-gated (item 6)
for (const r of ['/api/emar/orders', '/api/emar/administrations']) {
  assert(new RegExp(`app\\.(get|post)\\('${r.replace(/\//g, '\\/')}',\\s*requireAuth,\\s*requireRole\\('nursing',\\s*'doctor'\\)`).test(server),
    `emar route ${r}: requireRole(nursing,doctor) added (item 6)`);
}
// null-tenant fail-closed in the new routes
assert((server.match(/if \(!tenantId\) return res\.status\(403\)/g) || []).length >= 2,
  'MAR + scores routes fail-closed on null tenant (403)');
// no unsafe interpolation in E6 queries
{
  const unsafe = /FROM\s+mar_administrations\s+WHERE[^$]*\$\{/.test(server) ||
    /FROM\s+nursing_scores\s+WHERE[^$]*\$\{/.test(server) ||
    /INTO\s+mar_administrations[^;]*\$\{/.test(server);
  assert(!unsafe, 'E6 queries are parameterized ($N) — no dangerous template interpolation');
}

// ============================================================================
// [2] MIGRATION AUDIT
// ============================================================================
console.log(`\n${BOLD}[ 2 ] Migration audit (tenant_id NOT NULL + FKs + FORCE RLS + idempotent + down-first-table)${RESET}`);
const MIG = path.join(__dirname, 'migrations');
const tables = [
  { up: 'e6_01_mar_administrations_up.sql', down: 'e6_01_mar_administrations_down.sql', val: 'e6_01_mar_administrations_validate.sql', name: 'mar_administrations', policy: 'rls_mar_administrations_tenant_isolation' },
  { up: 'e6_02_nursing_io_records_up.sql', down: 'e6_02_nursing_io_records_down.sql', val: 'e6_02_nursing_io_records_validate.sql', name: 'nursing_io_records', policy: 'rls_nursing_io_records_tenant_isolation' },
  { up: 'e6_03_nursing_scores_up.sql', down: 'e6_03_nursing_scores_down.sql', val: 'e6_03_nursing_scores_validate.sql', name: 'nursing_scores', policy: 'rls_nursing_scores_tenant_isolation' },
];
const canonicalPolicy = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer";
for (const t of tables) {
  const up = fs.readFileSync(path.join(MIG, t.up), 'utf8');
  const down = fs.readFileSync(path.join(MIG, t.down), 'utf8');
  const val = fs.readFileSync(path.join(MIG, t.val), 'utf8');
  assert(/tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up), `${t.name}: tenant_id NOT NULL REFERENCES tenants(id)`);
  assert(/patient_id INTEGER NOT NULL REFERENCES patients\(id\)/.test(up), `${t.name}: patient_id NOT NULL REFERENCES patients(id) (item 4)`);
  assert(up.includes('ENABLE ROW LEVEL SECURITY') && up.includes('FORCE ROW LEVEL SECURITY'), `${t.name}: ENABLE + FORCE RLS`);
  assert(up.includes(canonicalPolicy) && up.includes('WITH CHECK'), `${t.name}: canonical isolation policy USING + WITH CHECK`);
  assert(up.includes('CREATE TABLE IF NOT EXISTS') && up.includes('DROP POLICY IF EXISTS') && up.includes('CREATE INDEX IF NOT EXISTS'), `${t.name}: up is idempotent`);
  // LOWER-3: down drops the TABLE FIRST (before the guarded DROP POLICY), so a stuck policy can't block teardown.
  const tableIdx = down.indexOf('DROP TABLE IF EXISTS');
  const policyIdx = down.indexOf('DROP POLICY IF EXISTS');
  assert(tableIdx !== -1 && policyIdx !== -1 && tableIdx < policyIdx, `${t.name}: down DROP TABLE precedes DROP POLICY (LOWER-3)`);
  assert(down.includes('DROP INDEX IF EXISTS'), `${t.name}: down drops its own indexes (idempotent)`);
  assert(val.includes('fk_to_patients'), `${t.name}: validate asserts the patient FK`);
}
// prescription_ref FK only on mar_administrations (nullable)
{
  const up = fs.readFileSync(path.join(MIG, 'e6_01_mar_administrations_up.sql'), 'utf8');
  assert(/prescription_ref INTEGER REFERENCES pharmacy_prescriptions_queue\(id\)/.test(up),
    'mar_administrations: nullable prescription_ref REFERENCES pharmacy_prescriptions_queue(id) (item 4)');
}

// ============================================================================
// [3] SIMULATION — tenant A cannot touch tenant B data.
// ============================================================================
console.log(`\n${BOLD}[ 3 ] Cross-tenant simulation${RESET}`);

// Mock store: patient #10 belongs to tenant 1; patient #20 belongs to tenant 2; orders likewise.
const STORE = {
  patients: { 10: { id: 10, tenant_id: 1 }, 20: { id: 20, tenant_id: 2 } },
  orders:   { 100: { id: 100, tenant_id: 1, patient_id: 10, medication: 'Amoxicillin', dose: '500 mg', route: 'Oral' },
              200: { id: 200, tenant_id: 2, patient_id: 20, medication: 'Ibuprofen', dose: '400 mg', route: 'Oral' } },
  marRows: [], scoreRows: [],
};
// Every resolve is `WHERE id=$ AND tenant_id=$` — a cross-tenant id returns undefined (=> 404 / 0 rows).
const resolvePatient = (id, tenant) => { const p = STORE.patients[id]; return (p && p.tenant_id === tenant) ? p : null; };
const resolveOrder = (id, tenant) => { const o = STORE.orders[id]; return (o && o.tenant_id === tenant) ? o : null; };

function marAdminister({ emar_order_id, tenantId }) {
  if (!tenantId) return { status: 403, rows: 0 };               // null tenant fail-closed
  const o = resolveOrder(emar_order_id, tenantId);
  if (!o) return { status: 404, rows: 0 };                       // cross-tenant order => 404, no row
  const p = resolvePatient(o.patient_id, tenantId);
  if (!p) return { status: 404, rows: 0 };
  STORE.marRows.push({ tenant_id: tenantId, patient_id: o.patient_id });
  return { status: 200, rows: 1 };
}
function nursingScore({ patient_id, tenantId }) {
  if (!tenantId) return { status: 403, rows: 0 };
  const p = resolvePatient(patient_id, tenantId);
  if (!p) return { status: 404, rows: 0 };
  STORE.scoreRows.push({ tenant_id: tenantId, patient_id });
  return { status: 200, rows: 1 };
}
function readMar(tenantId) { return STORE.marRows.filter(r => r.tenant_id === tenantId); }

// 3.1 tenant 2 nurse cannot administer against tenant 1's order #100
{ STORE.marRows = []; const r = marAdminister({ emar_order_id: 100, tenantId: 2 }); assert(r.status === 404 && r.rows === 0, 'tenant 2 cannot administer tenant 1 order #100 => 404, no row'); }
// 3.2 tenant 1 nurse CAN administer its own order #100
{ STORE.marRows = []; const r = marAdminister({ emar_order_id: 100, tenantId: 1 }); assert(r.status === 200 && r.rows === 1, 'tenant 1 administers its own order #100 => 200'); }
// 3.3 null tenant fail-closed
{ STORE.marRows = []; const r = marAdminister({ emar_order_id: 100, tenantId: null }); assert(r.status === 403 && r.rows === 0, 'null tenant administer => 403 fail-closed, no row'); }
// 3.4 tenant 1 cannot score tenant 2's patient #20
{ STORE.scoreRows = []; const r = nursingScore({ patient_id: 20, tenantId: 1 }); assert(r.status === 404 && r.rows === 0, 'tenant 1 cannot score tenant 2 patient #20 => 404, no row'); }
// 3.5 tenant 1 CAN score its own patient #10
{ STORE.scoreRows = []; const r = nursingScore({ patient_id: 10, tenantId: 1 }); assert(r.status === 200 && r.rows === 1, 'tenant 1 scores its own patient #10 => 200'); }
// 3.6 null tenant score fail-closed
{ STORE.scoreRows = []; const r = nursingScore({ patient_id: 10, tenantId: null }); assert(r.status === 403 && r.rows === 0, 'null tenant score => 403 fail-closed, no row'); }
// 3.7 read isolation — tenant 2 sees none of tenant 1's MAR rows
{ STORE.marRows = [{ tenant_id: 1, patient_id: 10 }, { tenant_id: 1, patient_id: 10 }]; assert(readMar(2).length === 0 && readMar(1).length === 2, 'read: tenant 2 sees 0 of tenant 1 MAR rows; tenant 1 sees its 2'); }
// 3.8 RLS policy is the ultimate backstop even if a predicate were ever dropped (canonical policy present in migration)
{ const up = fs.readFileSync(path.join(MIG, 'e6_01_mar_administrations_up.sql'), 'utf8'); assert(up.includes(canonicalPolicy), 'FORCE-RLS canonical policy is the DB backstop for mar_administrations'); }

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { console.log(`\n${RED}Failures:${RESET}`); failureLog.forEach(f => console.log('  - ' + f)); }
console.log(`${failed === 0 ? BOLD + GREEN + 'ALL PASS' + RESET : BOLD + RED + 'FAILED' + RESET}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
