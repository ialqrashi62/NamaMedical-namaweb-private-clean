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

console.log(`\n${BOLD}${BLUE}=== Patient Flow Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/appointments',requireAuth,requireRole('appointments'),validateBody(RS.appointmentCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/queue/checkin',requireAuth,validateBody(RS.queueCheckinCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/queue/patients/:id/status',requireAuth,validateBody(RS.queueStatusUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/queue/patients/:id/triage',requireAuth,validateBody(RS.queueTriageUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/queue/patients/:id/call',requireAuth,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/patients/:id/referral',requireAuth,requireRole('patients'),validateBody(RS.patientReferralUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/bookings/:id',requireAuth,validateBody(RS.bookingUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/referrals',requireAuth,requireTenantScope,validateBody(RS.patientReferralCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/referrals/:id',requireAuth,requireTenantScope,validateBody(RS.patientReferralStatusUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/appointments/followup',requireAuth,requireRole('appointments'),validateBody(RS.appointmentFollowupCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/appointments/:id/checkin',requireAuth,requireRole('appointments'),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/appointments/:id/noshow',requireAuth,requireRole('appointments'),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/appointments/check-duplicate',requireAuth,requireRole('appointments'),validateBody(RS.appointmentDuplicateCheck),idempotencyGuard,async(req,res)=>{"),
  'patient flow mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constappointmentCreate={') &&
  schemas.includes('constqueueCheckinCreate={') &&
  schemas.includes('constqueueStatusUpdate={') &&
  schemas.includes('constqueueTriageUpdate={') &&
  schemas.includes('constpatientReferralUpdate={') &&
  schemas.includes('constbookingUpdate={') &&
  schemas.includes('constpatientReferralCreate={') &&
  schemas.includes('constpatientReferralStatusUpdate={') &&
  schemas.includes('constappointmentFollowupCreate={') &&
  schemas.includes('constappointmentDuplicateCheck={') &&
  schemas.includes("patient_id:{type:'id',required:true}") &&
  schemas.includes("date:{type:'dateStr',required:true}")
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);