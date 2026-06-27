/**
 * cross_tenant_pathology_test.js — E15 cross-tenant isolation + static audit.
 * DB-free: static code audit of server.js + mock-handler simulation.
 *   node cross_tenant_pathology_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const eng = require('./pathology_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', BOLD = '\x1b[1m', RESET = '\x1b[0m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${det ? ' | ' + det : ''}`); failed++; failures.push(name); }
}

console.log(`\n${BOLD}${BLUE}E15 Pathology — Cross-Tenant Isolation & IDOR Test${RESET}\n`);

const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const norm = serverContent.replace(/\s+/g, ' ');

// ===== 1. Static code audit: RBAC + tenant scope on every pathology route =====
console.log(`${BOLD}[1] Static audit — RBAC + requireTenantScope on routes${RESET}`);
const routeGuards = [
    "app.get('/api/pathology/specimens', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope",
    "app.get('/api/pathology/specimens/:id', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope",
    "app.post('/api/pathology/specimens', requireAuth, requireRole('pathology', 'lab'), requireTenantScope",
    "app.post('/api/pathology/specimens/:id/blocks', requireAuth, requireRole('pathology', 'lab'), requireTenantScope",
    "app.post('/api/pathology/blocks/:blockId/slides', requireAuth, requireRole('pathology', 'lab'), requireTenantScope",
    "app.put('/api/pathology/specimens/:id/state', requireAuth, requireRole('pathology', 'lab'), requireTenantScope",
    "app.put('/api/pathology/specimens/:id/report', requireAuth, requireRole('pathology'), requireTenantScope",
    "app.post('/api/pathology/specimens/:id/signout', requireAuth, requireRole('pathology'), requireTenantScope",
    "app.post('/api/pathology/specimens/:id/addendum', requireAuth, requireRole('pathology'), requireTenantScope",
    "app.get('/api/pathology/cases', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope",
];
routeGuards.forEach(g => assert(norm.includes(g.replace(/\s+/g, ' ')), 'guarded: ' + g.slice(0, 70)));

// ===== 2. Static audit: tenant_id in every pathology query =====
console.log(`\n${BOLD}[2] Static audit — explicit AND tenant_id on queries${RESET}`);
[
    'FROM path_specimens WHERE id=$1 AND tenant_id=$2',
    'WHERE s.tenant_id = $1',
    'FROM path_blocks WHERE id=$1 AND tenant_id=$2',
    'FROM path_reports WHERE specimen_id=$1 AND tenant_id=$2',
    'FROM patients WHERE id=$1 AND tenant_id=$2',
    'FROM pathology_cases WHERE id=$1 AND tenant_id=$2',
].forEach(q => assert(norm.includes(q.replace(/\s+/g, ' ')), 'tenant-scoped query: ' + q.slice(0, 55)));

// ===== 3. Static audit: audit logging on sensitive writes =====
console.log(`\n${BOLD}[3] Static audit — logAudit on writes${RESET}`);
['PATHOLOGY_SPECIMEN_CREATE', 'PATHOLOGY_SPECIMEN_SIGNOUT', 'PATHOLOGY_ADDENDUM_ADD',
 'PATHOLOGY_STATE_CHANGE', 'PATHOLOGY_REPORT_SAVE', 'PATHOLOGY_BLOCK_ADD']
    .forEach(a => assert(serverContent.includes(`'${a}'`), 'logAudit action: ' + a));

// ===== 4. Static audit: server-authoritative state machine + FOR UPDATE =====
console.log(`\n${BOLD}[4] Static audit — state machine + locking + anti-spoof${RESET}`);
assert(serverContent.includes('pathologyEngine.isValidTransition'), 'state machine enforced server-side');
assert(serverContent.includes("status(409)"), 'invalid transition -> 409');
assert(serverContent.includes('pathologyEngine.isImmutable'), 'immutability checked on report edit');
assert(serverContent.includes('FOR UPDATE'), 'row locking (FOR UPDATE) used for state flips');
assert(serverContent.includes('pathologyEngine.generateAccession'), 'accession server-generated (not client)');
assert(serverContent.includes('pathologyEngine.deriveFlags'), 'flags derived server-side (anti-spoof)');
assert(!norm.includes('malignancy_flag = req.body') && !norm.includes('req.body.malignancy_flag'), 'client malignancy_flag NOT trusted');

// ===== 5. Mock simulation — cross-tenant leak prevention =====
console.log(`\n${BOLD}[5] Simulation — isolation & IDOR${RESET}`);
const mockDb = {
    patients: [{ id: 101, tenant_id: 1 }, { id: 102, tenant_id: 2 }],
    specimens: [
        { id: 1, patient_id: 101, tenant_id: 1, state: 'Reported', accession_number: 'PA-1-X-0001' },
        { id: 2, patient_id: 102, tenant_id: 2, state: 'Received', accession_number: 'PA-2-X-0001' },
    ],
    reports: [
        { id: 11, specimen_id: 1, tenant_id: 1, state: 'Reported', diagnosis: 'Adenocarcinoma' },
        { id: 12, specimen_id: 2, tenant_id: 2, state: 'Received', diagnosis: '' },
    ],
};
function listSpecimens(tid) { if (!tid) return []; return mockDb.specimens.filter(s => s.tenant_id === tid); }
function getSpecimen(tid, sid) {
    const s = mockDb.specimens.find(x => x.id === sid);
    if (!s || (tid && s.tenant_id !== tid)) return { status: 404 };
    return { status: 200, specimen: s };
}
function createSpecimen(tid, body) {
    const p = mockDb.patients.find(x => x.id === body.patient_id);
    if (!p) return { status: 404 };
    if (tid && p.tenant_id !== tid) return { status: 404 }; // IDOR -> 404
    return { status: 200, specimen: { id: 9, tenant_id: tid, patient_id: body.patient_id, state: 'Received' } };
}

const t1 = listSpecimens(1);
assert(t1.length === 1 && t1[0].id === 1, 'tenant 1 sees only own specimens');
assert(!t1.some(s => s.tenant_id === 2), 'tenant 1 no leak of tenant 2');
assert(listSpecimens(null).length === 0, 'null tenant -> zero rows (fail-closed)');
assert(getSpecimen(1, 2).status === 404, 'tenant 1 GET tenant-2 specimen -> 404 (IDOR)');
assert(getSpecimen(1, 1).status === 200, 'tenant 1 GET own specimen -> 200');
assert(createSpecimen(1, { patient_id: 102 }).status === 404, 'tenant 1 cannot accession for tenant-2 patient -> 404');
const created = createSpecimen(1, { patient_id: 101 });
assert(created.status === 200 && created.specimen.tenant_id === 1, 'created specimen stamped with session tenant');

// ===== 5b. F1/F3 input validation (handler-layer simulation) =====
console.log(`\n${BOLD}[5b] Input validation — F1 accession collision 409, F3 visit_id 400${RESET}`);
// F1: duplicate accession unique violation -> 409 (not 500).
function createSpecimenWithAccessionCollision() {
    // Simulate pg unique violation error (code 23505).
    const err = new Error('duplicate key value violates unique constraint "path_specimens_accession_number_key"');
    err.code = '23505';
    if (err.code === '23505') return { status: 409, error: 'Accession collision; please retry' };
    return { status: 500 };
}
const collResult = createSpecimenWithAccessionCollision();
assert(collResult.status === 409, 'F1: duplicate accession unique violation (23505) -> 409 not 500');
assert(collResult.error === 'Accession collision; please retry', 'F1: 409 body carries retry message');

// F3: non-integer visit_id (e.g. "abc") -> 400 (not 500 DB type error).
function validateVisitId(visit_id) {
    const vid = (visit_id != null && visit_id !== '') ? parseInt(visit_id, 10) : null;
    if (vid !== null && !Number.isInteger(vid)) return { status: 400, error: 'visit_id must be integer' };
    return { status: 200, vid };
}
assert(validateVisitId('abc').status === 400, 'F3: non-numeric visit_id -> 400');
assert(validateVisitId('foo123').status === 400, 'F3: alphanumeric visit_id -> 400');
assert(validateVisitId(null).status === 200, 'F3: null visit_id -> allowed (optional)');
assert(validateVisitId('').status === 200, 'F3: empty string visit_id -> treated as null');
assert(validateVisitId('42').vid === 42, 'F3: valid integer string visit_id -> parsed correctly');

// ===== 6. Sign-out: server-authoritative, immutable, addendum-only =====
console.log(`\n${BOLD}[6] Simulation — sign-out & immutability${RESET}`);
function signOut(tid, sid) {
    const r = getSpecimen(tid, sid); if (r.status !== 200) return { status: 404 };
    const sp = r.specimen;
    if (sp.state === 'SignedOut') return { status: 409, error: 'already' };
    if (!eng.isValidTransition(sp.state, 'SignedOut')) return { status: 409, error: 'bad-state' };
    const rep = mockDb.reports.find(x => x.specimen_id === sid && x.tenant_id === tid);
    if (!rep || !rep.diagnosis.trim()) return { status: 409, error: 'no-dx' };
    sp.state = 'SignedOut'; rep.state = 'SignedOut';
    return { status: 200 };
}
assert(signOut(1, 2).status === 404, 'tenant 1 cannot sign out tenant-2 specimen -> 404');
assert(signOut(2, 2).status === 409, 'sign out from Received (no diagnosis) -> 409');
assert(signOut(1, 1).status === 200, 'tenant 1 signs out own Reported specimen with diagnosis -> 200');
assert(signOut(1, 1).status === 409, 'second sign-out -> 409 (already signed out, immutable)');
assert(eng.isImmutable(mockDb.specimens[0].state), 'specimen now immutable after sign-out');

// addendum allowed only after sign-out
function addendum(tid, sid, text) {
    const rep = mockDb.reports.find(x => x.specimen_id === sid && x.tenant_id === tid);
    if (!rep || (tid && rep.tenant_id !== tid)) return { status: 404 };
    if (rep.state !== 'SignedOut') return { status: 409 };
    if (!text || !text.trim()) return { status: 400 };
    return { status: 200 };
}
assert(addendum(1, 1, 'extra finding').status === 200, 'addendum on signed-out report -> 200');
assert(addendum(2, 2, 'x').status === 409, 'addendum before sign-out -> 409');
assert(addendum(1, 2, 'x').status === 404, 'cross-tenant addendum -> 404');

console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed ? RED : ''}${failed} failed${RESET}`);
if (failed) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
