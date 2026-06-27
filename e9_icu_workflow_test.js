/**
 * e9_icu_workflow_test.js
 * ==========================================
 * E9 ICU / Critical Care — workflow + admission-scoping tests.
 * DB-free: static-audits the guarded /api/icu/* routes in server.js, then re-simulates the
 * server's e9LoadActiveIcuAdmission gate + the board acuity-sort against an in-memory mock
 * (mirrors e8_adt_workflow_test.js).
 *
 *   NODE_PATH=.../namaweb/node_modules node e9_icu_workflow_test.js
 *
 * Asserts:
 *   - every new /api/icu/* route is auth+role+tenant guarded (requireRole('icu','nursing','doctor'))
 *   - e9RequireTenant fail-closed helper present (null tenant => 403)
 *   - scores computed SERVER-SIDE via icuScoring.computeICUScores (client score ignored)
 *   - flowsheet/vent/infusion/score attach ONLY to an Active, tenant-owned, ICU-ward admission
 *   - non-positive id => 422 ; cross-tenant / missing => 404 ; non-Active (Discharged) => 409 ;
 *     non-ICU ward => 409
 *   - ICU board sorted by acuity (sickest/highest SOFA first)
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

console.log(`\n${BOLD}${BLUE}=== E9 ICU / Critical Care Workflow Tests ===${RESET}\n`);

// ===== 1. Static audit — guarded routes + server-side scoring + fail-closed tenant =====
console.log(`${BOLD}[1] Static audit — /api/icu/* guarded (auth+role+tenant) + server-side scoring${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');

const routeChecks = [
    { p: "app.get('/api/icu/patients',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/patients guarded (auth+role+tenant)' },
    { p: "app.post('/api/icu/flowsheet',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/flowsheet guarded (auth+role+tenant)' },
    { p: "app.post('/api/icu/monitoring',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/monitoring (legacy alias) guarded (auth+role+tenant)' },
    { p: "app.get('/api/icu/flowsheet',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/flowsheet guarded (auth+role+tenant)' },
    { p: "app.get('/api/icu/monitoring/:admissionId',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/monitoring/:admissionId guarded' },
    { p: "app.post('/api/icu/ventilator',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/ventilator guarded (auth+role+tenant)' },
    { p: "app.get('/api/icu/ventilator/:admissionId',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/ventilator/:admissionId guarded' },
    { p: "app.post('/api/icu/infusion',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/infusion guarded (auth+role+tenant)' },
    { p: "app.get('/api/icu/infusion/:admissionId',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/infusion/:admissionId guarded' },
    { p: "app.post('/api/icu/score',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/score guarded (auth+role+tenant)' },
    { p: "app.post('/api/icu/scores',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/scores (legacy alias) guarded' },
    { p: "app.get('/api/icu/scores/:admissionId',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/scores/:admissionId guarded' },
    { p: "app.post('/api/icu/fluid-balance',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'POST /api/icu/fluid-balance guarded (auth+role+tenant)' },
    { p: "app.get('/api/icu/fluid-balance/:admissionId',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/fluid-balance/:admissionId guarded' },
    { p: "app.get('/api/icu/board',requireAuth,requireRole('icu','nursing','doctor'),requireTenantScope", l: 'GET /api/icu/board guarded (auth+role+tenant)' }
];
for (const { p, l } of routeChecks) assert(clean.includes(p.replace(/\s+/g, '')), l, p);

assert(clean.includes("functione9RequireTenant(req)") && clean.includes("err.e9Status=403"), 'e9RequireTenant fail-closed helper present (null tenant => 403)');
assert(clean.includes("functione9IntId(v)") && clean.includes("Number.isInteger(n)"), 'e9IntId integer coercion guard present (no padded-id bypass)');
assert(clean.includes("icuScoring.computeICUScores("), 'POST /api/icu/score computes acuity SERVER-SIDE via icuScoring.computeICUScores (anti-spoof)');
assert(clean.includes("functione9LoadActiveIcuAdmission(") && clean.includes("row.status!=='Active'") && clean.includes("E9_ICU_WARD_TYPES.includes(row.ward_type)"), 'e9LoadActiveIcuAdmission validates Active + ICU ward');
assert(clean.includes("E9_ICU_WARD_TYPES=['ICU','NICU','CCU']"), 'ICU ward types defined server-side');
// patient_id derived server-side from admission (not client-trusted) on writes.
assert(clean.includes("adm.id,adm.patient_id"), 'flowsheet/vent/infusion/score stamp server-derived adm.id + adm.patient_id (not client patient_id)');
// audit on sensitive writes.
assert(clean.includes("'ICU_SCORE','ICU'") && clean.includes("'ICU_FLOWSHEET','ICU'") && clean.includes("'ICU_INFUSION','ICU'"), 'sensitive ICU writes call logAudit (flowsheet/score/infusion)');

// ===== 2. Admission-scoping gate re-simulation =====
console.log(`\n${BOLD}[2] Admission-scoping gate (e9LoadActiveIcuAdmission) simulation${RESET}`);

const ICU_WARDS = ['ICU', 'NICU', 'CCU'];
function freshDb() {
    return {
        patients: [{ id: 11, tenant_id: 1 }, { id: 22, tenant_id: 2 }],
        admissions: [
            { id: 101, patient_id: 11, status: 'Active', ward_type: 'ICU', tenant_id: 1 },
            { id: 102, patient_id: 11, status: 'Discharged', ward_type: 'ICU', tenant_id: 1 },
            { id: 103, patient_id: 11, status: 'Active', ward_type: 'General', tenant_id: 1 }, // ward not ICU
            { id: 202, patient_id: 22, status: 'Active', ward_type: 'ICU', tenant_id: 2 }
        ]
    };
}
function e9IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}
// mirrors server e9LoadActiveIcuAdmission -> returns {status, patient_id?}
function loadAdmission(db, rawId, tenantId) {
    const aid = e9IntId(rawId);
    if (!aid) return { status: 422 };
    const row = db.admissions.find(a => a.id === aid && a.tenant_id === tenantId);
    if (!row) return { status: 404 };
    if (row.status !== 'Active') return { status: 409, reason: 'not-active' };
    if (!ICU_WARDS.includes(row.ward_type)) return { status: 409, reason: 'not-icu' };
    return { status: 200, patient_id: row.patient_id, admission_id: row.id };
}

{
    const db = freshDb();
    assert(loadAdmission(db, 101, 1).status === 200, 'tenant1 writes to own Active ICU admission #101 => 200');
    assert(loadAdmission(db, 101, 1).patient_id === 11, 'patient_id derived server-side from admission (11), not client');
    assert(loadAdmission(db, 202, 1).status === 404, 'tenant1 -> tenant2 admission #202 => 404 (cross-tenant blocked, no leak)');
    assert(loadAdmission(db, 999, 1).status === 404, 'non-existent admission #999 => 404');
    assert(loadAdmission(db, 102, 1).status === 409 && loadAdmission(db, 102, 1).reason === 'not-active', 'Discharged admission #102 => 409 (cannot record ICU data)');
    assert(loadAdmission(db, 103, 1).status === 409 && loadAdmission(db, 103, 1).reason === 'not-icu', 'Active but non-ICU ward admission #103 => 409');
    assert(loadAdmission(db, 0, 1).status === 422, 'id 0 => 422 (invalid)');
    assert(loadAdmission(db, '5x', 1).status === 422, "id '5x' => 422 (non-integer)");
    assert(loadAdmission(db, '0101', 1).status === 200, "padded id '0101' coerces to integer 101 => 200 (numeric, not string-spoof)");
    assert(loadAdmission(db, ' 101 ', 1).status === 200, "whitespace id ' 101 ' coerces to 101 (Number) => 200");
}

// ===== 3. Board acuity-sort re-simulation =====
console.log(`\n${BOLD}[3] ICU board acuity sort (sickest first)${RESET}`);
function buildBoard(rows) {
    // rows: { admission_id, sofa|null, apache|null, gcs|null, on_vent }
    const board = rows.map(p => {
        const sofa = p.sofa, apache = p.apache, gcs = p.gcs;
        const acuity = (sofa !== null ? sofa : -1) * 1000 + (apache !== null ? apache : 0) + (gcs !== null ? (15 - gcs) : 0);
        return { admission_id: p.admission_id, latest_sofa: sofa, acuity };
    });
    board.sort((x, y) => y.acuity - x.acuity);
    return board;
}
{
    const board = buildBoard([
        { admission_id: 1, sofa: 4, apache: 10, gcs: 14, on_vent: false },
        { admission_id: 2, sofa: 16, apache: 30, gcs: 6, on_vent: true },   // sickest
        { admission_id: 3, sofa: 9, apache: 18, gcs: 10, on_vent: true },
        { admission_id: 4, sofa: null, apache: null, gcs: null, on_vent: false } // unscored => after scored
    ]);
    assert(board[0].admission_id === 2, 'board[0] is the highest-SOFA patient (#2, SOFA 16)');
    assert(board[1].admission_id === 3, 'board[1] is the next-sickest (#3, SOFA 9)');
    assert(board[2].admission_id === 1, 'board[2] is the least-sick scored patient (#1, SOFA 4)');
    assert(board[3].admission_id === 4, 'unscored patient (#4) sorts LAST (not treated as low acuity above scored patients)');
    const desc = board.every((b, i) => i === 0 || board[i - 1].acuity >= b.acuity);
    assert(desc, 'board is sorted descending by acuity (sickest first)');
}

// ===== 4. C1 regression — unmeasured GCS persists as NULL (not 0), no acuity inflation =====
console.log(`\n${BOLD}[4] C1 — unmeasured GCS persists as NULL (not 0) & does not inflate acuity${RESET}`);
{
    // Mirror the server store: icu_scores.gcs <- (result.gcs ?? null). GCS=0 is medically impossible.
    const storeGcs = (resultGcs) => (resultGcs ?? null);
    assert(storeGcs(null) === null, 'unmeasured GCS (result.gcs null) persists as NULL, not 0');
    assert(storeGcs(0) === 0, 'a literal computed 0 is preserved (?? only nulls null/undefined) — engine never emits 0 anyway');
    assert(storeGcs(7) === 7, 'measured GCS 7 persists unchanged');

    // Board reads gcs back: Number(null) would be 0, so the board must treat null as null (no read coercion).
    // Two patients, identical SOFA/APACHE; one has unmeasured GCS, the other a genuinely low GCS 3.
    const readGcs = (stored) => (stored === null ? null : Number(stored));
    const acuityOf = (sofa, apache, gcs) =>
        (sofa !== null ? sofa : -1) * 1000 + (apache !== null ? apache : 0) + (gcs !== null ? (15 - gcs) : 0);

    const unmeasured = acuityOf(5, 10, readGcs(storeGcs(null))); // gcs null => +0  => 5010
    const criticalGcs3 = acuityOf(5, 10, readGcs(storeGcs(3)));  // gcs 3 => +12     => 5022
    assert(unmeasured === 5010, 'unmeasured-GCS acuity adds 0 GCS points (5*1000+10+0=5010)');
    assert(criticalGcs3 === 5022, 'genuine GCS 3 adds (15-3)=12 acuity points (5*1000+10+12=5022)');
    assert(criticalGcs3 > unmeasured, 'genuinely critical (GCS 3) patient outranks the unmeasured-GCS patient (no false +15 inflation)');

    // Pre-fix bug: storing 0 then reading 0 would have added (15-0)=15 and a clinically impossible "GCS 0".
    const buggyStore = (resultGcs) => (resultGcs === null ? 0 : resultGcs);
    const buggyAcuity = acuityOf(5, 10, readGcs(buggyStore(null))); // gcs 0 => +15  => 5025
    assert(buggyAcuity === 5025 && buggyAcuity > criticalGcs3, 'guard: old (null->0) behavior WOULD have inflated acuity above the truly-critical patient (regression locked out)');

    // Static audit: server STORES gcs as (result.gcs ?? null) and the board READS NULL back as null
    // (Number(null)=0 would silently re-introduce the +15 inflation).
    assert(serverContent.includes('(result.gcs ?? null)'), 'e9PostScore stores unmeasured GCS as NULL (result.gcs ?? null), not 0');
    assert(serverContent.includes('(score && score.gcs != null) ? Number(score.gcs) : null'), 'board read keeps NULL gcs as null (guards Number(null)=0 acuity inflation)');
}

// ===== 5. I1 regression — bed-resolved ICU ward (b.ward_id) is visible on board/list =====
console.log(`\n${BOLD}[5] I1 — admission reachable by write-gate (bed-resolved ICU ward) also appears on board${RESET}`);
{
    const ICU = ['ICU', 'NICU', 'CCU'];
    // Ward resolution mirrors server: COALESCE(b.ward_id, a.ward_id) -> ward_type.
    const wards = { 50: 'ICU', 60: 'General' };
    const beds = { 500: { ward_id: 50, tenant_id: 1 } }; // bed in ICU ward 50
    function resolveWardType(adm) {
        const bed = adm.bed_id != null ? beds[adm.bed_id] : null;
        const wardId = (bed && bed.ward_id != null) ? bed.ward_id : adm.ward_id; // COALESCE(b.ward_id, a.ward_id)
        return wards[wardId] || null;
    }
    // Write-gate admit: ICU ward comes from the BED; a.ward_id is non-ICU/null.
    const adm = { id: 301, patient_id: 33, status: 'Active', bed_id: 500, ward_id: 60, tenant_id: 1 };

    // Write gate (e9LoadActiveIcuAdmission) accepts it -> data can be written.
    const gateWardType = resolveWardType(adm);
    assert(gateWardType === 'ICU', 'write-gate resolves ICU ward via COALESCE(b.ward_id, a.ward_id) -> data writable');

    // Board/list query MUST use the SAME resolution -> patient appears (no orphaned/invisible ICU record).
    const board = [adm].filter(a => a.status === 'Active' && a.tenant_id === 1 && ICU.includes(resolveWardType(a)));
    assert(board.length === 1 && board[0].id === 301, 'bed-resolved ICU admission #301 appears on board (write-gate ↔ board aligned)');

    // Guard: the OLD a.ward_id-only join would have hidden it (a.ward_id=60 General).
    const oldBoard = [adm].filter(a => a.status === 'Active' && a.tenant_id === 1 && ICU.includes(wards[a.ward_id] || null));
    assert(oldBoard.length === 0, 'guard: old a.ward_id-only join WOULD have hidden #301 (invisible ICU patient — regression locked out)');

    // Static audit: both read queries now use the COALESCE bed-then-ward resolution.
    const coalesceJoins = (serverContent.match(/JOIN wards w ON COALESCE\(b\.ward_id, a\.ward_id\) = w\.id AND w\.tenant_id/g) || []).length;
    assert(coalesceJoins >= 3, 'write-gate + /api/icu/patients + /api/icu/board all resolve ward via COALESCE(b.ward_id, a.ward_id) (>=3 occurrences)');
}

console.log(`\n${BOLD}${BLUE}=== E9 ICU Workflow Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
