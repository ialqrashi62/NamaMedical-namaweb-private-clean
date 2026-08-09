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

console.log(`\n${BOLD}${BLUE}=== Clinical Safety Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/clinical/safety-check',requireAuth,requireTenantScope,validateBody(RS.clinicalSafetyCheck),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/nursing/risk-assessment',requireAuth,requireRole('nursing','doctor'),requireTenantScope,validateBody(RS.nursingRiskAssessmentCreate),idempotencyGuard,async(req,res)=>{"),
  'clinical safety mutation routes are guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constclinicalSafetyCheck={') &&
  schemas.includes('constnursingRiskAssessmentCreate={') &&
  schemas.includes("drug_name:{type:'str',required:true,max:300}") &&
  schemas.includes("assessment_type:{type:'str',required:true,max:120}") &&
  schemas.includes("total_score:{type:'int',required:true,min:0}"),
  'route_schemas defines clinical safety and nursing risk boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
