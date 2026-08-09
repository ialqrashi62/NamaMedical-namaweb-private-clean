/**
 * Clinical Specialty Procedures Batch 4 Boundary Guard
 * 5 routes: orthopedics/pulmonology/rheumatology/neurology
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  { route: '/api/orthopedics/implants',   verb: 'post', schema: 'orthopedicsImplantCreate' },
  { route: '/api/orthopedics/rom',        verb: 'post', schema: 'orthopedicsRomCreate' },
  { route: '/api/pulmonology/pft',        verb: 'post', schema: 'pulmonologyPftCreate' },
  { route: '/api/rheumatology/joints',    verb: 'post', schema: 'rheumatologyJointCreate' },
  { route: '/api/neurology/assessments',  verb: 'post', schema: 'neurologyAssessmentCreate' },
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
console.log(`Clinical specialty batch 4 boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);