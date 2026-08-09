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

console.log(`\n${BOLD}${BLUE}=== Nursing Additional Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/nursing/pain-assessment',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.nursingPainAssessmentCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/scores',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.nursingScoreCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/care-plans',requireAuth,requireTenantScope,validateBody(RS.nursingCarePlanCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/assessments',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.nursingAssessmentCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/assessment',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.nursingAssessmentScaleCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/io',requireAuth,requireTenantScope,validateBody(RS.nursingIoCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/handover',requireAuth,requireTenantScope,validateBody(RS.nursingHandoverCreate),idempotencyGuard,async(req,res)=>{"),
  'remaining nursing mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constnursingPainAssessmentCreate={') &&
  schemas.includes('constnursingScoreCreate={') &&
  schemas.includes('constnursingCarePlanCreate={') &&
  schemas.includes('constnursingAssessmentCreate={') &&
  schemas.includes('constnursingAssessmentScaleCreate={') &&
  schemas.includes('constnursingIoCreate={') &&
  schemas.includes('constnursingHandoverCreate={') &&
  schemas.includes("volume_ml:{type:'int',required:true,min:1}") &&
  schemas.includes("pain_score:{type:'int',required:true,min:0}") &&
  schemas.includes("patient_id:{type:'id',required:true}"),
  'route_schemas defines additional nursing boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
