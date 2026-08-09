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

console.log(`\n${BOLD}${BLUE}=== Pharmacy Boundary Safety Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/pharmacy/drugs',requireAuth,requireTenantScope,validateBody(RS.pharmacyDrugCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/batches',requireAuth,requireRole('pharmacy'),requireTenantScope,validateBody(RS.pharmacyBatchCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pharmacy/queue/:id/verify',requireAuth,requireRole('pharmacy'),requireTenantScope,validateBody(RS.pharmacyQueueVerify),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/dispense',requireAuth,requireRole('pharmacy'),requireTenantScope,validateBody(RS.pharmacyDispense),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/wasfaty/dispense-intent',requireAuth,requireRole('pharmacy'),requireTenantScope,validateBody(RS.pharmacyWasfatyDispenseIntent),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/deduct-stock',requireAuth,requireTenantScope,validateBody(RS.pharmacyDeductStock),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/prescriptions',requireAuth,requireTenantScope,validateBody(RS.pharmacyPrescriptionCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pharmacy/prescriptions/:id',requireAuth,requireTenantScope,validateBody(RS.pharmacyPrescriptionUpdate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/controlled-substances/reconcile',requireAuth,requireRole('pharmacist','pharmacy'),requireTenantScope,validateBody(RS.controlledSubstanceReconcile),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/pharmacy/controlled-substances/dispense',requireAuth,requireRole('pharmacist','pharmacy','nurse'),requireTenantScope,validateBody(RS.controlledSubstanceDispense),idempotencyGuard,async(req,res)=>{"),
  'pharmacy high-risk mutation routes are guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constpharmacyDrugCreate={') &&
  schemas.includes('constpharmacyBatchCreate={') &&
  schemas.includes('constpharmacyQueueVerify={') &&
  schemas.includes('constpharmacyDispense={') &&
  schemas.includes('constpharmacyWasfatyDispenseIntent={') &&
  schemas.includes('constpharmacyDeductStock={') &&
  schemas.includes('constpharmacyPrescriptionCreate={') &&
  schemas.includes('constpharmacyPrescriptionUpdate={') &&
  schemas.includes('constcontrolledSubstanceReconcile={') &&
  schemas.includes('constcontrolledSubstanceDispense={') &&
  schemas.includes("drug_name:{type:'str',required:true,max:300}") &&
  schemas.includes("qty_received:{type:'int',required:true,min:1}") &&
  schemas.includes("prescription_id:{type:'id',required:true}") &&
  schemas.includes("cs_id:{type:'id',required:true}"),
  'route_schemas defines pharmacy mutation boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
