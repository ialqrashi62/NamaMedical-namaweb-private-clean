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

console.log(`\n${BOLD}${BLUE}=== Clinical Boundary Validation Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/orders',requireAuth,requireTenantScope,validateBody(RS.clinicalOrderCreate),async(req,res)=>{"),
  'orders route is guarded by validateBody(RS.clinicalOrderCreate)'
);

assert(
  server.includes("app.post('/api/prescriptions',requireAuth,requireTenantScope,validateBody(RS.prescriptionCreate),async(req,res)=>{"),
  'prescriptions route is guarded by validateBody(RS.prescriptionCreate)'
);

assert(
  schemas.includes('constclinicalOrderCreate={') &&
    schemas.includes('constprescriptionCreate={') &&
    schemas.includes("patient_id:{type:'id',required:true}") &&
    schemas.includes("description:{type:'str',required:true,max:2000}") &&
    schemas.includes("medication_name:{type:'str',required:true,max:300}"),
  'route_schemas defines clinicalOrderCreate and prescriptionCreate boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
