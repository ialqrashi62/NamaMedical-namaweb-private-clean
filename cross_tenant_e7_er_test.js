/**
 * cross_tenant_e7_er_test.js
 * ==========================================
 * E7 Emergency Department — cross-tenant isolation for the new /api/er/* routes
 * (board / triage / assign-provider / disposition). DB-free: static-audits server.js for
 * fail-closed tenant filters, then simulates the handlers' tenant/IDOR logic.
 * Mirrors cross_tenant_emergency_test.js (no pool mock, re-implements handler logic).
 *
 *   node cross_tenant_e7_er_test.js
 *
 * Asserts:
 *   - tenant A cannot read the board / triage / assign / disposition tenant B's visits or beds
 *   - cross-tenant visit/bed id => 404 (zero rows), never leaked
 *   - null tenant fails closed (403) — NEVER an unscoped fallback (e7RequireTenant throws)
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== E7 Cross-Tenant ED Isolation Tests ===${RESET}\n`);

// ===== 1. Static audit: every /api/er/* query carries tenant_id + fail-closed resolver =====
console.log(`${BOLD}[1] Static audit — tenant filters + fail-closed resolver${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');
const sqlChecks = [
    { p: "FROMemergency_visitsWHEREstatus='Active'ANDtenant_id=$1", l: 'board query filters status + tenant_id=$1' },
    { p: "FROMemergency_visitsWHEREid=$1ANDtenant_id=$2", l: 'triage/assign/disposition visit lookup filters id + tenant_id' },
    { p: "UPDATEemergency_visitsSETesi_level=$1", l: 'triage UPDATE sets server-computed esi_level' },
    { p: "WHEREid=$6ANDtenant_id=$7", l: 'triage UPDATE scoped by id + tenant_id' },
    { p: "UPDATEemergency_bedsSETstatus='Available',current_patient_id=0WHEREbed_name=$1ANDtenant_id=$2", l: 'disposition frees bed scoped by tenant_id' },
    { p: "INSERTINTOadmissions", l: 'ADT handoff insert present' },
    { p: "functione7RequireTenant(req){", l: 'fail-closed e7RequireTenant helper defined' },
    { p: "err.e7Status=403;throwerr;", l: 'e7RequireTenant THROWS 403 on null tenant (no unscoped fallback)' }
];
for (const { p, l } of sqlChecks) assert(clean.includes(p.replace(/\s+/g, '')), l, p);
// Negative: the NEW /api/er/* block (board..disposition, before the INPATIENT ADT marker) must NOT
// contain an unscoped "tenantId ? [tenantId] : []" fallback — every er query is hard-scoped.
const erBlockStart = serverContent.indexOf("E7: EMERGENCY DEPARTMENT");
const erBlockEnd = serverContent.indexOf("INPATIENT ADT", erBlockStart);
const erBlock = (erBlockStart >= 0 && erBlockEnd > erBlockStart) ? serverContent.slice(erBlockStart, erBlockEnd) : '';
assert(erBlock.length > 0, 'E7 /api/er block located for negative audit');
assert(!/tenantId\s*\?\s*\[/.test(erBlock), 'no unscoped "tenantId ? [...] : []" fallback inside the /api/er/* block');
assert(!/:\s*\[\s*\]/.test(erBlock.replace(/allowed:\s*ER_DISPOSITIONS/g, '')), 'no bare ": []" unscoped-param fallback inside the /api/er/* block');

// ===== 2. Simulation: tenant/IDOR isolation across the 4 routes =====
console.log(`\n${BOLD}[2] Tenant isolation simulation${RESET}`);
const mockDb = {
    emergency_visits: [
        { id: 1000, patient_id: 1, patient_name: 'P-T1', status: 'Active', esi_level: 0, triage_started_at: '', provider_assigned_at: '', assigned_bed: 'ER-T1', tenant_id: 1 },
        { id: 2000, patient_id: 2, patient_name: 'P-T2', status: 'Active', esi_level: 2, triage_started_at: 't', provider_assigned_at: 'p', assigned_bed: 'ER-T2', tenant_id: 2 }
    ],
    emergency_beds: [
        { id: 10, bed_name: 'ER-T1', tenant_id: 1 },
        { id: 20, bed_name: 'ER-T2', tenant_id: 2 }
    ]
};

// Fail-closed tenant resolver (mirrors e7RequireTenant): throws when null in "production".
function resolveTenant(req) {
    const t = req.session?.user?.tenantId || null;
    if (!t) { const e = new Error('Tenant scope required'); e.e7Status = 403; throw e; }
    return t;
}
function findVisit(id, tenantId) { return mockDb.emergency_visits.find(v => v.id === id && v.tenant_id === tenantId) || null; }
function findBed(name, tenantId) { return mockDb.emergency_beds.find(b => b.bed_name === name && b.tenant_id === tenantId) || null; }

function simBoard(req) {
    let t; try { t = resolveTenant(req); } catch (e) { return { status: e.e7Status }; }
    return { status: 200, data: mockDb.emergency_visits.filter(v => v.status === 'Active' && v.tenant_id === t) };
}
function simTriage(req, body) {
    let t; try { t = resolveTenant(req); } catch (e) { return { status: e.e7Status }; }
    const v = findVisit(body.visit_id, t);
    if (!v) return { status: 404 };
    return { status: 200 };
}
function simAssign(req, body) {
    let t; try { t = resolveTenant(req); } catch (e) { return { status: e.e7Status }; }
    const v = findVisit(body.visit_id, t);
    if (!v) return { status: 404 };
    return { status: 200 };
}
function simDisposition(req, body) {
    let t; try { t = resolveTenant(req); } catch (e) { return { status: e.e7Status }; }
    const v = findVisit(body.visit_id, t);
    if (!v) return { status: 404 };
    return { status: 200 };
}

const T1 = { session: { user: { tenantId: 1 } } };
const T2 = { session: { user: { tenantId: 2 } } };
const NONE = { session: { user: { tenantId: null } } };

// -- board isolation --
assert(simBoard(T1).data.length === 1 && simBoard(T1).data[0].id === 1000, 'tenant 1 board shows only its own visit (1000)');
assert(simBoard(T2).data.length === 1 && simBoard(T2).data[0].id === 2000, 'tenant 2 board shows only its own visit (2000)');
assert(simBoard(NONE).status === 403, 'null tenant board => 403 (fail-closed, no unscoped rows)');

// -- triage isolation --
assert(simTriage(T1, { visit_id: 1000 }).status === 200, 'tenant 1 triages its own visit (1000)');
assert(simTriage(T1, { visit_id: 2000 }).status === 404, 'tenant 1 CANNOT triage tenant 2 visit (2000) => 404');
assert(simTriage(NONE, { visit_id: 1000 }).status === 403, 'null tenant triage => 403');

// -- assign-provider isolation --
assert(simAssign(T1, { visit_id: 1000 }).status === 200, 'tenant 1 assigns provider to its own visit');
assert(simAssign(T1, { visit_id: 2000 }).status === 404, 'tenant 1 CANNOT assign provider on tenant 2 visit => 404');
assert(simAssign(NONE, { visit_id: 1000 }).status === 403, 'null tenant assign => 403');

// -- disposition isolation --
assert(simDisposition(T1, { visit_id: 1000 }).status === 200, 'tenant 1 dispositions its own visit');
assert(simDisposition(T1, { visit_id: 2000 }).status === 404, 'tenant 1 CANNOT disposition tenant 2 visit => 404');
assert(simDisposition(NONE, { visit_id: 1000 }).status === 403, 'null tenant disposition => 403');

// -- bed cross-tenant lookup (free-bed step) --
assert(findBed('ER-T2', 1) === null, 'tenant 1 cannot resolve tenant 2 bed ER-T2 (cross-tenant id => 0 rows)');
assert(findBed('ER-T1', 1) !== null, 'tenant 1 resolves its own bed ER-T1');

console.log(`\n${BOLD}${BLUE}=== E7 Cross-Tenant Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
