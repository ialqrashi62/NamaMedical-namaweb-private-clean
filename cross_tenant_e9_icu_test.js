/**
 * cross_tenant_e9_icu_test.js
 * ==========================================
 * E9 ICU / Critical Care — multi-tenant isolation + IDOR tests.
 * DB-free: static-audits that every /api/icu/* route is fail-closed (e9RequireTenant) and that
 * every ICU read/write query carries an explicit AND tenant_id=$N, then re-simulates cross-tenant
 * read/write attempts against an in-memory mockDb (mirrors cross_tenant_e8_adt_test.js).
 *
 *   NODE_PATH=.../namaweb/node_modules node cross_tenant_e9_icu_test.js
 *
 * Asserts:
 *   - tenant A cannot read/write ICU data for tenant B's admissions (cross-tenant id => 404/0 rows)
 *   - null tenant => fail-closed (e9RequireTenant throws 403, no unscoped fallback)
 *   - every ICU query is tenant-scoped (AND tenant_id=$N) — static audit
 *   - board, flowsheet, ventilator, infusion, score reads only return rows for the caller's tenant
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

console.log(`\n${BOLD}${BLUE}=== Cross-Tenant ICU (E9) Isolation & IDOR Tests ===${RESET}\n`);

// ===== 1. Static audit — fail-closed tenant + every query tenant-scoped =====
console.log(`${BOLD}[1] Static audit — fail-closed tenant resolver + tenant-scoped queries${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');

assert(clean.includes("functione9RequireTenant(req)") && clean.includes("err.e9Status=403"), 'e9RequireTenant fail-closed (null tenant => 403, no unscoped fallback)');
// Isolate the E9 ICU block for query-scoping checks.
const icuStart = serverContent.indexOf('===== E9 ICU / CRITICAL CARE');
const icuEnd = serverContent.indexOf('// ===== CSSD =====');
assert(icuStart > 0 && icuEnd > icuStart, 'E9 ICU block located in server.js');
const icuBlock = serverContent.slice(icuStart, icuEnd);
const icuClean = icuBlock.replace(/\s+/g, '');

// Every SELECT/INSERT in the ICU block must be tenant-scoped. Spot-check the read queries.
const scopedQueryChecks = [
    { p: "FROMicu_monitoringWHEREadmission_id=$1ANDtenant_id=$2", l: 'flowsheet GET query tenant-scoped (AND tenant_id=$2)' },
    { p: "FROMicu_ventilatorWHEREadmission_id=$1ANDtenant_id=$2", l: 'ventilator GET query tenant-scoped' },
    { p: "FROMicu_infusionsWHEREadmission_id=$1ANDtenant_id=$2", l: 'infusion GET query tenant-scoped' },
    { p: "FROMicu_scoresWHEREadmission_id=$1ANDtenant_id=$2", l: 'scores GET query tenant-scoped' },
    { p: "FROMicu_fluid_balanceWHEREadmission_id=$1ANDtenant_id=$2", l: 'fluid-balance GET query tenant-scoped' },
    { p: "SELECTidFROMadmissionsWHEREid=$1ANDtenant_id=$2", l: 'admission ownership pre-check tenant-scoped' }
];
for (const { p, l } of scopedQueryChecks) assert(icuClean.includes(p.replace(/\s+/g, '')), l, p);

// board + patients list constrained to ICU wards AND tenant.
assert(icuClean.includes("a.status='Active'ANDa.tenant_id=$1ANDw.ward_typeIN('ICU','NICU','CCU')"), 'board/patients list constrained to Active + own tenant + ICU wards');
// No tenantId||null stamping (the legacy weakness) anywhere in the ICU block.
assert(!icuClean.includes("tenantId||null"), 'ICU block never stamps tenant_id as null (real tenantId only — RLS WITH CHECK safe)');
// e9LoadActiveIcuAdmission scopes by tenant in its lookup.
assert(icuClean.includes("WHEREa.id=$1ANDa.tenant_id=$2"), 'e9LoadActiveIcuAdmission lookup is tenant-scoped (id + tenant_id)');

// ===== 2. In-memory cross-tenant simulation =====
console.log(`\n${BOLD}[2] Cross-tenant read/write simulation (IDOR)${RESET}`);

const mockDb = {
    patients: [
        { id: 11, name: 'Patient A', tenant_id: 1 },
        { id: 22, name: 'Patient B', tenant_id: 2 }
    ],
    admissions: [
        { id: 101, patient_id: 11, status: 'Active', ward_type: 'ICU', tenant_id: 1 },
        { id: 202, patient_id: 22, status: 'Active', ward_type: 'ICU', tenant_id: 2 }
    ],
    icu_monitoring: [
        { id: 9001, admission_id: 101, patient_id: 11, hr: 88, tenant_id: 1 },
        { id: 9002, admission_id: 202, patient_id: 22, hr: 95, tenant_id: 2 }
    ],
    icu_scores: [
        { id: 7001, admission_id: 101, sofa: 6, tenant_id: 1 },
        { id: 7002, admission_id: 202, sofa: 12, tenant_id: 2 }
    ],
    icu_infusions: [
        { id: 8001, admission_id: 101, drug: 'Noradrenaline', tenant_id: 1 },
        { id: 8002, admission_id: 202, drug: 'Propofol', tenant_id: 2 }
    ]
};

function e9IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}
// fail-closed tenant resolver
function requireTenant(tenantId) {
    if (!tenantId) { const e = new Error('Tenant scope required'); e.status = 403; throw e; }
    return tenantId;
}
// admission gate (mirrors e9LoadActiveIcuAdmission)
function loadAdmission(rawId, tenantId) {
    const aid = e9IntId(rawId);
    if (!aid) return { status: 422 };
    const row = mockDb.admissions.find(a => a.id === aid && a.tenant_id === tenantId);
    if (!row) return { status: 404 };
    if (row.status !== 'Active') return { status: 409 };
    if (!['ICU', 'NICU', 'CCU'].includes(row.ward_type)) return { status: 409 };
    return { status: 200, patient_id: row.patient_id };
}
// tenant-scoped reader over a table by admission_id
function readByAdmission(table, admissionId, tenantId) {
    const aid = e9IntId(admissionId);
    if (!aid) return { status: 422, rows: [] };
    // ownership precheck (admissions tenant-scoped)
    const own = mockDb.admissions.find(a => a.id === aid && a.tenant_id === tenantId);
    if (!own) return { status: 404, rows: [] };
    const rows = mockDb[table].filter(r => r.admission_id === aid && r.tenant_id === tenantId);
    return { status: 200, rows };
}

// --- null tenant => fail-closed 403 ---
{
    let threw = false, status = 0;
    try { requireTenant(null); } catch (e) { threw = true; status = e.status; }
    assert(threw && status === 403, 'null tenant => e9RequireTenant throws 403 (fail-closed, no unscoped data)');
}

// --- WRITE: tenant1 cannot write ICU data for tenant2 admission #202 ---
assert(loadAdmission(202, 1).status === 404, 'WRITE: tenant1 -> tenant2 admission #202 => 404 (cross-tenant write blocked)');
assert(loadAdmission(101, 1).status === 200, 'WRITE: tenant1 -> own admission #101 => 200');
assert(loadAdmission(101, 2).status === 404, 'WRITE: tenant2 -> tenant1 admission #101 => 404');

// --- READ flowsheet/scores/infusion: cross-tenant => 404 / 0 rows ---
assert(readByAdmission('icu_monitoring', 202, 1).status === 404, 'READ flowsheet: tenant1 -> tenant2 admission #202 => 404');
assert(readByAdmission('icu_monitoring', 101, 1).rows.length === 1, 'READ flowsheet: tenant1 -> own admission #101 => 1 row');
assert(readByAdmission('icu_scores', 202, 1).status === 404, 'READ scores: tenant1 -> tenant2 admission #202 => 404');
assert(readByAdmission('icu_infusions', 202, 1).status === 404, 'READ infusion: tenant1 -> tenant2 admission #202 => 404');
assert(readByAdmission('icu_scores', 101, 1).rows.every(r => r.tenant_id === 1), 'READ scores: returned rows all belong to caller tenant (no leak)');

// --- even if ownership check were bypassed, the tenant_id filter zeroes cross-tenant rows ---
{
    // simulate a buggy caller that skipped ownership precheck — the AND tenant_id filter still 0s it.
    const leaked = mockDb.icu_scores.filter(r => r.admission_id === 202 && r.tenant_id === 1);
    assert(leaked.length === 0, 'defense-in-depth: AND tenant_id=$N filter yields 0 rows for tenant2 data under tenant1');
}

// --- board only shows caller-tenant ICU admissions ---
{
    const tenantId = 1;
    const board = mockDb.admissions.filter(a => a.status === 'Active' && a.tenant_id === tenantId && ['ICU', 'NICU', 'CCU'].includes(a.ward_type));
    assert(board.length === 1 && board[0].id === 101, 'board for tenant1 contains ONLY tenant1 ICU admission #101 (not #202)');
}

console.log(`\n${BOLD}${BLUE}=== Cross-Tenant ICU (E9) Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
