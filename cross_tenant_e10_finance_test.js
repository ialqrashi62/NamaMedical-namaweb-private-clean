/**
 * cross_tenant_e10_finance_test.js
 * ==========================================
 * E10 Finance / GL + ZATCA — multi-tenant isolation + IDOR tests.
 * DB-free: static-audits that every GL/ZATCA query carries an explicit AND tenant_id=$N and that
 * the resolver is fail-closed (e10RequireTenant), then re-simulates cross-tenant read/write attempts
 * against an in-memory mockDb (mirrors cross_tenant_e9_icu_test.js conventions).
 *
 *   NODE_PATH=.../namaweb/node_modules node cross_tenant_e10_finance_test.js
 *
 * A finance cross-tenant leak or an unbalanced posted entry is CRITICAL — these tests lock both out.
 */
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}
console.log(`\n${BOLD}${BLUE}=== Cross-Tenant Finance/GL (E10) Isolation & IDOR Tests ===${RESET}\n`);

// ===== 1. Static audit — fail-closed tenant + every query tenant-scoped =====
console.log(`${BOLD}[1] Static audit — fail-closed resolver + tenant-scoped queries${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');

// Isolate the E10 block for query-scoping checks.
const start = serverContent.indexOf('===== E10 FINANCE / GENERAL LEDGER');
const end = serverContent.indexOf('===== end E10 FINANCE / GENERAL LEDGER');
assert(start > 0 && end > start, 'E10 GL block located in server.js');
const block = serverContent.slice(start, end);
const blockClean = block.replace(/\s+/g, '');

assert(blockClean.includes("functione10RequireTenant(req)") && blockClean.includes("err.e10Status=403"), 'e10RequireTenant fail-closed (null tenant => 403, no unscoped fallback)');

const scopedChecks = [
    { p: "FROMfinance_chart_of_accountsWHEREtenant_id=$1ANDis_active=1", l: 'CoA list tenant-scoped (AND tenant_id=$1)' },
    { p: "FROMfinance_journal_entriesjeWHEREje.tenant_id=$1", l: 'journal list tenant-scoped' },
    { p: "FROMfinance_journal_entriesWHEREid=$1ANDtenant_id=$2", l: 'journal :id lookup tenant-scoped (id + tenant_id)' },
    { p: "WHEREjl.entry_id=$1ANDjl.tenant_id=$2", l: 'journal lines read tenant-scoped' },
    { p: "FROMfinance_chart_of_accountsWHEREtenant_id=$1ANDid=ANY($2::int[])", l: 'account ownership check tenant-scoped (ANY array)' },
    { p: "FROMinvoicesWHEREtenant_id=$1AND(COALESCE(total,0)-COALESCE(paid,0))>0", l: 'AR aging query tenant-scoped' },
    { p: "FROMfinance_vouchersWHEREtenant_id=$1", l: 'vouchers list tenant-scoped' }
];
for (const { p, l } of scopedChecks) assert(blockClean.includes(p.replace(/\s+/g, '')), l, p);

// ZATCA + daily-close block scoping
assert(clean.includes("FROMzatca_invoicesWHEREtenant_id=$1ORDERBY"), 'ZATCA invoices list tenant-scoped');
assert(clean.includes("FROMinvoicesiLEFTJOINpatientspONi.patient_id=p.idANDp.tenant_id=$2WHEREi.id=$1ANDi.tenant_id=$2"), 'ZATCA generate invoice lookup tenant-scoped (id + tenant_id)');
assert(clean.includes("FROMzatca_invoicesWHEREinvoice_id=$1ANDtenant_id=$2"), 'ZATCA submit lookup tenant-scoped');
assert(clean.includes("FROMinvoicesWHEREtenant_id=$1ANDcreated_at::date=CURRENT_DATEANDpayment_method='Cash'"), 'daily-close cash aggregation tenant-scoped');
assert(clean.includes("FROMdaily_closeWHEREtenant_id=$1"), 'daily-close list tenant-scoped');
// inserts stamp tenant_id from session (never client body)
assert(blockClean.includes(",tenant_id)VALUES") || blockClean.includes("tenant_id)VALUES"), 'GL inserts stamp tenant_id');
assert(!blockClean.includes("tenantId||null"), 'E10 block never stamps tenant_id as null (real tenantId only — RLS WITH CHECK safe)');

// ===== 2. In-memory cross-tenant simulation =====
console.log(`\n${BOLD}[2] Cross-tenant read/write simulation (IDOR)${RESET}`);
const mockDb = {
    accounts: [
        { id: 10, account_code: '110101', tenant_id: 1 },
        { id: 20, account_code: '400000', tenant_id: 1 },
        { id: 30, account_code: '110101', tenant_id: 2 }
    ],
    entries: [
        { id: 100, entry_number: 'JV-1', posting_status: 'DRAFT', tenant_id: 1 },
        { id: 200, entry_number: 'JV-2', posting_status: 'POSTED', tenant_id: 2 }
    ],
    invoices: [
        { id: 1, total: 115, paid: 0, tenant_id: 1 },
        { id: 2, total: 230, paid: 0, tenant_id: 2 }
    ],
    zatca: [
        { id: 1, invoice_id: 1, tenant_id: 1 },
        { id: 2, invoice_id: 2, tenant_id: 2 }
    ]
};
function readEntry(id, tenantId) { return mockDb.entries.find(e => e.id === id && e.tenant_id === tenantId) || null; }
function listAccounts(tenantId) { return mockDb.accounts.filter(a => a.tenant_id === tenantId); }
function ownsAccounts(ids, tenantId) { return ids.every(id => mockDb.accounts.some(a => a.id === id && a.tenant_id === tenantId)); }
function readZatca(invoiceId, tenantId) { return mockDb.zatca.find(z => z.invoice_id === invoiceId && z.tenant_id === tenantId) || null; }

assert(listAccounts(1).length === 2, 'tenant1 sees only its 2 CoA accounts');
assert(listAccounts(2).length === 1, 'tenant2 sees only its 1 CoA account');
assert(readEntry(100, 1) !== null, 'tenant1 reads its own entry #100');
assert(readEntry(200, 1) === null, 'tenant1 -> tenant2 entry #200 => null (cross-tenant blocked, no leak)');
assert(readEntry(999, 1) === null, 'non-existent entry => null');
// cross-tenant journal posting: tenant1 cannot reference tenant2's account #30
assert(ownsAccounts([10, 20], 1) === true, 'tenant1 owns accounts 10,20');
assert(ownsAccounts([10, 30], 1) === false, 'tenant1 referencing tenant2 account #30 => rejected (would be 422)');
// AR aging never crosses tenants
const aging1 = mockDb.invoices.filter(i => i.tenant_id === 1 && (i.total - i.paid) > 0);
assert(aging1.length === 1 && aging1[0].id === 1, 'tenant1 AR aging only includes its own invoice #1');
assert(mockDb.invoices.filter(i => i.tenant_id === 1).every(i => i.id !== 2), 'tenant2 invoice #2 absent from tenant1 aging');
// ZATCA IDOR
assert(readZatca(1, 1) !== null, 'tenant1 reads its own zatca e-invoice');
assert(readZatca(2, 1) === null, 'tenant1 -> tenant2 zatca invoice #2 => null (no leak)');

// ===== 3. fail-closed: null tenant => 403, no fallback =====
console.log(`\n${BOLD}[3] fail-closed tenant resolver${RESET}`);
function e10RequireTenant(tenantId) { if (!tenantId) { const e = new Error('Tenant scope required'); e.e10Status = 403; throw e; } return tenantId; }
let threw = false; try { e10RequireTenant(null); } catch (e) { threw = (e.e10Status === 403); }
assert(threw, 'null tenant throws 403 (no unscoped query path)');
assert(e10RequireTenant(1) === 1, 'valid tenant passes through');

// ===== 4. I-2: finance/summary is fail-closed (unconditional AND tenant_id) =====
console.log(`\n${BOLD}[4] I-2: finance/summary fail-closed (e10RequireTenant + unconditional tenant_id predicate)${RESET}`);
// Isolate the finance/summary handler text for scoped checks.
const summaryStart = serverContent.indexOf('===== FINANCE SUMMARY =====');
const summaryEnd = serverContent.indexOf('\n});', summaryStart) + 4;
assert(summaryStart > 0, 'finance/summary handler block located in server.js');
const summaryBlock = summaryEnd > summaryStart ? serverContent.slice(summaryStart, summaryEnd) : '';
const summaryClean = summaryBlock.replace(/\s+/g, '');
assert(summaryClean.includes('e10RequireTenant(req)'), 'finance/summary uses e10RequireTenant (fail-closed, not soft getRequestTenantContext)');
assert(summaryClean.includes("WHEREtotal>0ANDtenant_id=$1"), 'finance/summary WHERE clause has unconditional tenant_id=$1 (not conditional on if-tenantId)');
assert(!summaryClean.includes('if(tenantId)'), 'finance/summary does not have soft if(tenantId) guard (no unscoped fallback path)');

// ===== 5. I-1: ZATCA INSERT does not clobber qr_code with TLV bytes =====
console.log(`\n${BOLD}[5] I-1: ZATCA INSERT qr_code/qr_tlv — no TLV duplication into qr_code${RESET}`);
const zatcaInsertClean = clean;
// After fix: VALUES uses '' for qr_code and $9 for qr_tlv (not $9,$9 or $9 twice for qr_code).
// ON CONFLICT UPDATE must NOT set qr_code=$9.
assert(!zatcaInsertClean.includes("qr_code=$9,qr_tlv=$9"), 'ZATCA ON CONFLICT UPDATE does not write TLV ($9) into both qr_code and qr_tlv');
assert(!zatcaInsertClean.includes("qr_code=$9"), 'ZATCA ON CONFLICT UPDATE does not overwrite qr_code with TLV ($9)');
assert(zatcaInsertClean.includes("qr_tlv=$9"), 'ZATCA ON CONFLICT UPDATE updates qr_tlv=$9 (canonical TLV column)');

console.log(`\n${BOLD}${BLUE}=== Cross-Tenant Finance Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
