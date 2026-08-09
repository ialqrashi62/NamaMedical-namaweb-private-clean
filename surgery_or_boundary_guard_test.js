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

console.log(`\n${BOLD}${BLUE}=== Surgery OR Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.put('/api/surgeries/:id',requireAuth,requireTenantScope,validateBody(RS.surgeryUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/surgeries/:id/preop',requireAuth,requireTenantScope,validateBody(RS.surgeryPreopUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/surgeries/:id/preop-tests',requireAuth,requireTenantScope,validateBody(RS.surgeryPreopTestCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/surgeries/:id/anesthesia',requireAuth,requireTenantScope,validateBody(RS.surgeryAnesthesiaUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/or/slots/reserve',requireAuth,requireRole('surgery','doctor'),requireTenantScope,validateBody(RS.orSlotReserve),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/or/slots/:id/cancel',requireAuth,requireRole('surgery','doctor'),requireTenantScope,requirePermission('or:cancel'),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/or/surgeries/:id/status',requireAuth,requireRole('surgery','doctor','nursing'),requireTenantScope,validateBody(RS.orSurgeryStatusUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/or/surgeries/:id/who-checklist/:phase',requireAuth,requireRole('surgery','doctor','nursing'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/or/surgeries/:id/pacu',requireAuth,requireRole('surgery','doctor','nursing'),requireTenantScope,validateBody(RS.orPacuUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/or/surgeries/:id/operative-note',requireAuth,requireRole('surgery','doctor'),requireTenantScope,validateBody(RS.orOperativeNoteUpsert),idempotencyGuard,async(req,res)=>{"),
  'surgery and OR mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constsurgeryUpdate={') &&
  schemas.includes('constsurgeryPreopUpsert={') &&
  schemas.includes('constsurgeryPreopTestCreate={') &&
  schemas.includes('constsurgeryAnesthesiaUpsert={') &&
  schemas.includes('constorSlotReserve={') &&
  schemas.includes('constorSurgeryStatusUpdate={') &&
  schemas.includes('constorPacuUpsert={') &&
  schemas.includes('constorOperativeNoteUpsert={') &&
  schemas.includes("surgery_id:{type:'id',required:true}") &&
  schemas.includes("status:{type:'str',required:true,max:80}") &&
  schemas.includes("counts_verified:{type:'bool',required:false}"),
  'route_schemas defines surgery and OR boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
