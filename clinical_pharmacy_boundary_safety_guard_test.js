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

console.log(`\n${BOLD}${BLUE}=== Clinical Pharmacy Boundary Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/clinical-pharmacy/reviews',requireAuth,requireTenantScope,validateBody(RS.clinicalPharmacyReviewCreate),idempotencyGuard,async(req,res)=>{"),
  'clinical pharmacy review create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/clinical-pharmacy/reviews/:id',requireAuth,requireTenantScope,validateBody(RS.clinicalPharmacyReviewUpdate),idempotencyGuard,async(req,res)=>{"),
  'clinical pharmacy review update route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/clinical-pharmacy/education',requireAuth,requireTenantScope,validateBody(RS.clinicalPharmacyEducationCreate),idempotencyGuard,async(req,res)=>{"),
  'clinical pharmacy education create route is guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constclinicalPharmacyReviewCreate={') &&
  schemas.includes('constclinicalPharmacyReviewUpdate={') &&
  schemas.includes('constclinicalPharmacyEducationCreate={') &&
  schemas.includes("severity:{type:'enumOf',required:false,allowed:['Low','Moderate','High','Critical']}") &&
  schemas.includes("status:{type:'enumOf',required:false,allowed:['Open','InProgress','Closed','Resolved']}") &&
  schemas.includes("medication:{type:'str',required:false,max:300}"),
  'route_schemas defines clinical pharmacy boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
