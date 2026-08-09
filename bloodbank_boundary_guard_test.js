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

console.log(`\n${BOLD}${BLUE}=== Bloodbank Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/bloodbank/units',requireAuth,requireRole('bloodbank','lab'),requireTenantScope,validateBody(RS.bloodbankUnitCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/bloodbank/units/:id/discard',requireAuth,requireRole('bloodbank','lab'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/bloodbank/crossmatch',requireAuth,requireRole('bloodbank','lab','doctor'),requireTenantScope,validateBody(RS.bloodbankCrossmatchCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/bloodbank/crossmatch/:id/validate',requireAuth,requireRole('bloodbank','lab'),requireTenantScope,validateBody(RS.bloodbankCrossmatchValidate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/bloodbank/transfuse',requireAuth,requireRole('bloodbank','nursing','doctor'),requireTenantScope,validateBody(RS.bloodbankTransfuse),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/bloodbank/transfusions/:id/reaction',requireAuth,requireRole('bloodbank','nursing','doctor'),requireTenantScope,validateBody(RS.bloodbankTransfusionReactionCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/bloodbank/units/:id/recall',requireAuth,requireRole('bloodbank','lab'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/bloodbank/donors',requireAuth,requireRole('bloodbank','lab'),requireTenantScope,validateBody(RS.bloodbankDonorCreate),idempotencyGuard,async(req,res)=>{"),
  'modern bloodbank mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constbloodbankUnitCreate={') &&
  schemas.includes('constbloodbankCrossmatchCreate={') &&
  schemas.includes('constbloodbankCrossmatchValidate={') &&
  schemas.includes('constbloodbankTransfuse={') &&
  schemas.includes('constbloodbankTransfusionReactionCreate={') &&
  schemas.includes('constbloodbankDonorCreate={') &&
  schemas.includes("unit_id:{type:'id',required:true}") &&
  schemas.includes("reaction_details:{type:'str',required:false,max:4000}") &&
  schemas.includes("national_id:{type:'nationalId',required:false}"),
  'route_schemas defines modern bloodbank schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
