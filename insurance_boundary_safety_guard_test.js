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

console.log(`\n${BOLD}${BLUE}=== Insurance Boundary Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/insurance/companies',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceCompanyCreate),idempotencyGuard,async(req,res)=>{"),
  'insurance companies create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/insurance/eligibility',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceEligibilityCreate),idempotencyGuard,async(req,res)=>{"),
  'insurance eligibility route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/nphies/eligibility',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceEligibilityCreate),idempotencyGuard,async(req,res)=>{"),
  'nphies eligibility route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/insurance/pre-auth',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insurancePreAuthCreate),idempotencyGuard,async(req,res)=>{"),
  'insurance pre-auth create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/insurance/pre-auth/:id/decision',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insurancePreAuthDecisionUpdate),idempotencyGuard,async(req,res)=>{"),
  'insurance pre-auth decision route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/insurance/claims',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceClaimCreate),idempotencyGuard,async(req,res)=>{"),
  'insurance claim create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/insurance/claims/:id/transition',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceClaimTransitionUpdate),idempotencyGuard,async(req,res)=>{"),
  'insurance claim transition route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/insurance/claims/:id/lines',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceClaimLineCreate),idempotencyGuard,async(req,res)=>{"),
  'insurance claim line create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/insurance/claims/:id',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceClaimLegacyUpdate),idempotencyGuard,async(req,res)=>{"),
  'legacy claim update route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/insurance/denials/:id/appeal',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insuranceDenialAppealUpdate),idempotencyGuard,async(req,res)=>{"),
  'denial appeal route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/insurance/payer-pricing',requireAuth,requireRole(...E11_INS_ROLES),requireTenantScope,validateBody(RS.insurancePayerPricingCreate),idempotencyGuard,async(req,res)=>{"),
  'payer pricing route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/nphies/claim-status-inquiry',requireAuth,requireRole('finance','accounts','insurance'),requireTenantScope,validateBody(RS.nphiesClaimStatusInquiry),async(req,res)=>{"),
  'nphies claim status inquiry route is guarded by validateBody schema'
);

assert(
  schemas.includes('constinsuranceClaimLegacyUpdate={') &&
  schemas.includes('constinsuranceDenialAppealUpdate={') &&
  schemas.includes('constinsurancePayerPricingCreate={') &&
  schemas.includes('constinsuranceCompanyCreate={') &&
  schemas.includes('constinsuranceEligibilityCreate={') &&
  schemas.includes('constinsurancePreAuthCreate={') &&
  schemas.includes('constinsurancePreAuthDecisionUpdate={') &&
  schemas.includes('constinsuranceClaimCreate={') &&
  schemas.includes('constinsuranceClaimTransitionUpdate={') &&
  schemas.includes('constinsuranceClaimLineCreate={') &&
  schemas.includes('constnphiesClaimStatusInquiry={') &&
  schemas.includes("contact_info:{type:'str',required:false,max:2000}") &&
  schemas.includes("policy_number:{type:'str',required:false,max:120}") &&
  schemas.includes("decision:{type:'enumOf',required:true,allowed:['approved','denied','partial']}") &&
  schemas.includes("target:{type:'enumOf',required:true,allowed:['submitted','adjudicated','remittance_posted','denied','appealed']}") &&
  schemas.includes("status:{type:'enumOf',required:true,allowed:['Approved','Rejected']}") &&
  schemas.includes("appeal_status:{type:'enumOf',required:true,allowed:['appealed','upheld','overturned','closed']}") &&
  schemas.includes("payer_price:{type:'num',required:true,min:0}"),
  'route_schemas defines insurance mutation boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
