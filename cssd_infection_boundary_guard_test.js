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

console.log(`\n${BOLD}${BLUE}=== CSSD Infection Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/cssd/instruments',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdInstrumentSetCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cssd/cycles',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdCycleCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/cssd/cycles/:id',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdCycleStatusUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cssd/load-items',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdLoadItemCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cssd/batches',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdBatchCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/cssd/batches/:id',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdBatchUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/infection-control/reports',requireAuth,requireRole('infection'),requireTenantScope,validateBody(RS.infectionControlReportCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/infection-control/reports/:id',requireAuth,requireRole('infection'),requireTenantScope,validateBody(RS.infectionControlReportUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/cssd/cycles/:id/bi-result',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdCycleBiResultUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/cssd/cycles/:id/release',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/cssd/trays',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdTrayCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/cssd/trays/:id/issue',requireAuth,requireRole('cssd','nursing','surgery'),requireTenantScope,validateBody(RS.cssdTrayIssue),idempotencyGuard,async(req,res)=>{"),
  'CSSD and infection-control mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constcssdInstrumentSetCreate={') &&
  schemas.includes('constcssdCycleCreate={') &&
  schemas.includes('constcssdCycleStatusUpdate={') &&
  schemas.includes('constcssdLoadItemCreate={') &&
  schemas.includes('constcssdBatchCreate={') &&
  schemas.includes('constcssdBatchUpdate={') &&
  schemas.includes('constinfectionControlReportCreate={') &&
  schemas.includes('constinfectionControlReportUpdate={') &&
  schemas.includes('constcssdCycleBiResultUpdate={') &&
  schemas.includes('constcssdTrayCreate={') &&
  schemas.includes('constcssdTrayIssue={') &&
  schemas.includes("bi_test_result:{type:'str',required:true,max:80}") &&
  schemas.includes("issued_to:{type:'str',required:false,max:300}") &&
  schemas.includes("status:{type:'str',required:true,max:80}"),
  'route_schemas defines CSSD and infection-control schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
