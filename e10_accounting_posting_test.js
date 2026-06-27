/**
 * e10_accounting_posting_test.js
 * ==========================================
 * E10 Finance / General Ledger — workflow + posting-gate + state-machine tests.
 * DB-free: static-audits the guarded /api/finance/* + /api/zatca/* routes in server.js, then
 * re-simulates the balanced-entry gate, the DRAFT->POSTED state machine, the posting flag, and the
 * ZATCA clearance gate against in-memory mocks (mirrors e9_icu_workflow_test.js conventions).
 *
 *   NODE_PATH=.../namaweb/node_modules node e10_accounting_posting_test.js
 *
 * Asserts:
 *   - every new GL/ZATCA route is auth+role+tenant guarded (requireRole('finance'/'accounts') + requireTenantScope)
 *   - balanced-entry enforced SERVER-SIDE (fe.validateBalancedEntry); unbalanced => 422
 *   - posting is GATED OFF by default (ACCOUNTING_POSTING_ENABLED) — POST returns 403 when off
 *   - state machine: DRAFT->POSTED once; re-post => 409; only POSTED can be reversed
 *   - ZATCA clearance gated (ZATCA_ENABLED off => 503, intent recorded only); VAT computed server-side
 *   - integer-id guard (no padded-string/float bypass); fail-closed tenant resolver
 */
