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

console.log(`\n${BOLD}${BLUE}=== LIS Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/lab/samples',requireAuth,requireTenantScope,validateBody(RS.labSampleCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/lab/samples/:id',requireAuth,requireTenantScope,validateBody(RS.labSampleTransition),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/lab/results',requireAuth,requireTenantScope,validateBody(RS.labResultCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/lab/results/:id/verify',requireAuth,requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/lab/results/:id/callback',requireAuth,requireTenantScope,validateBody(RS.labResultCriticalCallback),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/lab/results/:id/report',requireAuth,requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/lab/hl7',requireAuth,requireTenantScope,validateBody(RS.labHl7Ingest),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/lab/qc',requireAuth,requireTenantScope,validateBody(RS.labQcCreate),idempotencyGuard,async(req,res)=>{"),
  'LIS mutation routes are guarded by validateBody/idempotencyGuard where applicable'
);

assert(
  schemas.includes('constlabSampleCreate={') &&
  schemas.includes('constlabSampleTransition={') &&
  schemas.includes('constlabResultCreate={') &&
  schemas.includes('constlabResultCriticalCallback={') &&
  schemas.includes('constlabHl7Ingest={') &&
  schemas.includes('constlabQcCreate={') &&
  schemas.includes("action:{type:'str',required:true,max:40}") &&
  schemas.includes("test_name:{type:'str',required:true,max:300}") &&
  schemas.includes("notified_to:{type:'str',required:true,max:300}"),
  'route_schemas defines LIS boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
