/**
 * payment_refund_integrity_test.js
 * ==========================================
 * PHASE 2 (H-1/H-2) — static route-guard audit of the partial-pay & refund handlers in server.js.
 * Verifies the hardening is present in source (tenant predicate / IDOR fix, server-side amount
 * validation, FOR UPDATE row-lock, tenant_id stamping, no client-trusted parseFloat, no GL/ZATCA/NPHIES).
 * DB-free, deterministic. Does NOT execute any route or touch the database.
 *
 *   node payment_refund_integrity_test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

// ---- extract the two route blocks from source ----
const partialIdx = src.indexOf("app.put('/api/invoices/:id/partial-pay'");
const refundIdx = src.indexOf("app.post('/api/invoices/:id/refund'");
const cashIdx = src.indexOf("// ===== CASH DRAWER");
const partialBlock = (partialIdx >= 0 && refundIdx > partialIdx) ? src.slice(partialIdx, refundIdx) : '';
const refundBlock = (refundIdx >= 0) ? src.slice(refundIdx, cashIdx > refundIdx ? cashIdx : refundIdx + 4000) : '';

console.log(`\n${BOLD}${BLUE}=== Payment/Refund Integrity Route Guards (H-1/H-2) ===${RESET}\n`);
assert(partialBlock.length > 0, 'partial-pay route block located');
assert(refundBlock.length > 0, 'refund route block located');

// ---- H-1: partial-pay ----
console.log(`${BOLD}[H-1] partial-pay hardening${RESET}`);
assert(/requireTenantScope/.test(partialBlock), 'partial-pay enforces requireTenantScope');
assert(/FOR UPDATE/.test(partialBlock), 'partial-pay locks invoice row (FOR UPDATE)');
assert(/set_config\('app\.tenant_id'/.test(partialBlock), 'partial-pay binds app.tenant_id for RLS under manual client');
assert(/parsePositiveMoneyToMinorUnits/.test(partialBlock), 'partial-pay validates amount via parsePositiveMoneyToMinorUnits');
assert(/assertAmountWithinCap/.test(partialBlock), 'partial-pay caps amount at outstanding (no overpayment)');
assert(!/parseFloat\(amount_paid\)/.test(partialBlock), 'partial-pay no longer trusts raw parseFloat(amount_paid)');
assert(/client\.query\('COMMIT'\)/.test(partialBlock) && /client\.release\(\)/.test(partialBlock), 'partial-pay uses a committed, released transaction');

// ---- H-2: refund ----
console.log(`${BOLD}[H-2] refund hardening (IDOR + amount + tenant stamp)${RESET}`);
assert(/requireTenantScope/.test(refundBlock), 'refund enforces requireTenantScope');
assert(/FOR UPDATE/.test(refundBlock), 'refund locks original invoice row (FOR UPDATE)');
// IDOR fix: the original-invoice SELECT must be tenant-scoped, NOT the old bare `WHERE id=$1', [req.params.id]`
assert(!/SELECT \* FROM invoices WHERE id=\$1',\s*\[req\.params\.id\]\)/.test(refundBlock), 'refund no longer loads invoice by bare id (IDOR closed)');
assert(/\$\{tenantCheck\}/.test(refundBlock) || /AND tenant_id=\$2/.test(refundBlock), 'refund SELECT carries a tenant predicate');
assert(/parsePositiveMoneyToMinorUnits/.test(refundBlock), 'refund validates amount via parsePositiveMoneyToMinorUnits');
assert(/assertAmountWithinCap/.test(refundBlock) && /refundable/i.test(refundBlock), 'refund caps amount at server-computed refundable');
assert(!/-\(parseFloat\(amount\)\)/.test(refundBlock), 'refund no longer trusts raw -(parseFloat(amount))');
assert(/tenant_id, facility_id\) VALUES/.test(refundBlock) && /tenantId \|\| null/.test(refundBlock), 'refund row is stamped with tenant_id/facility_id');
assert(/set_config\('app\.tenant_id'/.test(refundBlock), 'refund binds app.tenant_id for RLS under manual client');

// ---- scope guard: no GL / accounting / external healthcare calls in the CODE (comments stripped) ----
console.log(`${BOLD}[scope] no GL / ZATCA / NPHIES in payment+refund route code${RESET}`);
const bothCode = (partialBlock + refundBlock)
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/[^\n]*/g, '');        // line comments (e.g. our own "out of scope" note)
assert(!/journal|fe\.(post|journal|reverse)|ACCOUNTING_POSTING/i.test(bothCode), 'no journal/GL posting in payment+refund routes');
assert(!/zatca/i.test(bothCode), 'no ZATCA calls in payment+refund routes');
assert(!/nphies/i.test(bothCode), 'no NPHIES calls in payment+refund routes');

console.log(`\n${BOLD}Result: ${passed} passed, ${failed} failed${RESET}`);
if (failed > 0) { console.log(`${RED}Failures:${RESET}`); failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
process.exit(0);
