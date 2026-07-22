const { test } = require('node:test');
const assert = require('node:assert');
const { wellsDVT, wellsPE, hasBledScore, curb65Score } = require('./heme_infectious_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('Wells DVT unlikely (no risk factors)', () => {
  const r = wellsDVT({});
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.likely, false);
});

run('Wells DVT likely (multiple factors)', () => {
  const r = wellsDVT({ active_cancer: true, pitting_edema: true, calf_swelling_3cm: true });
  assert.ok(r.score >= 3);
  assert.strictEqual(r.likely, true);
  assert.ok(r.action.includes('anticoagulation'));
});

run('Wells DVT alternative diagnosis subtracts', () => {
  const r = wellsDVT({ pitting_edema: true, alternative_diagnosis_likely: true });
  // 1 - 2 = -1
  assert.strictEqual(r.score, -1);
  assert.strictEqual(r.likely, false);
});

run('Wells PE unlikely', () => {
  const r = wellsPE({});
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.category, 'unlikely');
  assert.ok(r.action.includes('PERC'));
});

run('Wells PE likely (high score)', () => {
  const r = wellsPE({ clinical_signs_dvt: true, pe_most_likely: true, hr_gt_100: true, hemoptysis: true, malignancy: true });
  assert.ok(r.score >= 6.5, `Expected >= 6.5, got ${r.score}`);
  assert.strictEqual(r.category, 'likely');
  assert.ok(r.action.includes('CTPA') || r.action.includes('anticoagulation'));
});

run('HAS-BLED 0 (low)', () => {
  const r = hasBledScore({});
  assert.strictEqual(r.hasBled, 0);
  assert.strictEqual(r.severity, 'low');
});

run('HAS-BLED 4 (high)', () => {
  const r = hasBledScore({ hypertension_uncontrolled: true, prior_major_bleeding: true, age_gt_65: true, alcohol_use: true });
  assert.strictEqual(r.hasBled, 4);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.action.includes('modifiable'));
});

run('CURB-65 0 outpatient', () => {
  const r = curb65Score({});
  assert.strictEqual(r.curb65, 0);
  assert.strictEqual(r.severity, 'low');
  assert.ok(r.action.includes('outpatient'));
});

run('CURB-65 2 admission', () => {
  const r = curb65Score({ confusion: true, age_gt_65: true });
  assert.strictEqual(r.curb65, 2);
  assert.strictEqual(r.severity, 'moderate');
  assert.ok(r.action.includes('admission'));
});

run('CURB-65 4 ICU', () => {
  const r = curb65Score({ confusion: true, bun_gt_19_mg_dL: true, resp_rate_gt_30: true, systolic_bp_lt_90: true });
  assert.strictEqual(r.curb65, 4);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.action.includes('ICU'));
});

console.log('heme_infectious tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
