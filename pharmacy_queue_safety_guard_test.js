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

console.log(`\n${BOLD}${BLUE}=== Pharmacy Queue Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.put('/api/pharmacy/queue/:id',requireAuth,requireTenantScope,validateBody(RS.pharmacyQueueUpdate),idempotencyGuard,async(req,res)=>{"),
  'pharmacy queue update route is guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constpharmacyQueueUpdate={') &&
    schemas.includes("price:{type:'num',required:false,min:0}") &&
    schemas.includes("payment_method:{type:'str',required:false,max:80}"),
  'route_schemas defines pharmacyQueueUpdate schema with money-safe price typing'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
