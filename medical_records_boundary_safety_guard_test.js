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

console.log(`\n${BOLD}${BLUE}=== Medical Records Boundary Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/medical-records/requests',requireAuth,requireTenantScope,validateBody(RS.medicalRecordsRequestCreate),idempotencyGuard,async(req,res)=>{"),
  'medical records request create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/medical-records/requests/:id',requireAuth,requireTenantScope,validateBody(RS.medicalRecordsRequestUpdate),idempotencyGuard,async(req,res)=>{"),
  'medical records request update route is guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constmedicalRecordsRequestCreate={') &&
  schemas.includes('constmedicalRecordsRequestUpdate={') &&
  schemas.includes("file_number:{type:'str',required:true,max:120}") &&
  schemas.includes("status:{type:'enumOf',required:true,allowed:['Requested','InProgress','Delivered','Returned','Cancelled']}"),
  'route_schemas defines medical-records request create/update boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
