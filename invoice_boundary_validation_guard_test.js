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

console.log(`\n${BOLD}${BLUE}=== Invoice Boundary Validation Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.put('/api/invoices/:id/pay',requireAuth,requireRole('invoices','accounts'),validateBody(RS.invoicePay),idempotencyGuard,async(req,res)=>{"),
  'invoice pay route is guarded by validateBody(RS.invoicePay)'
);

assert(
  server.includes("app.post('/api/payments/moyasar/initiate',requireAuth,requireRole('invoices','accounts'),validateBody(RS.paymentMoyasarInitiate),idempotencyGuard,async(req,res)=>{"),
  'moyasar initiate route is guarded by validateBody(RS.paymentMoyasarInitiate)'
);

assert(
  server.includes("app.post('/api/invoices/cancel/:id',requireAuth,requireRole('invoices','accounts'),requireTenantScope,requirePermission('invoices:cancel'),validateBody(RS.invoiceCancel),idempotencyGuard,async(req,res)=>{"),
  'invoice cancel route is guarded by validateBody(RS.invoiceCancel)'
);

assert(
  server.includes("app.put('/api/invoices/:id/partial-pay',requireAuth,requireRole('invoices','accounts'),requireTenantScope,validateBody(RS.invoicePartialPay),idempotencyGuard,async(req,res)=>{"),
  'invoice partial-pay route is guarded by validateBody(RS.invoicePartialPay)'
);

assert(
  schemas.includes('constinvoicePay={') &&
    schemas.includes('constpaymentMoyasarInitiate={') &&
    schemas.includes('constinvoiceCancel={') &&
    schemas.includes('constinvoicePartialPay={') &&
    schemas.includes('amount_paid:{type:\'num\',required:true,min:0.01}'),
  'route_schemas exports invoice/payment boundary validation schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
