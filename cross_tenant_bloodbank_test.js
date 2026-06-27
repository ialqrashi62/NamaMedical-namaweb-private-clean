/**
 * cross_tenant_bloodbank_test.js — E13 Blood Bank tenant-isolation & RBAC test.
 * Run: node cross_tenant_bloodbank_test.js   (no DB; static audit + simulation)
 *
 * Verifies:
 *  1. Every /api/bloodbank/* route is guarded by requireAuth + requireRole + requireTenantScope.
 *  2. Every read/write query carries an explicit AND tenant_id=$N filter.
 *  3. Legacy mutating /api/blood-bank/* routes are deprecated (410) and reads are tenant-scoped.
 *  4. Simulated isolation: tenant 1 cannot read/transfuse tenant 2 resources (404/403).
 *  5. e13RequireTenant fails closed (throws 403) on null tenant.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const flat = server.replace(/\s+/g, '');
const has = (s) => flat.includes(s.replace(/\s+/g, ''));

console.log(`${BOLD}E13 Blood Bank — cross-tenant isolation & RBAC (static + simulation)${RESET}\n`);

// ===== 1. Route guards =====
console.log('[1] Route guards: requireAuth + requireRole + requireTenantScope');
const guardedRoutes = [
  "app.get('/api/bloodbank/units',requireAuth,requireRole('bloodbank','lab','nursing','doctor'),requireTenantScope",
  "app.post('/api/bloodbank/units',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.put('/api/bloodbank/units/:id/discard',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.put('/api/bloodbank/units/:id/recall',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.get('/api/bloodbank/units/:id/lookback',requireAuth,requireRole('bloodbank','lab','doctor'),requireTenantScope",
  "app.get('/api/bloodbank/crossmatch',requireAuth,requireRole('bloodbank','lab','doctor','nursing'),requireTenantScope",
  "app.post('/api/bloodbank/crossmatch',requireAuth,requireRole('bloodbank','lab','doctor'),requireTenantScope",
  "app.put('/api/bloodbank/crossmatch/:id/validate',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.get('/api/bloodbank/transfusions',requireAuth,requireRole('bloodbank','lab','nursing','doctor'),requireTenantScope",
  "app.post('/api/bloodbank/transfuse',requireAuth,requireRole('bloodbank','nursing','doctor'),requireTenantScope",
  "app.post('/api/bloodbank/transfusions/:id/reaction',requireAuth,requireRole('bloodbank','nursing','doctor'),requireTenantScope",
  "app.get('/api/bloodbank/donors',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.post('/api/bloodbank/donors',requireAuth,requireRole('bloodbank','lab'),requireTenantScope",
  "app.get('/api/bloodbank/stats',requireAuth,requireRole('bloodbank','lab','nursing','doctor'),requireTenantScope",
];
guardedRoutes.forEach(r => assert(has(r), 'guarded: ' + r.slice(0, 48) + '...'));

// ===== 2. Tenant filters in queries =====
console.log('\n[2] Explicit tenant_id filters on queries');
const tenantFilters = [
  "FROM blood_bank_units WHERE ${conds.join(' AND ')} ORDER BY expiry_date",
  "INSERT INTO blood_bank_units (tenant_id, facility_id",
  "FROM patients WHERE id=$1 AND tenant_id=$2",                       // crossmatch reads patient ABO server-side
  "FROM blood_bank_units WHERE id=$1 AND tenant_id=$2 FOR UPDATE",    // transfuse lock
  "UPDATE blood_bank_units SET status='Transfused', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND status='Available'",
  "INSERT INTO blood_bank_transfusions (tenant_id, facility_id",
  "INSERT INTO blood_bank_transfusion_reactions (tenant_id, transfusion_id",
  "FROM blood_bank_crossmatch WHERE tenant_id=$1",
  "FROM blood_bank_donors WHERE tenant_id=$1",
  "FROM blood_bank_transfusions WHERE tenant_id=$1",
];
tenantFilters.forEach(f => assert(has(f), 'tenant filter: ' + f.slice(0, 50)));

// ===== 3. Safety invariants present in source =====
console.log('\n[3] Safety invariants in source');
assert(has("bbCompat.isABORhCompatible"), 'server uses pure ABO/Rh engine');
assert(has("ABO/Rh incompatible") && has("status(422)") || has(".status(422)"), '422 fail-closed path present');
assert(has("Unit already issued (concurrent)") && has("upd.rowCount!==1") || has("upd.rowCount !== 1"), 'double-issue concurrency guard (409)');
assert(has("isUnitIssuable") && has("UNIT_EXPIRED"), 'expiry block via isUnitIssuable');
assert(has("function e13RequireTenant"), 'e13RequireTenant helper present (fail-closed)');
assert(has("CROSSMATCH_BLOCKED") && has("TRANSFUSE_BLOCKED"), 'audit on blocked sensitive actions');
assert(has("'Blood Bank': ['dashboard', 'bloodbank'") || has("'Blood Bank':['dashboard','bloodbank'"), 'Blood Bank role added to ROLE_PERMISSIONS');

// ===== 4. Legacy hardening =====
console.log('\n[4] Legacy /api/blood-bank/* hardening');
assert(has("app.put('/api/blood-bank/crossmatch/:id',requireAuth,requireRole('bloodbank','lab'),requireTenantScope"), 'legacy crossmatch PUT guarded');
assert(has("res.status(410)"), 'legacy mutating routes deprecated (410)');
assert(has("app.get('/api/blood-bank/units',requireAuth,requireRole('bloodbank','lab','nursing','doctor'),requireTenantScope"), 'legacy units GET tenant-scoped+RBAC');
assert(has("FROM blood_bank_units WHERE ${conds.join(' AND ')} ORDER BY id DESC"), 'legacy units GET filters tenant_id');
// legacy unscoped patterns must be GONE
assert(!has("app.get('/api/blood-bank/units',requireAuth,async"), 'old unscoped units GET removed');
assert(!has("UPDATE blood_bank_units SET status='Used' WHERE id=$1\""), 'old lock-free status=Used transfuse removed');
assert(!has("app.put('/api/blood-bank/crossmatch/:id',requireAuth,async"), 'old client-marked crossmatch PUT removed');

// ===== 5. Simulation: tenant isolation + fail-closed =====
console.log('\n[5] Simulation: tenant isolation, fail-closed, double-issue');
const db = {
  patients: [
    { id: 1, name_en: 'P1', blood_type: 'O+', tenant_id: 1 },
    { id: 2, name_en: 'P2', blood_type: 'A+', tenant_id: 2 },
  ],
  units: [
    { id: 10, blood_type: 'O', rh_factor: '+', component: 'Packed RBC', status: 'Available', expiry_date: '2999-01-01', tenant_id: 1 },
    { id: 20, blood_type: 'A', rh_factor: '+', component: 'Packed RBC', status: 'Available', expiry_date: '2999-01-01', tenant_id: 2 },
  ],
};
const C = require('./bloodbank_compat');

function e13RequireTenant(req) {
  const t = req.session?.user?.tenantId || null;
  if (!t) { const e = new Error('Tenant scope required'); e.e13Status = 403; throw e; }
  return Number(t);
}
function getUnit(id, tenantId) { return db.units.find(u => u.id === id && u.tenant_id === tenantId) || null; }
function getPatient(id, tenantId) { return db.patients.find(p => p.id === id && p.tenant_id === tenantId) || null; }

function simTransfuse(req, patient_id, unit_id) {
  let tenantId; try { tenantId = e13RequireTenant(req); } catch (e) { return { status: e.e13Status }; }
  const patient = getPatient(patient_id, tenantId);
  if (!patient) return { status: 404, error: 'Patient not found' };
  const unit = getUnit(unit_id, tenantId);
  if (!unit) return { status: 404, error: 'Unit not found' };
  const iss = C.isUnitIssuable(unit);
  if (!iss.issuable) return { status: iss.reason === 'UNIT_EXPIRED' ? 422 : 409, reason: iss.reason };
  const compat = C.isABORhCompatible(patient.blood_type, null, unit.blood_type, unit.rh_factor, unit.component);
  if (!compat.compatible) return { status: 422, reason: compat.reason };
  // atomic flip simulation
  if (unit.status !== 'Available') return { status: 409, error: 'concurrent' };
  unit.status = 'Transfused';
  return { status: 200, success: true };
}

const T1 = { session: { user: { tenantId: 1 } } };
const T2 = { session: { user: { tenantId: 2 } } };
const NOTENANT = { session: { user: {} } };

assert(simTransfuse(NOTENANT, 1, 10).status === 403, 'null tenant -> 403 (fail-closed)');
assert(simTransfuse(T1, 2, 10).status === 404, 'tenant 1 cannot use tenant 2 patient -> 404');
assert(simTransfuse(T1, 1, 20).status === 404, 'tenant 1 cannot use tenant 2 unit -> 404');
// compatible same-tenant transfuse succeeds, then a second transfuse of same unit -> 409
const first = simTransfuse(T1, 1, 10);
assert(first.status === 200, 'tenant 1 transfuses own compatible unit -> 200 (O+ patient <- O+ RBC)');
assert(simTransfuse(T1, 1, 10).status === 409, 'double-issue of same unit -> 409');

// incompatible transfuse fail-closed (A+ patient, but craft an O- recipient vs O+ unit)
db.units.push({ id: 30, blood_type: 'O', rh_factor: '+', component: 'Packed RBC', status: 'Available', expiry_date: '2999-01-01', tenant_id: 1 });
db.patients.push({ id: 3, name_en: 'P3', blood_type: 'O-', tenant_id: 1 });
assert(simTransfuse(T1, 3, 30).status === 422, 'Rh-neg recipient <- Rh-pos RBC -> 422 fail-closed');
// expired unit blocked
db.units.push({ id: 40, blood_type: 'O', rh_factor: '-', component: 'Packed RBC', status: 'Available', expiry_date: '2000-01-01', tenant_id: 1 });
assert(simTransfuse(T1, 3, 40).status === 422, 'expired unit -> 422 blocked');
// incompatible ABO
db.units.push({ id: 50, blood_type: 'A', rh_factor: '+', component: 'Packed RBC', status: 'Available', expiry_date: '2999-01-01', tenant_id: 1 });
assert(simTransfuse(T1, 1, 50).status === 422, 'O+ patient <- A+ RBC -> 422 ABO incompatible');

console.log(`\n${BOLD}Cross-tenant results — PASS:${passed} FAIL:${failed}${RESET}`);
if (failed) { console.log(`${RED}Failures: ${fails.join(', ')}${RESET}`); process.exit(1); }
process.exit(0);
