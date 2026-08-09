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

console.log(`\n${BOLD}${BLUE}=== Radiology Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.put('/api/radiology/orders/:id',requireAuth,requireTenantScope,validateBody(RS.radiologyOrderUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/orders',requireAuth,requireTenantScope,validateBody(RS.labOrderCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/orders/:id/upload',requireAuth,requireTenantScope,upload.single('image'),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/worklist',requireAuth,requireTenantScope,validateBody(RS.radiologyWorklistCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/radiology/worklist/:id/state',requireAuth,requireTenantScope,validateBody(RS.radiologyWorklistStateUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/dicom-studies',requireAuth,requireTenantScope,validateBody(RS.radiologyDicomStudyCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/reports',requireAuth,requireTenantScope,validateBody(RS.radiologyReportCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/reports/:id/critical-notify',requireAuth,requireRole('radiology','doctor'),requireTenantScope,validateBody(RS.radiologyReportCriticalNotify),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/radiology/reports/:id/sign',requireAuth,requireRole('radiology','doctor'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/radiology/reports/:id/addendum',requireAuth,requireRole('radiology','doctor'),requireTenantScope,validateBody(RS.radiologyReportAddendum),idempotencyGuard,async(req,res)=>{"),
  'radiology mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constradiologyOrderUpdate={') &&
  schemas.includes('constradiologyWorklistCreate={') &&
  schemas.includes('constradiologyWorklistStateUpdate={') &&
  schemas.includes('constradiologyDicomStudyCreate={') &&
  schemas.includes('constradiologyReportCreate={') &&
  schemas.includes('constradiologyReportCriticalNotify={') &&
  schemas.includes('constradiologyReportAddendum={') &&
  schemas.includes("state:{type:'str',required:true,max:40}") &&
  schemas.includes("rad_exam_id:{type:'id',required:true}") &&
  schemas.includes("note:{type:'str',required:false,max:2000}"),
  'route_schemas defines radiology mutation boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
