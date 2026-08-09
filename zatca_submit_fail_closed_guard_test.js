/**
 * zatca_submit_fail_closed_guard_test.js
 * DB-free static guard for ZATCA route safety invariants in server.js.
 */
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
const failures = [];

function assert(cond, name, details) {
  if (cond) {
    passed++;
    console.log(`  ${GREEN}PASS${RESET} - ${name}`);
    return;
  }
  failed++;
  failures.push({ name, details: details || '' });
  console.log(`  ${RED}FAIL${RESET} - ${name}${details ? ` | ${details}` : ''}`);
}

console.log(`\n${BOLD}${BLUE}=== ZATCA Submit Fail-Closed Guard Test ===${RESET}\n`);

const serverPath = path.join(__dirname, 'server.js');
const src = fs.readFileSync(serverPath, 'utf8');
const clean = src.replace(/\s+/g, '');

assert(
  clean.includes("app.post('/api/zatca/submit',requireAuth,requireRole('finance','accounts'),requireTenantScope,idempotencyGuard,async(req,res)=>{"),
  'submit route is auth+role+tenant+idempotency guarded'
);

assert(
  clean.includes("app.get('/api/settings/integrations',requireAuth,requireTenantContext,async(req,res)=>{") &&
    clean.includes("if(!['ZATCA','NPHIES','CBAHI'].includes(integrationName))returnrow;") &&
    clean.includes("if(integrationName==='ZATCA')redactedConfig=redactZatcaConfig(parsed);") &&
    clean.includes("if(integrationName==='NPHIES')redactedConfig=redactNphiesConfig(parsed);") &&
    clean.includes("if(integrationName==='CBAHI')redactedConfig=redactCbahiConfig(parsed);") &&
    clean.includes("if(integrationName==='ZATCA'||integrationName==='NPHIES'){") &&
    clean.includes("safeRow['api_key']=row.api_key?'[REDACTED]':'';") &&
    clean.includes("safeRow['api_secret']=row.api_secret?'[REDACTED]':'';"),
  'GET integrations redacts integration configs and secret fields for ZATCA/NPHIES'
);

assert(
  clean.includes('if(!globalEnabled||!integrationEnabled){') &&
    clean.includes("submission_status=$2") &&
    clean.includes("'Submitted_Mock'") &&
    clean.includes("'ZATCA_SUBMIT_INTENT','ZATCA'"),
  'submit route keeps safe mock fallback when integration/global gate is off'
);

assert(
  clean.includes('ZATCA_ONBOARDING_INCOMPLETE') &&
    clean.includes('missingproductioncredentials'),
  'submit route fails closed when production credentials are missing'
);

assert(
  clean.includes("validateZatcaConfig(configJson,{requireKeys:true,requireCsrProfile:true})") &&
    clean.includes("error:'InvalidZATCAconfiguration'") &&
    clean.includes('codes:configValidation.errors'),
  'submit route enforces key+CSR validation and returns machine-readable codes'
);

assert(
  clean.includes("constrequiresCsr=parseInt(is_enabled,10)===1;") &&
    clean.includes("validateZatcaConfig(parsedConfig,{requireCsrProfile:requiresCsr,requireKeys:false})") &&
    clean.includes("error:'InvalidZATCAconfig_json'"),
  'settings save route validates ZATCA config_json when enabling integration'
);

assert(
  clean.includes("constnormalizedName=String(integration_name).trim().toUpperCase();") &&
    clean.includes('WHEREtenant_id=$1ANDUPPER(integration_name)=$2') &&
    clean.includes('Updatedintegration${normalizedName}settings'),
  'settings save route canonicalizes integration_name and uses canonical value for persistence/audit'
);

assert(
  clean.includes("SELECT*FROMintegration_settingsWHEREtenant_id=$1ANDUPPER(integration_name)=$2") &&
    clean.includes("[tenantId,'ZATCA']"),
  'submit route loads ZATCA settings case-insensitively for legacy rows'
);

assert(
  clean.includes("api_key!=='***REDACTED***'") &&
    clean.includes("api_secret!=='***REDACTED***'") &&
    clean.includes('exists?.api_key||\'\'') &&
    clean.includes('exists?.api_secret||\'\''),
  'settings save route preserves stored credentials when redacted placeholders are submitted'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);

if (failed) {
  for (const f of failures) {
    console.log(`  - ${f.name}${f.details ? `: ${f.details}` : ''}`);
  }
  process.exit(1);
}

console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
