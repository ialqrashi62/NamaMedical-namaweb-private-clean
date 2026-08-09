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

console.log(`\n${BOLD}${BLUE}=== Telemedicine MAR Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/telemedicine/sessions',requireAuth,requireRole('telemedicine'),requireTenantScope,validateBody(RS.telemedicineSessionCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/telemedicine/sessions/:id',requireAuth,requireRole('telemedicine'),requireTenantScope,validateBody(RS.telemedicineSessionUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/emar/orders',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.emarOrderCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/emar/administrations',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.emarAdministrationNotGivenCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/mar/administer',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.marAdminister),idempotencyGuard,async(req,res)=>{"),
  'telemedicine and eMAR/MAR mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('consttelemedicineSessionCreate={') &&
  schemas.includes('consttelemedicineSessionUpdate={') &&
  schemas.includes('constemarOrderCreate={') &&
  schemas.includes('constemarAdministrationNotGivenCreate={') &&
  schemas.includes('constmarAdminister={') &&
  schemas.includes("reason_not_given:{type:'str',required:true,max:2000}") &&
  schemas.includes("duration_minutes:{type:'int',required:false,min:1}") &&
  schemas.includes("witness_user_id:{type:'id',required:false}"),
  'route_schemas defines telemedicine and eMAR/MAR boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