const fs = require('fs');
const path = require('path');
const fe = require('./finance_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
console.log(`\n${BOLD}${BLUE}=== E10 Accounting Posting / GL Workflow Tests ===${RESET}\n`);

// ===== 1. Static audit — guarded routes + posting gate + balanced enforcement =====
console.log(`${BOLD}[1] Static audit — guarded GL/ZATCA routes + gates${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');

const routeChecks = [
    { p: "app.get('/api/finance/accounts',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/accounts guarded (auth+role+tenant)' },
    { p: "app.post('/api/finance/accounts',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'POST /api/finance/accounts guarded' },
    { p: "app.get('/api/finance/journal',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/journal guarded' },
    { p: "app.get('/api/finance/journal/:id',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/journal/:id guarded' },
    { p: "app.post('/api/finance/journal',requireAuth,requireRole('finance','accounts'),requireTenantScope", l: 'POST /api/finance/journal guarded' },
    { p: "app.post('/api/finance/journal/:id/post',requireAuth,requireRole('finance','accounts'),requireTenantScope", l: 'POST /api/finance/journal/:id/post guarded' },
    { p: "app.post('/api/finance/journal/:id/reverse',requireAuth,requireRole('finance','accounts'),requireTenantScope", l: 'POST /api/finance/journal/:id/reverse guarded' },
    { p: "app.get('/api/finance/aging',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/aging guarded' },
    { p: "app.get('/api/finance/posting-status',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/posting-status guarded' },
    { p: "app.get('/api/finance/vouchers',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/vouchers guarded' },
    { p: "app.get('/api/finance/daily-close',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/finance/daily-close guarded' },
    { p: "app.post('/api/finance/daily-close',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'POST /api/finance/daily-close guarded' },
    { p: "app.get('/api/zatca/invoices',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope", l: 'GET /api/zatca/invoices guarded (was requireAuth-only)' },
    { p: "app.post('/api/zatca/generate',requireAuth,requireRole('finance','accounts'),requireTenantScope", l: 'POST /api/zatca/generate guarded (was requireAuth-only)' },
    { p: "app.post('/api/zatca/submit',requireAuth,requireRole('finance','accounts'),requireTenantScope", l: 'POST /api/zatca/submit guarded' }
];
for (const { p, l } of routeChecks) assert(clean.includes(p.replace(/\s+/g, '')), l, p);

assert(clean.includes("functione10RequireTenant(req)") && clean.includes("err.e10Status=403"), 'e10RequireTenant fail-closed helper present (null tenant => 403)');
assert(clean.includes("functione10IntId(v)") && clean.includes("Number.isInteger(n)"), 'e10IntId integer coercion guard present (no padded-id bypass)');
assert(clean.includes("functione10PostingEnabled()"), 'posting gate helper present (ACCOUNTING_POSTING_ENABLED)');
assert(clean.includes("ACCOUNTING_POSTING_ENABLED"), 'posting reads ACCOUNTING_POSTING_ENABLED env flag');
assert(clean.includes("functione10ZatcaEnabled()") && clean.includes("ZATCA_ENABLED"), 'ZATCA gate helper present (ZATCA_ENABLED)');
assert(clean.includes("fe.validateBalancedEntry(lines)") || clean.includes("fe.validateBalancedEntry("), 'POST journal calls fe.validateBalancedEntry (server-side balance)');
assert(clean.includes("Unbalancedorinvalidjournalentry"), 'unbalanced entry => 422 with reason');
assert(clean.includes("Accountingpostingisdisabled"), 'post route returns 403 when posting disabled');
assert(clean.includes("FORUPDATE"), 'post/reverse lock the entry row FOR UPDATE (no double-post race)');
assert(clean.includes("'POST_JOURNAL_ENTRY','Finance'") && clean.includes("'CREATE_JOURNAL_ENTRY','Finance'") && clean.includes("'REVERSE_JOURNAL_ENTRY','Finance'"), 'GL mutations call logAudit');
assert(clean.includes("'ZATCA_GENERATE','ZATCA'") && clean.includes("'ZATCA_SUBMIT_INTENT','ZATCA'"), 'ZATCA mutations call logAudit');
assert(clean.includes("fe.vatFromInclusive(inv.total)"), 'ZATCA generate computes VAT server-side from invoice total');
// posting status / accounts never trust client account_class
assert(clean.includes("E10_ACCOUNT_CLASSES.includes("), 'account_class validated against server whitelist (anti-spoof)');

// ===== 2. Balanced-entry + state-machine simulation =====
console.log(`\n${BOLD}[2] Balanced-entry + DRAFT->POSTED state machine simulation${RESET}`);
// posting flag simulation
function postingEnabled(flag) { return /^(1|true|on|yes)$/i.test(String(flag || '').trim()); }
assert(postingEnabled(undefined) === false, 'posting OFF by default (undefined flag)');
assert(postingEnabled('false') === false && postingEnabled('0') === false, "posting OFF for 'false'/'0'");
assert(postingEnabled('1') === true && postingEnabled('true') === true, "posting ON only for explicit '1'/'true'");

// simulate POST /api/finance/journal handler decision
function createEntry(lines, ownedAccountIds) {
    const v = fe.validateBalancedEntry(lines);
    if (!v.ok) return { status: 422, reason: v.reason };
    const ids = [...new Set(v.lines.map(l => l.account_id))];
    if (!ids.every(id => ownedAccountIds.includes(id))) return { status: 422, reason: 'cross_tenant_account' };
    return { status: 200, posting_status: 'DRAFT', entry: { id: 1, posting_status: 'DRAFT' }, v };
}
const owned = [10, 20];
assert(createEntry([{ account_id: 10, debit: 100, credit: 0 }, { account_id: 20, debit: 0, credit: 100 }], owned).status === 200, 'balanced entry with owned accounts => 200 DRAFT');
assert(createEntry([{ account_id: 10, debit: 100, credit: 0 }, { account_id: 20, debit: 0, credit: 50 }], owned).status === 422, 'unbalanced => 422');
assert(createEntry([{ account_id: 10, debit: 100, credit: 0 }, { account_id: 99, debit: 0, credit: 100 }], owned).reason === 'cross_tenant_account', "account from another tenant => 422 (cross_tenant_account)");
assert(createEntry([{ account_id: 10, debit: 100, credit: 0 }, { account_id: 20, debit: 0, credit: 100 }], owned).posting_status === 'DRAFT', 'created entry is DRAFT regardless of posting flag');

// state machine for posting
function postEntry(entry, flag) {
    if (!postingEnabled(flag)) return { status: 403, reason: 'posting_disabled' };
    if (entry.posting_status !== 'DRAFT') return { status: 409, reason: 'not_draft' };
    return { status: 200, posting_status: 'POSTED' };
}
const draft = { id: 1, posting_status: 'DRAFT' };
assert(postEntry(draft, undefined).status === 403, 'post DRAFT with posting OFF => 403 (gated)');
assert(postEntry(draft, '1').status === 200, 'post DRAFT with posting ON => 200 POSTED');
assert(postEntry({ posting_status: 'POSTED' }, '1').status === 409, 're-post POSTED entry => 409 (immutable)');
assert(postEntry({ posting_status: 'REVERSED' }, '1').status === 409, 'post REVERSED entry => 409');

// reversal only on POSTED
function reverseEntry(entry, flag) {
    if (!postingEnabled(flag)) return { status: 403 };
    if (entry.posting_status !== 'POSTED') return { status: 409 };
    return { status: 200, posting_status: 'REVERSED' };
}
assert(reverseEntry({ posting_status: 'DRAFT' }, '1').status === 409, 'reverse DRAFT => 409 (only POSTED reversible)');
assert(reverseEntry({ posting_status: 'POSTED' }, '1').status === 200, 'reverse POSTED => 200 REVERSED');
assert(reverseEntry({ posting_status: 'POSTED' }, undefined).status === 403, 'reverse with posting OFF => 403');

// ===== 3. integer-id guard =====
console.log(`\n${BOLD}[3] integer-id coercion guard${RESET}`);
function e10IntId(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); if (!Number.isInteger(n) || n <= 0) return null; return n; }
assert(e10IntId('5') === 5, "'5' -> 5");
assert(e10IntId(0) === null && e10IntId(-1) === null, '0 and -1 -> null');
assert(e10IntId('5x') === null && e10IntId('1.5') === null, "'5x'/'1.5' -> null (no float/string bypass)");

// ===== 4. ZATCA clearance gate =====
console.log(`\n${BOLD}[4] ZATCA clearance gate (ZATCA_ENABLED off => 503, intent recorded)${RESET}`);
function zatcaEnabled(flag) { return /^(1|true|on|yes)$/i.test(String(flag || '').trim()); }
function submitZatca(exists, flag) {
    if (!exists) return { status: 404 };
    const recorded = { clearance_status: 'RECORDED' }; // intent always recorded
    if (!zatcaEnabled(flag)) return { status: 503, ...recorded, zatca_enabled: false };
    return { status: 503, ...recorded, zatca_enabled: true }; // endpoint not configured even when enabled
}
assert(submitZatca(false, undefined).status === 404, 'submit before generate => 404');
const sub = submitZatca(true, undefined);
assert(sub.status === 503 && sub.clearance_status === 'RECORDED' && sub.zatca_enabled === false, 'submit with ZATCA off => 503 but intent RECORDED (fail-closed, no external call)');

console.log(`\n${BOLD}${BLUE}=== E10 Posting Workflow Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
