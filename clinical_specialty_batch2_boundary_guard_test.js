/**
 * Clinical Specialty Procedures Batch 2 Boundary Guard
 * 18 routes: surgery/urology/anesthesia/pediatrics/obgyn
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  { route: '/api/surgery/checklists',                  verb: 'post', schema: 'surgeryChecklistCreate' },
  { route: '/api/surgery/timelogs',                    verb: 'post', schema: 'surgeryTimelogCreate' },
  { route: '/api/surgery/cpb',                         verb: 'post', schema: 'surgeryCpbCreate' },
  { route: '/api/surgery-preop-tests/:id',             verb: 'put',  schema: 'surgeryPreopTestUpdate' },
  { route: '/api/surgery/count-sheet',                 verb: 'post', schema: 'surgeryCountSheetCreate' },
  { route: '/api/urology/urodynamics',                 verb: 'post', schema: 'urologyUrodynamicsCreate' },
  { route: '/api/anesthesia/pain',                     verb: 'post', schema: 'anesthesiaPainCreate' },
  { route: '/api/pediatrics/growth',                   verb: 'post', schema: 'pediatricsGrowthCreate' },
  { route: '/api/pediatrics/immunization',             verb: 'post', schema: 'pediatricsImmunizationCreate' },
  { route: '/api/pediatrics/apgar',                    verb: 'post', schema: 'pediatricsApgarCreate' },
  { route: '/api/obgyn/pregnancies',                   verb: 'post', schema: 'obgynPregnancyCreate' },
  { route: '/api/obgyn/pregnancies/:id',               verb: 'put',  schema: 'obgynPregnancyUpdate' },
  { route: '/api/obgyn/antenatal',                     verb: 'post', schema: 'obgynAntenatalCreate' },
  { route: '/api/obgyn/partogram',                     verb: 'post', schema: 'obgynPartogramCreate' },
  { route: '/api/obgyn/ultrasounds',                   verb: 'post', schema: 'obgynUltrasoundCreate' },
  { route: '/api/obgyn/deliveries',                    verb: 'post', schema: 'obgynDeliveryCreate' },
  { route: '/api/obgyn/neonatal',                      verb: 'post', schema: 'obgynNeonatalCreate' },
  { route: '/api/obgyn/nst',                           verb: 'post', schema: 'obgynNstCreate' },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `app\\.${c.verb}\\('${escaped}'[\\s\\S]{0,400}?validateBody\\(RS\\.${c.schema}\\)\\s*,\\s*idempotencyGuard\\s*,`
  );
  try {
    assert.ok(re.test(serverSrc), `middleware chain missing for: ${c.verb.toUpperCase()} ${c.route}`);
    const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
    assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined`);
    const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
    assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported`);
    console.log(`  PASS  ${c.verb.toUpperCase().padEnd(4)} ${c.route}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.verb.toUpperCase().padEnd(4)} ${c.route}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`Clinical specialty batch 2 boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);