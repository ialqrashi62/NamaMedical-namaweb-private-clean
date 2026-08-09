'use strict';

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    passed++;
    console.log(`  ${GREEN}PASS${RESET} - ${name}`);
    return;
  }
  failed++;
  console.log(`  ${RED}FAIL${RESET} - ${name}`);
}

console.log(`\n${BOLD}${BLUE}=== Money Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const upRaw = fs.readFileSync(path.join(__dirname, 'migrations', 'e22_01_operational_money_numeric_up.sql'), 'utf8');
const downRaw = fs.readFileSync(path.join(__dirname, 'migrations', 'e22_01_operational_money_numeric_down.sql'), 'utf8');
const up = upRaw.replace(/\s+/g, '');
const down = downRaw.replace(/\s+/g, '');
const validate = fs.readFileSync(path.join(__dirname, 'migrations', 'e22_01_operational_money_numeric_validate.sql'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/invoices',requireAuth,requireRole('invoices','accounts'),validateBody(RS.invoiceCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/invoices/generate',requireAuth,requireRole('invoices','accounts'),validateBody(RS.invoiceGenerate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/invoices/:id/refund',requireAuth,requireRole('invoices','accounts'),requireTenantScope,validateBody(RS.invoiceRefund),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/finance/journal',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.journalCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/finance/ap',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeApCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/finance/ar',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeArCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/finance/reports/generate',requireAuth,requireRole('finance','accounts','admin'),requireTenantScope,validateBody(RS.financeReportGenerate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nphies/claim-status-inquiry',requireAuth,requireRole('finance','accounts','insurance'),requireTenantScope,validateBody(RS.nphiesClaimStatusInquiry),idempotencyGuard,async(req,res)=>{"),
  'critical money-mutating routes are idempotency-guarded'
);

assert(
  /type\s+numeric\(14,2\)/i.test(upRaw) &&
  /round\(%I::numeric,\s*2\)/i.test(upRaw),
  'money numeric up migration casts targeted REAL columns to NUMERIC(14,2)'
);

assert(
  /type\s+real\s+using\s+%I::real/i.test(downRaw),
  'money numeric down migration exists for controlled rollback'
);

assert(
  validate.includes('still_floating_money_columns') &&
  validate.includes("PASScriterion:still_floating_money_columns=0"),
  'money numeric validate query asserts zero floating money columns'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
