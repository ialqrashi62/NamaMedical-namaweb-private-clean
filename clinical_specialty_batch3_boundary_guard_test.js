/**
 * Clinical Specialty Procedures Batch 3 Boundary Guard
 * 13 routes: psychiatry/dermatology/ent/plastic-burns/icu
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  { route: '/api/psychiatry/evaluations',           verb: 'post', schema: 'psychiatryEvaluationCreate' },
  { route: '/api/dermatology/lesions',              verb: 'post', schema: 'dermatologyLesionCreate' },
  { route: '/api/ent/audiograms',                   verb: 'post', schema: 'entAudiogramCreate' },
  { route: '/api/plastic-burns/assessments',        verb: 'post', schema: 'plasticBurnAssessmentCreate' },
  { route: '/api/plastic-burns/photos',             verb: 'post', schema: 'plasticBurnPhotoCreate' },
  { route: '/api/icu/assessments',                  verb: 'post', schema: 'icuAssessmentCreate' },
  { route: '/api/icu/flowsheet',                    verb: 'post', schema: 'icuFlowsheetCreate' },
  { route: '/api/icu/monitoring',                   verb: 'post', schema: 'icuFlowsheetCreate' },
  { route: '/api/icu/ventilator',                   verb: 'post', schema: 'icuVentilatorCreate' },
  { route: '/api/icu/infusion',                     verb: 'post', schema: 'icuInfusionCreate' },
  { route: '/api/icu/score',                        verb: 'post', schema: 'icuScoreCreate' },
  { route: '/api/icu/scores',                       verb: 'post', schema: 'icuScoreCreate' },
  { route: '/api/icu/fluid-balance',                verb: 'post', schema: 'icuFluidBalanceCreate' },
  { route: '/api/icu/daily-goals',                  verb: 'post', schema: 'icuDailyGoalsCreate' },
  { route: '/api/icu/prevention-bundles',           verb: 'post', schema: 'icuPreventionBundlesCreate' },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // For routes using factory handlers (e9PostFlowsheet/e9PostScore) the middleware chain
  // ends with the factory function name instead of an arrow function — handle both.
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
console.log(`Clinical specialty batch 3 boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);