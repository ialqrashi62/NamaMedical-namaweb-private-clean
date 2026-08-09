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

console.log(`\n${BOLD}${BLUE}=== Finance Boundary Validation Guard Test ===${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8').replace(/\s+/g, '');
const schemas = fs.readFileSync(path.join(__dirname, 'route_schemas.js'), 'utf8').replace(/\s+/g, '');
const validation = fs.readFileSync(path.join(__dirname, 'validation.js'), 'utf8').replace(/\s+/g, '');

assert(
  server.includes("app.post('/api/finance/accounts',requireAuth,requireRole('finance','accounts','invoices'),requireTenantScope,validateBody(RS.financeAccountCreate),idempotencyGuard,async(req,res)=>{"),
  'Finance account creation route has validateBody(RS.financeAccountCreate)'
);

assert(
  server.includes("app.post('/api/finance/ap',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeApCreate),idempotencyGuard,async(req,res)=>{"),
  'AP create route has validateBody(RS.financeApCreate)'
);

assert(
  server.includes("app.post('/api/finance/ap/:id/pay',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeApPay),idempotencyGuard,async(req,res)=>{"),
  'AP pay route has validateBody(RS.financeApPay)'
);

assert(
  server.includes("app.post('/api/finance/ar',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeArCreate),idempotencyGuard,async(req,res)=>{"),
  'AR create route has validateBody(RS.financeArCreate)'
);

assert(
  server.includes("app.post('/api/finance/ar/:id/collect',requireAuth,requireRole('finance','accounts'),requireTenantScope,validateBody(RS.financeArCollect),idempotencyGuard,async(req,res)=>{"),
  'AR collect route has validateBody(RS.financeArCollect)'
);

assert(
  server.includes("app.post('/api/finance/reports/generate',requireAuth,requireRole('finance','accounts','admin'),requireTenantScope,validateBody(RS.financeReportGenerate),idempotencyGuard,async(req,res)=>{"),
  'Finance report generation route has validateBody(RS.financeReportGenerate)'
);

assert(
  schemas.includes('constfinanceAccountCreate={') &&
    schemas.includes("account_code:{type:'str',required:true,max:80}") &&
  schemas.includes('constfinanceApCreate={') &&
    schemas.includes('constfinanceApPay={') &&
    schemas.includes('constfinanceArCreate={') &&
    schemas.includes('constfinanceArCollect={') &&
    schemas.includes('constfinanceReportGenerate={'),
  'route_schemas defines AP/AR/report validation schemas'
);

assert(
  validation.includes('functionnum(value,{field=\'value\',required=true,min=-Infinity,max=Infinity}={}){') &&
    validation.includes('constTYPES={str,int,num,id,enumOf,bool,dateStr,nationalId,phone};'),
  'validation module provides numeric validator wired into TYPES'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) process.exit(1);
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
