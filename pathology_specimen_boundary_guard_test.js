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

console.log(`\n${BOLD}${BLUE}=== Pathology Specimen Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/pathology/specimens',requireAuth,requireRole('pathology','lab'),requireTenantScope,validateBody(RS.pathologySpecimenCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pathology/specimens/:id/blocks',requireAuth,requireRole('pathology','lab'),requireTenantScope,validateBody(RS.pathologyBlockCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pathology/blocks/:blockId/slides',requireAuth,requireRole('pathology','lab'),requireTenantScope,validateBody(RS.pathologySlideCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pathology/specimens/:id/state',requireAuth,requireRole('pathology','lab'),requireTenantScope,validateBody(RS.pathologySpecimenStateUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pathology/specimens/:id/report',requireAuth,requireRole('pathology'),requireTenantScope,validateBody(RS.pathologyReportUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pathology/specimens/:id/signout',requireAuth,requireRole('pathology'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pathology/specimens/:id/addendum',requireAuth,requireRole('pathology'),requireTenantScope,validateBody(RS.pathologyAddendumCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pathology/specimens/:id',requireAuth,requireRole('pathology','lab'),requireTenantScope,idempotencyGuard,(req,res)=>{"),
  'pathology specimen workflow routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constpathologySpecimenCreate={') &&
  schemas.includes('constpathologyBlockCreate={') &&
  schemas.includes('constpathologySlideCreate={') &&
  schemas.includes('constpathologySpecimenStateUpdate={') &&
  schemas.includes('constpathologyReportUpdate={') &&
  schemas.includes('constpathologyAddendumCreate={') &&
  schemas.includes("patient_id:{type:'id',required:true}") &&
  schemas.includes("state:{type:'str',required:true,max:80}") &&
  schemas.includes("text:{type:'str',required:true,max:8000}"),
  'route_schemas defines pathology specimen workflow schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
