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

console.log(`\n${BOLD}${BLUE}=== Clinical Docs Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/clinical/departments',requireAuth,requireRole('Admin'),requireTenantScope,validateBody(RS.clinicalDepartmentUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/templates',requireAuth,requireRole('Admin'),requireTenantScope,validateBody(RS.clinicalTemplateCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/records',requireAuth,requireRole('patients'),requireTenantScope,validateBody(RS.clinicalRecordUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/notes',requireAuth,requireRole('patients'),requireTenantScope,validateBody(RS.clinicalNoteUpsert),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/notes/:id/lock',requireAuth,requireRole('patients'),requireTenantScope,idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/smart-templates',requireAuth,requireRole('patients'),requireTenantScope,validateBody(RS.clinicalSmartTemplateUpsert),idempotencyGuard,async(req,res)=>{"),
  'clinical documentation mutation routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constclinicalDepartmentUpsert={') &&
  schemas.includes('constclinicalTemplateCreate={') &&
  schemas.includes('constclinicalRecordUpsert={') &&
  schemas.includes('constclinicalNoteUpsert={') &&
  schemas.includes('constclinicalSmartTemplateUpsert={') &&
  schemas.includes("code:{type:'str',required:true,max:80}") &&
  schemas.includes("patient_id:{type:'id',required:true}") &&
  schemas.includes("template_text:{type:'str',required:true,max:12000}"),
  'route_schemas defines clinical documentation boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
