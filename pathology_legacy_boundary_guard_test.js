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

console.log(`\n${BOLD}${BLUE}=== Pathology Legacy Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/pathology/cases',requireAuth,requireRole('pathology','lab'),requireTenantScope,validateBody(RS.pathologyCaseCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.put('/api/pathology/cases/:id',requireAuth,requireRole('pathology'),requireTenantScope,validateBody(RS.pathologyCaseUpdate),idempotencyGuard,async(req,res)=>{"),
  'legacy pathology case routes are guarded by validation/idempotency'
);

assert(
  schemas.includes('constpathologyCaseCreate={') &&
  schemas.includes('constpathologyCaseUpdate={') &&
  schemas.includes("collection_date:{type:'dateStr',required:false}") &&
  schemas.includes("diagnosis:{type:'str',required:false,max:4000}"),
  'route_schemas defines legacy pathology case schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
