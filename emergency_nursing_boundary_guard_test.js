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

console.log(`\n${BOLD}${BLUE}=== Emergency Nursing Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/nursing/vitals',requireAuth,requireTenantScope,validateBody(RS.nursingVitalsCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/emergency/visits',requireAuth,requireTenantScope,validateBody(RS.emergencyVisitCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/emergency/visits/:id',requireAuth,requireTenantScope,validateBody(RS.emergencyVisitUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/emergency/trauma/:visitId',requireAuth,requireTenantScope,validateBody(RS.emergencyTraumaAssessmentCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/triage',requireAuth,requireTenantScope,validateBody(RS.nursingTriageCreate),idempotencyGuard,async(req,res)=>{"),
  'emergency and nursing high-risk mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constnursingVitalsCreate={') &&
  schemas.includes('constemergencyVisitCreate={') &&
  schemas.includes('constemergencyVisitUpdate={') &&
  schemas.includes('constemergencyTraumaAssessmentCreate={') &&
  schemas.includes('constnursingTriageCreate={') &&
  schemas.includes("patient_id:{type:'id',required:true}") &&
  schemas.includes("assigned_bed:{type:'str',required:false,max:120}") &&
  schemas.includes("trauma_team_activated:{type:'bool',required:false}"),
  'route_schemas defines emergency and nursing boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
