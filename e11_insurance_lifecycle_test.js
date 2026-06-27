/**
 * e11_insurance_lifecycle_test.js
 * ==========================================
 * E11 Insurance / NPHIES — business workflow + claim/pre-auth state machine.
 * DB-free: static-audits the E11 server block (RBAC + tenant scope + audit + gating + server-authoritative
 * status), then exercises the pure state machine for legal/illegal transitions (=> 409/422 server-side).
 *
 *   NODE_PATH=.../namaweb/node_modules node e11_insurance_lifecycle_test.js
 */
const fs = require('fs');
const path = require('path');
const eng = require('./e11_insurance_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
console.log(`\n${BOLD}${BLUE}=== E11 Insurance Lifecycle & State Machine Tests ===${RESET}\n`);

// ===== 1. Static audit — E11 block exists, fail-closed, RBAC + tenant scope + audit + gating =====
console.log(`${BOLD}[1] Static audit — server hardening${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const start = serverContent.indexOf('===== E11 INSURANCE / NPHIES');
const end = serverContent.indexOf('===== end E11 INSURANCE / NPHIES');
assert(start > 0 && end > start, 'E11 block located in server.js');
const block = serverContent.slice(start, end);
const bc = block.replace(/\s+/g, '');

assert(bc.includes('functione11RequireTenant(req)') && bc.includes('err.e11Status=403'), 'e11RequireTenant fail-closed (null tenant => 403, no unscoped fallback)');
assert(bc.includes('functione11IntId(v)') && bc.includes('Number.isInteger(n)'), 'e11IntId integer-id guard (no padded-string/float bypass)');
assert(bc.includes('functione11NphiesEnabled()') && bc.includes("process.env.NPHIES_ENABLED"), 'NPHIES gate reads NPHIES_ENABLED env (default OFF)');

// every E11 route carries requireAuth + requireRole + requireTenantScope
const routeDecls = block.match(/app\.(get|post|put)\('\/api\/(insurance|nphies)[^']*'[^\n]*/g) || [];
assert(routeDecls.length >= 14, `E11 declares the full route surface (found ${routeDecls.length})`);
let allGuarded = true, unguarded = [];
for (const r of routeDecls) {
    const rc = r.replace(/\s+/g, '');
    if (!(rc.includes('requireAuth') && rc.includes('requireRole(...E11_INS_ROLES)') && rc.includes('requireTenantScope'))) { allGuarded = false; unguarded.push(r.slice(0, 70)); }
}
assert(allGuarded, 'every E11 route has requireAuth + requireRole(insurance/finance) + requireTenantScope', unguarded.join(' ; '));

// every query in the block is tenant-scoped (no bare FROM insurance_* without tenant_id in same statement)
assert(bc.includes("FROMinsurance_claimsWHEREtenant_id=$1ORDERBY"), 'claims list tenant-scoped (AND tenant_id=$1)');
assert(bc.includes("FROMinsurance_companiesWHEREtenant_id=$1ORDERBY"), 'companies list tenant-scoped');
assert(bc.includes("FROMinsurance_policiesWHEREtenant_id=$1ORDERBY"), 'policies list tenant-scoped');
assert(bc.includes("FROMinsurance_eligibility_checksWHEREtenant_id=$1"), 'eligibility list tenant-scoped');
assert(bc.includes("FROMinsurance_pre_authorizationsWHEREtenant_id=$1"), 'pre-auth list tenant-scoped');
assert(bc.includes("FROMinsurance_claim_denialsWHEREtenant_id=$1"), 'denials list tenant-scoped');
assert(bc.includes("FROMinsurance_payer_pricingWHEREtenant_id=$1"), 'payer-pricing list tenant-scoped');
// :id lookups always carry id + tenant_id
assert(bc.includes("FROMinsurance_claimsWHEREid=$1ANDtenant_id=$2FORUPDATE"), 'claim :id lookup tenant-scoped + FOR UPDATE (race-safe)');
assert(bc.includes("FROMinsurance_pre_authorizationsWHEREid=$1ANDtenant_id=$2FORUPDATE"), 'pre-auth :id lookup tenant-scoped + FOR UPDATE');
assert(bc.includes("FROMinsurance_claim_denialsWHEREid=$1ANDtenant_id=$2FORUPDATE"), 'denial :id lookup tenant-scoped + FOR UPDATE');

// server-authoritative status — inserts force draft/Pending/requested; never trust client status
assert(bc.includes("'Pending','draft'"), 'claim INSERT forces Pending/draft (client cannot set approved)');
assert(bc.includes("auth_status,clinical_justification") && bc.includes("'requested'"), 'pre-auth INSERT forces requested state');
// client lifecycle is NEVER read; the one read of req.body.status (legacy PUT) is only MAPPED to a
// lifecycle target then validated by the state machine — it is never stored as the authoritative status.
assert(!bc.includes('req.body.lifecycle_status'), 'no client-supplied lifecycle_status field is ever read');
assert(bc.includes("target=status==='Approved'?'adjudicated':status==='Rejected'?'denied':null"), 'legacy status is mapped->validated (not trusted): Approved->adjudicated / Rejected->denied else reject');
assert(bc.includes("legacyStatus=target==='adjudicated'?'Approved':'Rejected'"), 'stored status is server-derived from the validated target, not the client value (anti-spoof)');

// invalid transitions are rejected with 409/422 + state machine consulted server-side
assert(bc.includes('canTransitionClaim(from,target)') || bc.includes('e11Engine.canTransitionClaim'), 'claim transition consults engine.canTransitionClaim');
assert(bc.includes('canTransitionPreAuth'), 'pre-auth decision consults engine.canTransitionPreAuth');
assert((block.match(/status\(409\)/g) || []).length >= 3, 'multiple 409 guards on invalid transitions');
assert((block.match(/status\(422\)/g) || []).length >= 2, '422 guards on invalid target/decision');

// gating — eligibility / pre-auth / submit return 503 when NPHIES disabled
assert((block.match(/status\(503\)/g) || []).length >= 3, 'NPHIES-gated routes return 503 stub when disabled (>=3)');

// audit — every mutation logs
['CREATE_INSURANCE_CLAIM', 'INSURANCE_CLAIM_TRANSITION', 'INSURANCE_PREAUTH_REQUEST', 'INSURANCE_PREAUTH_DECISION', 'INSURANCE_ELIGIBILITY_CHECK', 'INSURANCE_DENIAL_APPEAL', 'NPHIES_SUBMIT_GATED'].forEach(a => {
    assert(block.includes(a), `audit action ${a} present`);
});

// legacy PUT /:id is hardened (routes through the state machine, not a raw UPDATE status)
assert(bc.includes("app.put('/api/insurance/claims/:id'") === false || bc.includes('canTransitionClaim(from,target)'), 'legacy claims/:id PUT routed through state machine (no raw status UPDATE)');
assert(!bc.includes("UPDATEinsurance_claimsSETstatus=$1WHEREid=$2)"), 'old unscoped UPDATE status=$1 WHERE id=$2 removed');

// RBAC role wiring
assert(serverContent.includes("'Insurance': ['dashboard', 'insurance', 'reports']"), 'dedicated Insurance role added to ROLE_PERMISSIONS');

// ===== 1b. Finding 1 fix — adjudication amount guards (server-side, not client-trusted) =====
console.log(`\n${BOLD}[1b] Adjudication amount server-side guards${RESET}`);
// Guard: approved_amount > claim_amount => 422
assert(bc.includes('approved_amount')&&bc.includes('claim_amount')&&bc.includes("approved_amount(")&&bc.includes("claim_amount("), 'server fetches claim_amount and validates approved_amount <= claim_amount');
// The guards use status(422) — check we have the new Finding-1 422 guard text
assert(bc.includes('approved_amount(${finalApproved})cannotexceedclaim_amount(${claimAmount})') ||
    block.includes('approved_amount') && block.includes('cannot exceed claim_amount') && (block.match(/status\(422\)/g)||[]).length >= 3,
    'Finding 1: 422 guard — approved_amount cannot exceed claim_amount');
assert(bc.includes('patient_share(${finalPatientShare})cannotexceedapproved_amount(${finalApproved})') ||
    block.includes('patient_share') && block.includes('cannot exceed approved_amount') && (block.match(/status\(422\)/g)||[]).length >= 3,
    'Finding 1: 422 guard — patient_share cannot exceed approved_amount');
assert(bc.includes('Adjudicationamountsmustnotbenegative') ||
    block.includes('Adjudication amounts must not be negative'),
    'Finding 1: 422 guard — negative amounts rejected');

// ===== 1c. Finding 2 fix — appeal button updates denial record not transitionClaim =====
console.log(`\n${BOLD}[1c] Finding 2 — appeal-denial path server-side${RESET}`);
// denial-appeal route now also transitions claim to 'appealed' on appeal_status='appealed'
assert(bc.includes("appealStatus==='appealed'||appealStatus==='overturned'") ||
    block.includes("appealStatus === 'appealed' || appealStatus === 'overturned'"),
    "Finding 2: denial-appeal route transitions claim to 'appealed' on appeal_status='appealed' OR 'overturned'");
// client button calls appealDeniedClaim, not transitionClaim — static check on app.js
const appContent = require('fs').readFileSync(require('path').join(__dirname, 'public/js/app.js'), 'utf8');
assert(appContent.includes('appealDeniedClaim') && !appContent.includes("transitionClaim(${id},'appealed')"),
    "Finding 2: client Appeal button calls appealDeniedClaim (not transitionClaim) — denial_id resolved first");
assert(appContent.includes("window.appealDeniedClaim"),
    'Finding 2: appealDeniedClaim function defined on window');
assert(appContent.includes("/api/insurance/denials") && appContent.includes("window.appealDenial(denial.id"),
    'Finding 2: appealDeniedClaim fetches denials list and calls appealDenial with resolved denial_id');

// ===== 2. Claim state machine — legal path + illegal transitions =====
console.log(`\n${BOLD}[2] Claim state machine${RESET}`);
assert(eng.canTransitionClaim('draft', 'submitted'), 'draft -> submitted legal');
assert(eng.canTransitionClaim('submitted', 'adjudicated'), 'submitted -> adjudicated legal');
assert(eng.canTransitionClaim('adjudicated', 'remittance_posted'), 'adjudicated -> remittance_posted legal');
assert(eng.canTransitionClaim('submitted', 'denied'), 'submitted -> denied legal');
assert(eng.canTransitionClaim('denied', 'appealed'), 'denied -> appealed legal');
assert(eng.canTransitionClaim('appealed', 'adjudicated'), 'appealed -> adjudicated legal');
// illegal
assert(!eng.canTransitionClaim('draft', 'adjudicated'), 'draft -> adjudicated ILLEGAL (cannot skip submit) => 409');
assert(!eng.canTransitionClaim('draft', 'remittance_posted'), 'draft -> remittance_posted ILLEGAL => 409');
assert(!eng.canTransitionClaim('remittance_posted', 'draft'), 'remittance_posted -> draft ILLEGAL (terminal) => 409');
assert(!eng.canTransitionClaim('adjudicated', 'submitted'), 'adjudicated -> submitted ILLEGAL (no backward) => 409');
assert(!eng.canTransitionClaim('draft', 'banana'), 'unknown target ILLEGAL => 422');
assert(!eng.canTransitionClaim('nonsense', 'submitted'), 'unknown source ILLEGAL');

// ===== 3. Pre-auth state machine =====
console.log(`\n${BOLD}[3] Pre-auth state machine${RESET}`);
assert(eng.canTransitionPreAuth('requested', 'approved'), 'requested -> approved legal');
assert(eng.canTransitionPreAuth('requested', 'denied'), 'requested -> denied legal');
assert(eng.canTransitionPreAuth('requested', 'partial'), 'requested -> partial legal');
assert(!eng.canTransitionPreAuth('approved', 'denied'), 'approved -> denied ILLEGAL (terminal) => 409');
assert(!eng.canTransitionPreAuth('denied', 'approved'), 'denied -> approved ILLEGAL => 409');
assert(!eng.canTransitionPreAuth('requested', 'requested'), 'requested -> requested ILLEGAL (no self-loop)');

console.log(`\n${BOLD}${BLUE}=== E11 Lifecycle Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
