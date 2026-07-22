const { test } = require('node:test');
const assert = require('node:assert');
const { fraxScore } = require('./bone_density_engine');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); }
}

run('Low risk young patient', () => {
  const r = fraxScore({ age: 50, sex: 'female', weight_kg: 70, height_cm: 165, femoral_neck_bmd_tscore: -0.5 });
  assert.strictEqual(r.severity, 'low');
});

run('High risk elderly with prior fracture', () => {
  const r = fraxScore({ age: 75, sex: 'female', weight_kg: 50, height_cm: 155, prior_fracture: true, femoral_neck_bmd_tscore: -2.5 });
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.recommendations[0].action.includes('bisphosphonate'));
});

run('Moderate risk', () => {
  const r = fraxScore({ age: 65, sex: 'female', weight_kg: 80, height_cm: 170, current_smoking: true, femoral_neck_bmd_tscore: -1.0 });
  // 65y, female (5), no weight, smoking (3), T-score -1.0 (5) = 13 → moderate
  assert.strictEqual(r.severity, 'moderate');
});

run('Hip fracture high risk', () => {
  const r = fraxScore({ age: 80, sex: 'female', weight_kg: 45, height_cm: 150, prior_fracture: true, parent_fracture_hip: true, femoral_neck_bmd_tscore: -3.0 });
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.total10YrHip >= 3);
});

run('Missing age/sex throws', () => {
  assert.throws(() => fraxScore({}), /age and sex required/);
});

console.log('bone_density tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
