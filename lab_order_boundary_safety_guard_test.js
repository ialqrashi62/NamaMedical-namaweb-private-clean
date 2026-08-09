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

console.log(`\n${BOLD}${BLUE}=== Lab Order Boundary Safety Guard Test ===${RESET}\n`);

const serverRaw = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const server = serverRaw.replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

const labOrderPostGuardCount = (serverRaw.match(/app\.post\('\/api\/lab\/orders',\s*requireAuth,\s*validateBody\(RS\.labOrderCreate\),\s*idempotencyGuard,\s*async/g) || []).length;
const labOrderPutGuardCount = (serverRaw.match(/app\.put\('\/api\/lab\/orders\/:id',\s*requireAuth,\s*validateBody\(RS\.labOrderUpdate\),\s*idempotencyGuard,\s*async/g) || []).length;

assert(
  labOrderPostGuardCount >= 2 &&
  labOrderPutGuardCount >= 2 &&
  server.includes("app.post('/api/radiology/orders',requireAuth,validateBody(RS.labOrderCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/lab/orders/direct',requireAuth,validateBody(RS.labOrderDirectCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/orders/:id/approve-payment',requireAuth,validateBody(RS.orderApprovePayment),idempotencyGuard,async(req,res)=>{"),
  'lab and payment-first order mutation routes are guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constlabOrderCreate={') &&
  schemas.includes('constlabOrderDirectCreate={') &&
  schemas.includes('constlabOrderUpdate={') &&
  schemas.includes('constorderApprovePayment={') &&
  schemas.includes("order_type:{type:'str',required:true,max:200}") &&
  schemas.includes("price:{type:'num',required:true,min:0}"),
  'route_schemas defines lab order/payment boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
