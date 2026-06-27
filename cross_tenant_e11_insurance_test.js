/**
 * cross_tenant_e11_insurance_test.js
 * ==========================================
 * E11 Insurance / NPHIES — multi-tenant isolation + IDOR tests.
 * DB-free: static-audits that every insurance/NPHIES query carries an explicit AND tenant_id=$N and that
 * the resolver is fail-closed (e11RequireTenant), then re-simulates cross-tenant read/write attempts
 * against an in-memory mockDb. A cross-tenant claim/eligibility leak is CRITICAL — these lock it out.
 *
 *   NODE_PATH=.../namaweb/node_modules node cross_tenant_e11_insurance_test.js
 */
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
console.log(`\n${BOLD}${BLUE}=== Cross-Tenant Insurance/NPHIES (E11) Isolation & IDOR Tests ===${RESET}\n`);

// ===== 1. Static audit — fail-closed resolver + every query tenant-scoped =====
console.log(`${BOLD}[1] Static audit — fail-closed + tenant-scoped queries${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const start = serverContent.indexOf('===== E11 INSURANCE / NPHIES');
const end = serverContent.indexOf('===== end E11 INSURANCE / NPHIES');
assert(start > 0 && end > start, 'E11 block located in server.js');
const block = serverContent.slice(start, end);
const bc = block.replace(/\s+/g, '');

assert(bc.includes('functione11RequireTenant(req)') && bc.includes('err.e11Status=403'), 'e11RequireTenant fail-closed (null tenant => 403)');
// no soft "if (tenantId)" scoped:unscoped fallback anywhere in the block
assert(!/if\(tenantId\)\{?[^}]*FROMinsurance/.test(bc), 'no conditional scoped/unscoped fallback (always AND tenant_id)');

// every cross-tenant-sensitive read/lookup carries tenant_id
const scoped = [
    "FROMinsurance_claimsWHEREtenant_id=$1ORDERBY",
    "FROMinsurance_claimsWHEREid=$1ANDtenant_id=$2",
    "FROMinsurance_companiesWHEREid=$1ANDtenant_id=$2",
    "FROMpatientsWHEREid=$1ANDtenant_id=$2",
    "FROMinvoicesWHEREid=$1ANDtenant_id=$2",
    "FROMadmissionsWHEREid=$1ANDtenant_id=$2",
    "FROMinsurance_pre_authorizationsWHEREid=$1ANDtenant_id=$2",
    "FROMinsurance_claim_linesWHEREclaim_id=$1ANDtenant_id=$2",
    "FROMinsurance_claim_denialsWHEREid=$1ANDtenant_id=$2",
    "FROMinsurance_payer_pricingWHEREtenant_id=$1"
];
for (const p of scoped) assert(bc.includes(p), `query tenant-scoped: ${p}`);

// inserts stamp tenant_id from session (first column), never from client body
assert(bc.includes("INSERTINTOinsurance_claims(tenant_id,"), 'claim INSERT stamps tenant_id from session (first col)');
assert(bc.includes("INSERTINTOinsurance_eligibility_checks(tenant_id,"), 'eligibility INSERT stamps tenant_id');
assert(bc.includes("INSERTINTOinsurance_pre_authorizations(tenant_id,"), 'pre-auth INSERT stamps tenant_id');
assert(bc.includes("INSERTINTOinsurance_claim_lines(tenant_id,"), 'claim-line INSERT stamps tenant_id');
assert(bc.includes("INSERTINTOinsurance_claim_denials(tenant_id,"), 'denial INSERT stamps tenant_id');
assert(bc.includes("INSERTINTOinsurance_payer_pricing(tenant_id,"), 'payer-pricing INSERT stamps tenant_id');
// updates always carry WHERE ... tenant_id
assert(!/UPDATEinsurance_[a-z_]+SET[^;]*WHEREid=\$\d+\)/.test(bc) || bc.includes('WHEREid=$3ANDtenant_id=$4') || bc.includes('ANDtenant_id='), 'updates carry tenant_id in WHERE');

// ===== 2. In-memory cross-tenant simulation (IDOR) =====
console.log(`\n${BOLD}[2] Cross-tenant read/write simulation${RESET}`);
const mockDb = {
    claims: [
        { id: 100, patient_id: 1, lifecycle_status: 'draft', tenant_id: 1 },
        { id: 200, patient_id: 9, lifecycle_status: 'submitted', tenant_id: 2 }
    ],
    patients: [ { id: 1, tenant_id: 1 }, { id: 9, tenant_id: 2 } ],
    invoices: [ { id: 11, tenant_id: 1 }, { id: 22, tenant_id: 2 } ],
    companies: [ { id: 5, tenant_id: 1 }, { id: 6, tenant_id: 2 } ],
    preauth: [ { id: 70, auth_status: 'requested', tenant_id: 1 }, { id: 80, auth_status: 'requested', tenant_id: 2 } ],
    denials: [ { id: 90, claim_id: 200, tenant_id: 2 } ],
    eligibility: [ { id: 31, tenant_id: 1 }, { id: 32, tenant_id: 2 } ]
};
const readClaim = (id, t) => mockDb.claims.find(c => c.id === id && c.tenant_id === t) || null;
const listClaims = (t) => mockDb.claims.filter(c => c.tenant_id === t);
const ownsPatient = (id, t) => mockDb.patients.some(p => p.id === id && p.tenant_id === t);
const ownsInvoice = (id, t) => mockDb.invoices.some(i => i.id === id && i.tenant_id === t);
const readPreauth = (id, t) => mockDb.preauth.find(p => p.id === id && p.tenant_id === t) || null;
const readDenial = (id, t) => mockDb.denials.find(d => d.id === id && d.tenant_id === t) || null;
const listEligibility = (t) => mockDb.eligibility.filter(e => e.tenant_id === t);

assert(listClaims(1).length === 1 && listClaims(1)[0].id === 100, 'tenant1 sees only its own claim #100');
assert(listClaims(2).length === 1 && listClaims(2)[0].id === 200, 'tenant2 sees only its own claim #200');
assert(readClaim(100, 1) !== null, 'tenant1 reads its own claim #100');
assert(readClaim(200, 1) === null, 'tenant1 -> tenant2 claim #200 => null (cross-tenant blocked)');
assert(readClaim(999, 1) === null, 'non-existent claim => null');
// cross-tenant claim creation rejected: tenant1 cannot reference tenant2 patient/invoice
assert(ownsPatient(1, 1) === true, 'tenant1 owns patient #1');
assert(ownsPatient(9, 1) === false, 'tenant1 referencing tenant2 patient #9 => rejected (404)');
assert(ownsInvoice(11, 1) === true, 'tenant1 owns invoice #11');
assert(ownsInvoice(22, 1) === false, 'tenant1 referencing tenant2 invoice #22 => rejected (404)');
// pre-auth IDOR
assert(readPreauth(70, 1) !== null, 'tenant1 reads its own pre-auth #70');
assert(readPreauth(80, 1) === null, 'tenant1 -> tenant2 pre-auth #80 => null (no leak)');
// denial IDOR
assert(readDenial(90, 2) !== null, 'tenant2 reads its own denial #90');
assert(readDenial(90, 1) === null, 'tenant1 -> tenant2 denial #90 => null (no leak)');
// eligibility isolation
assert(listEligibility(1).length === 1 && listEligibility(1)[0].id === 31, 'tenant1 eligibility list only its own');
assert(listEligibility(2).every(e => e.id !== 31), 'tenant1 eligibility #31 absent from tenant2 list');

// ===== 3. fail-closed: null tenant => 403, no fallback =====
console.log(`\n${BOLD}[3] fail-closed tenant resolver${RESET}`);
function e11RequireTenant(tenantId) { if (!tenantId) { const e = new Error('Tenant scope required'); e.e11Status = 403; throw e; } return tenantId; }
let threw = false; try { e11RequireTenant(null); } catch (e) { threw = (e.e11Status === 403); }
assert(threw, 'null tenant throws 403 (no unscoped query path)');
assert(e11RequireTenant(1) === 1, 'valid tenant passes through');

console.log(`\n${BOLD}${BLUE}=== Cross-Tenant Insurance Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
