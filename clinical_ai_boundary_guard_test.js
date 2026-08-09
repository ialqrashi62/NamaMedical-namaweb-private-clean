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

console.log(`\n${BOLD}${BLUE}=== Clinical AI Boundary Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/clinical/knowledge',requireAuth,requireRole('Admin'),requireTenantScope,validateBody(RS.clinicalKnowledgeCreate),idempotencyGuard,async(req,res)=>{") &&
  server.includes("app.post('/api/clinical/ai/ask',requireAuth,requireRole('doctor','nursing'),requireTenantScope,validateBody(RS.clinicalAiAsk),idempotencyGuard,async(req,res)=>{"),
  'clinical AI mutation routes are guarded by validateBody + idempotencyGuard'
);

assert(
  schemas.includes('constclinicalKnowledgeCreate={') &&
  schemas.includes('constclinicalAiAsk={') &&
  schemas.includes("content_chunk:{type:'str',required:true,max:20000}") &&
  schemas.includes("question:{type:'str',required:true,max:3000}"),
  'route_schemas defines clinical AI boundary schemas'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
