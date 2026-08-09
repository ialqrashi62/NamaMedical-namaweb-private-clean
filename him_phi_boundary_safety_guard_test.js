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

console.log(`\n${BOLD}${BLUE}=== HIM PHI Boundary Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/medical/records',requireAuth,requireRole('doctor','nursing'),requireTenantScope,validateBody(RS.medicalRecordCreate),idempotencyGuard,async(req,res)=>{"),
  'medical record create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/medical-records/:id/sign',requireAuth,requireRole('doctor'),requireTenantScope,idempotencyGuard,async(req,res)=>{"),
  'medical record sign route is idempotency-guarded'
);

assert(
  server.includes("app.post('/api/medical-records/:id/amend',requireAuth,requireRole('doctor'),requireTenantScope,validateBody(RS.medicalRecordAmend),idempotencyGuard,async(req,res)=>{"),
  'medical record amend route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/medical-records/coding',requireAuth,requireTenantScope,validateBody(RS.medicalRecordsCodingCreate),idempotencyGuard,async(req,res)=>{"),
  'medical records coding route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/him/coding',requireAuth,requireRole('him','medical-records'),requireTenantScope,validateBody(RS.himCodingCreate),idempotencyGuard,async(req,res)=>{"),
  'HIM coding route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/him/roi',requireAuth,requireRole('him','medical-records'),requireTenantScope,validateBody(RS.himRoiCreate),idempotencyGuard,async(req,res)=>{"),
  'HIM ROI create route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.put('/api/him/roi/:id',requireAuth,requireRole('him','medical-records'),requireTenantScope,validateBody(RS.himRoiUpdate),idempotencyGuard,async(req,res)=>{"),
  'HIM ROI update route is guarded by validateBody + idempotencyGuard'
);

assert(
  server.includes("app.post('/api/him/break-glass',requireAuth,requireRole('him','medical-records'),requireTenantScope,validateBody(RS.himBreakGlass),idempotencyGuard,async(req,res)=>{"),
  'HIM break-glass route is guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constmedicalRecordAmend={') &&
  schemas.includes('constmedicalRecordCreate={') &&
  schemas.includes('constmedicalRecordsCodingCreate={') &&
  schemas.includes('consthimCodingCreate={') &&
  schemas.includes('consthimRoiCreate={') &&
  schemas.includes('consthimRoiUpdate={') &&
  schemas.includes('consthimBreakGlass={') &&
  schemas.includes("action:{type:'enumOf',required:true,allowed:['approve','deny','release']}") &&
  schemas.includes("reason:{type:'str',required:true,max:1000}"),
  'route_schemas defines HIM/PHI mutation boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
