const { test } = require('node:test');
const assert = require('node:assert');
const { assessAsthmaControl, GINA_STEPS } = require('./asthma_control_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('Asthma well-controlled — step down', () => {
  const r = assessAsthmaControl({ symptoms_per_week: 1, night_awakenings_per_month: 0, SABA_use_per_week: 1, activity_limitation: false, exacerbations_last_12m: 0, current_step: 3, fev1_pct: 90, act_score: 22 });
  assert.strictEqual(r.control, 'well_controlled');
  assert.strictEqual(r.recommendedStep, 2);
});

run('Asthma uncontrolled — step up', () => {
  const r = assessAsthmaControl({ symptoms_per_week: 7, night_awakenings_per_month: 5, SABA_use_per_week: 7, activity_limitation: true, exacerbations_last_12m: 1, current_step: 3, fev1_pct: 70, act_score: 12 });
  assert.strictEqual(r.control, 'uncontrolled');
  assert.strictEqual(r.recommendedStep, 4);
});

run('Frequent exacerbations — biologics', () => {
  const r = assessAsthmaControl({ symptoms_per_week: 5, night_awakenings_per_month: 2, SABA_use_per_week: 4, activity_limitation: true, exacerbations_last_12m: 3, current_step: 5, fev1_pct: 65, act_score: 14 });
  assert.ok(r.recommendations.some(rec => rec.action.includes('biologics')));
});

run('ACT score takes precedence', () => {
  const r = assessAsthmaControl({ symptoms_per_week: 7, SABA_use_per_week: 7, current_step: 3, fev1_pct: 70, act_score: 22 });
  assert.strictEqual(r.control, 'well_controlled');
});

run('Step 1 cannot step down', () => {
  const r = assessAsthmaControl({ symptoms_per_week: 0, night_awakenings_per_month: 0, SABA_use_per_week: 0, activity_limitation: false, exacerbations_last_12m: 0, current_step: 1, fev1_pct: 95 });
  assert.strictEqual(r.recommendedStep, 1);
});

run('Missing required fields throws', () => {
  assert.throws(() => assessAsthmaControl({}), /current_step and fev1_pct required/);
});

console.log('asthma_control tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
