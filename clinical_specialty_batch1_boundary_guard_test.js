/**
 * Clinical Specialty Procedures Batch 1 Boundary Guard
 * --------------------------------------------------------------------
 * Static verification for the 11 specialty mutation endpoints
 * hardened in this wave:
 *   - cardiology (procedures, ecg, cath-reports)
 *   - gastro    (endoscopy, biopsy, biopsy result update)
 *   - endocrine (glucose, insulin, insulin deactivate)
 *   - nephrology(dialysis)
 *   - ophthalmology (exams)
 *
 * Run: node clinical_specialty_batch1_boundary_guard_test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const SERVER_JS = path.join(ROOT, 'server.js');
const SCHEMAS_JS = path.join(ROOT, 'route_schemas.js');

const serverSrc = fs.readFileSync(SERVER_JS, 'utf8');
const schemasSrc = fs.readFileSync(SCHEMAS_JS, 'utf8');

const checks = [
  { route: '/api/cardiology/procedures',          verb: 'post', schema: 'cardiologyProcedureCreate' },
  { route: '/api/cardiology/ecg',                verb: 'post', schema: 'cardiologyEcgCreate' },
  { route: '/api/cardiology/cath-reports',        verb: 'post', schema: 'cardiologyCathReportCreate' },
  { route: '/api/gastro/endoscopy',              verb: 'post', schema: 'gastroEndoscopyCreate' },
  { route: '/api/gastro/biopsy',                 verb: 'post', schema: 'gastroBiopsyCreate' },
  { route: '/api/gastro/biopsy/:id/result',      verb: 'put',  schema: 'gastroBiopsyResultUpdate' },
  { route: '/api/endocrine/glucose',             verb: 'post', schema: 'endocrineGlucoseCreate' },
  { route: '/api/endocrine/insulin',             verb: 'post', schema: 'endocrineInsulinCreate' },
  { route: '/api/endocrine/insulin/:id/deactivate', verb: 'put',  schema: 'endocrineInsulinDeactivate' },
  { route: '/api/nephrology/dialysis',           verb: 'post', schema: 'nephrologyDialysisCreate' },
  { route: '/api/ophthalmology/exams',           verb: 'post', schema: 'ophthalmologyExamCreate' },
];

let pass = 0;
let fail = 0;

for (const c of checks) {
  const sig = `app.${c.verb}('${c.route}'`;
  const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const middlewareRe = new RegExp(
    `${escaped}\\s*,\\s*requireAuth[\\s\\S]*?validateBody\\(RS\\.${c.schema}\\)\\s*,\\s*idempotencyGuard\\s*,`
  );

  try {
    assert.ok(middlewareRe.test(serverSrc), `middleware chain missing for: ${c.verb.toUpperCase()} ${c.route}`);

    const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
    assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined`);
    const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
    assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported`);

    console.log(`  PASS  ${c.verb.toUpperCase().padEnd(4)} ${c.route}  ->  ${c.schema}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.verb.toUpperCase().padEnd(4)} ${c.route}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`Clinical specialty batch 1 boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);