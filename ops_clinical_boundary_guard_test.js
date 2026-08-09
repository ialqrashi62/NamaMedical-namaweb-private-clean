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

console.log(`\n${BOLD}${BLUE}=== Ops Clinical Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/social-work/cases',requireAuth,requireRole('him','nursing'),requireTenantScope,validateBody(RS.socialWorkCaseCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/social-work/cases/:id',requireAuth,requireRole('him','nursing'),requireTenantScope,validateBody(RS.socialWorkCaseUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/mortuary/cases',requireAuth,requireRole('him','nursing'),requireTenantScope,validateBody(RS.mortuaryCaseCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/mortuary/cases/:id',requireAuth,requireRole('him','nursing'),requireTenantScope,validateBody(RS.mortuaryCaseUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cme/activities',requireAuth,requireRole('cme'),requireTenantScope,validateBody(RS.cmeActivityCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cme/registrations',requireAuth,requireRole('cme'),requireTenantScope,validateBody(RS.cmeRegistrationCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cme/events',requireAuth,requireRole('cme'),requireTenantScope,validateBody(RS.cmeEventCreate),idempotencyGuard,async(req,res)=>{"),
  'social work, mortuary, and CME mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constsocialWorkCaseCreate={') &&
  schemas.includes('constsocialWorkCaseUpdate={') &&
  schemas.includes('constmortuaryCaseCreate={') &&
  schemas.includes('constmortuaryCaseUpdate={') &&
  schemas.includes('constcmeActivityCreate={') &&
  schemas.includes('constcmeRegistrationCreate={') &&
  schemas.includes('constcmeEventCreate={') &&
  schemas.includes("activity_id:{type:'id',required:true}") &&
  schemas.includes("next_of_kin_phone:{type:'phone',required:false}"),
  'route_schemas defines social work, mortuary, and CME schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
