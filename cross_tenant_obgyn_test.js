/**
 * cross_tenant_obgyn_test.js — Epic E14 OB/Maternity tenant-isolation + IDOR test (DB-free).
 * 1) Static audit: every /api/obgyn/* mutating + reading route is guarded by
 *    requireAuth + requireRole + requireTenantScope and filters by tenant_id.
 * 2) Simulation: a tenant cannot read/attach to another tenant's patient / pregnancy /
 *    delivery (cross-tenant -> 404); authority fields are server-computed; delivery
 *    state machine rejects non-Active pregnancies (409).
 *   NODE_PATH=...\namaweb\node_modules node cross_tenant_obgyn_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./ob_engine');

let passed = 0, failed = 0;
function assert(cond, name, det = '') {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; }
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const flat = server.replace(/\s+/g, '');

console.log('\n=== E14 OB/GYN cross-tenant isolation test ===\n');
console.log('[1] Static route-guard audit (server.js)');

const routeGuards = [
    "app.get('/api/obgyn/pregnancies',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/pregnancies',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.put('/api/obgyn/pregnancies/:id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/antenatal/:pregnancy_id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/antenatal',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/partogram/:pregnancy_id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/partogram',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/ultrasounds/:pregnancy_id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/ultrasounds',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/deliveries',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/deliveries/:pregnancy_id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/neonatal/:delivery_id',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/neonatal',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.post('/api/obgyn/nst',requireAuth,requireRole(...OB_RBAC),requireTenantScope,",
    "app.get('/api/obgyn/lab-panels',requireAuth,requireRole(...OB_RBAC),requireTenantScope,"
];
for (const g of routeGuards) {
    assert(flat.includes(g.replace(/\s+/g, '')), 'guarded: ' + g.split(',')[0].replace("app.", ""));
}

console.log('\n[2] Static tenant-filter / ownership audit');
const sqlChecks = [
    ['SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', 'patient ownership check (tenant-scoped)'],
    ['SELECT * FROM obgyn_pregnancies WHERE id=$1 AND tenant_id=$2', 'pregnancy fetch tenant-scoped'],
    ['FROM obgyn_pregnancies WHERE id=$1 AND tenant_id=$2 FOR UPDATE', 'delivery: SELECT ... FOR UPDATE (race-safe)'],
    ['obgyn_antenatal_visits WHERE pregnancy_id=$1 AND tenant_id=$2', 'antenatal read tenant-scoped'],
    ['obgyn_partogram WHERE pregnancy_id=$1 AND tenant_id=$2', 'partogram read tenant-scoped'],
    ['obgyn_deliveries WHERE id=$1 AND tenant_id=$2', 'delivery ownership tenant-scoped'],
    ['obgyn_neonatal WHERE delivery_id=$1 AND tenant_id=$2', 'neonatal read tenant-scoped'],
    ['obgyn_lab_panels WHERE is_active=1 AND tenant_id=$1', 'lab-panels tenant-scoped'],
    ["INSERT INTO obgyn_pregnancies (tenant_id,", 'pregnancy insert stamps tenant_id'],
    ["INSERT INTO obgyn_deliveries (tenant_id,", 'delivery insert stamps tenant_id'],
    ["INSERT INTO obgyn_neonatal (tenant_id,", 'neonatal insert stamps tenant_id']
];
for (const [pat, label] of sqlChecks) {
    assert(flat.includes(pat.replace(/\s+/g, '')), label);
}

console.log('\n[3] Anti-spoof / state-machine / audit static audit');
assert(flat.includes('obEngine.computeEDD(lmp)'), 'EDD computed server-side via obEngine');
assert(flat.includes('obEngine.computeGPAL'), 'GPAL computed/validated server-side');
assert(flat.includes('obEngine.computeAPGAR'), 'APGAR computed server-side');
assert(flat.includes('obEngine.gaFromBiometry'), 'biometry GA computed server-side');
assert(flat.includes('obEngine.deliveryTransitionAllowed'), 'delivery state machine enforced');
assert(flat.includes("res.status(409)"), 'state-machine returns 409 on invalid transition');
assert(flat.includes("'RECORD_DELIVERY','OB/GYN'") || flat.includes("'RECORD_DELIVERY',"), 'delivery audited (RECORD_DELIVERY)');
assert(flat.includes("'RECORD_NEONATAL',"), 'neonatal audited (RECORD_NEONATAL)');
assert(flat.includes("'CREATE_PREGNANCY',"), 'pregnancy creation audited');
assert(flat.includes('Number.isInteger'), 'integer id comparison (no string coercion)');

console.log('\n[4] Simulation: cross-tenant isolation + IDOR');
// mock DB
const db = {
    patients: [
        { id: 201, tenant_id: 1, name_ar: 'Amina T1' },
        { id: 202, tenant_id: 2, name_ar: 'Fatima T2' }
    ],
    pregnancies: [
        { id: 1, tenant_id: 1, patient_id: 201, status: 'Active', lmp: '2026-01-15' },
        { id: 2, tenant_id: 2, patient_id: 202, status: 'Active', lmp: '2026-02-01' },
        { id: 3, tenant_id: 1, patient_id: 201, status: 'Delivered', lmp: '2025-01-01' }
    ],
    deliveries: [{ id: 100, tenant_id: 1, pregnancy_id: 1, patient_id: 201 }]
};
const patientInTenant = (pid, t) => db.patients.find(p => p.id === Number(pid) && p.tenant_id === t) || null;
const pregInTenant = (id, t) => db.pregnancies.find(p => p.id === Number(id) && p.tenant_id === t) || null;
const delInTenant = (id, t) => db.deliveries.find(d => d.id === Number(id) && d.tenant_id === t) || null;

function simCreatePregnancy(tenantId, body) {
    if (!Number.isInteger(tenantId)) return { status: 403 };
    if (!patientInTenant(body.patient_id, tenantId)) return { status: 404 };
    const g = E.computeGPAL(body);
    if (!g.ok) return { status: 422 };
    return { status: 200, edd: E.computeEDD(body.lmp), gpal: g };
}
function simCreateDelivery(tenantId, body) {
    if (!Number.isInteger(tenantId)) return { status: 403 };
    const preg = pregInTenant(body.pregnancy_id, tenantId);
    if (!preg) return { status: 404 };
    const t = E.deliveryTransitionAllowed(preg.status);
    if (!t.ok) return { status: 409 };
    return { status: 200 };
}
function simReadNeonatal(tenantId, deliveryId) {
    if (!Number.isInteger(tenantId)) return { status: 403 };
    if (!delInTenant(deliveryId, tenantId)) return { status: 404 };
    return { status: 200 };
}

assert(simCreatePregnancy(1, { patient_id: 201, lmp: '2026-01-15', gravida: 2, para: 1, abortion: 0 }).status === 200, 'T1 creates pregnancy for its own patient (201)');
assert(simCreatePregnancy(1, { patient_id: 202, lmp: '2026-01-15', gravida: 1, para: 0, abortion: 0 }).status === 404, 'IDOR: T1 cannot create pregnancy for T2 patient (202) -> 404');
assert(simCreatePregnancy(1, { patient_id: 201, lmp: '2026-01-15', gravida: 1, para: 2, abortion: 0 }).status === 422, 'GPAL invalid -> 422');
assert(simCreatePregnancy(1, { patient_id: 201, lmp: '2026-01-15', gravida: 2, para: 1, abortion: 0 }).edd === '2026-10-22', 'EDD computed server-side (anti-spoof)');

assert(simCreateDelivery(1, { pregnancy_id: 1 }).status === 200, 'T1 records delivery on its Active pregnancy (1)');
assert(simCreateDelivery(1, { pregnancy_id: 2 }).status === 404, 'IDOR: T1 cannot record delivery on T2 pregnancy (2) -> 404');
assert(simCreateDelivery(1, { pregnancy_id: 3 }).status === 409, 'state machine: delivery on already-Delivered pregnancy (3) -> 409');
assert(simCreateDelivery(NaN, { pregnancy_id: 1 }).status === 403, 'null/invalid tenant -> 403 (fail-closed)');

assert(simReadNeonatal(1, 100).status === 200, 'T1 reads neonatal for its delivery (100)');
assert(simReadNeonatal(2, 100).status === 404, 'IDOR: T2 cannot read T1 delivery neonatal (100) -> 404');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed === 0 ? 0 : 1);
