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

function assert(cond, name, details = '') {
  if (cond) {
    passed++;
    console.log(`  ${GREEN}PASS${RESET} - ${name}`);
    return;
  }
  failed++;
  failures.push({ name, details });
  console.log(`  ${RED}FAIL${RESET} - ${name}${details ? ` | ${details}` : ''}`);
}

console.log(`\n${BOLD}${BLUE}=== NPHIES/CBAHI UI Config Guard Test ===${RESET}\n`);

const appJs = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8').replace(/\s+/g, '');

assert(
  appJs.includes("constisNphies=integrationType==='NPHIES';") &&
    appJs.includes("constisCbahi=integrationType==='CBAHI';"),
  'integration config modal identifies NPHIES and CBAHI modes'
);

assert(
  appJs.includes("id=\"nphiesProviderLicense\"") &&
    appJs.includes("id=\"nphiesPayerLicense\"") &&
    appJs.includes("id=\"nphiesEligibilityPath\"") &&
    appJs.includes("id=\"nphiesClaimSubmitPath\""),
  'NPHIES modal includes licensing and endpoint path fields'
);

assert(
  appJs.includes("if(cfg.fhir_version!=='R4')") &&
    appJs.includes("AllNPHIESpathsmuststartwith\"/\""),
  'NPHIES save flow validates FHIR version and endpoint path format'
);

assert(
  appJs.includes('MissingrequiredNPHIESdata:') || appJs.includes('بياناتNPHIESالمطلوبةناقصة:'),
  'NPHIES save flow surfaces clear missing-data error'
);

assert(
  appJs.includes("id=\"cbahiStandardsVersion\"") &&
    appJs.includes("id=\"cbahiFacilityLicense\"") &&
    appJs.includes("id=\"cbahiFrequency\""),
  'CBAHI modal includes standards, license, and frequency fields'
);

assert(
  appJs.includes("constallowed=newSet(['monthly','quarterly','semiannual','annual']);") &&
    appJs.includes("!allowed.has(cfg.self_assessment_frequency)"),
  'CBAHI save flow validates allowed self-assessment frequencies'
);

assert(
  appJs.includes('MissingrequiredCBAHIdata:') || appJs.includes('بياناتCBAHIالمطلوبةناقصة:'),
  'CBAHI save flow surfaces clear missing-data error'
);

console.log(`\n${BOLD}${BLUE}=== Result ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}`);
console.log(`  ${RED}FAIL${RESET}: ${failed}`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}${f.details ? `: ${f.details}` : ''}`));
  process.exit(1);
}
console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`);
