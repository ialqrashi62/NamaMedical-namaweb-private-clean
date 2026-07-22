const { test } = require('node:test');
const assert = require('node:assert');
const { bmi, harrisBenedictBEE, nrs2002 } = require('./nutrition_malnutrition_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('BMI normal', () => {
  const r = bmi({ weight_kg: 70, height_m: 1.75 });
  // 70 / 1.75² = 22.86
  assert.ok(r.bmi > 22 && r.bmi < 23, `Expected ~22.9, got ${r.bmi}`);
  assert.strictEqual(r.category, 'normal');
});

run('BMI obese class 1', () => {
  const r = bmi({ weight_kg: 95, height_m: 1.7 });
  // 95 / 1.7² = 32.87
  assert.ok(r.bmi >= 30 && r.bmi < 35);
  assert.strictEqual(r.category, 'obese_class_1');
});

run('BMI severe thinness', () => {
  const r = bmi({ weight_kg: 40, height_m: 1.7 });
  // 40 / 1.7² = 13.84
  assert.ok(r.bmi < 16);
  assert.strictEqual(r.category, 'severe_thinness');
});

run('BMI obesity III', () => {
  const r = bmi({ weight_kg: 130, height_m: 1.7 });
  // 130 / 1.7² = 44.98
  assert.ok(r.bmi >= 40);
  assert.strictEqual(r.category, 'obese_class_3');
  assert.ok(r.action.includes('bariatric'));
});

run('BEE male 30y 70kg 175cm', () => {
  const r = harrisBenedictBEE({ sex: 'male', age: 30, weight_kg: 70, height_cm: 175, activity: 'sedentary' });
  assert.ok(r.bee > 1600 && r.bee < 1800, `Expected ~1700, got ${r.bee}`);
  assert.ok(r.tdee > r.bee);
});

run('BEE female 60y 60kg 160cm', () => {
  const r = harrisBenedictBEE({ sex: 'female', age: 60, weight_kg: 60, height_cm: 160, activity: 'light' });
  assert.ok(r.bee > 1000 && r.bee < 1400, `Expected ~1200, got ${r.bee}`);
});

run('NRS-2002 no risk', () => {
  const r = nrs2002({ bmi: 25, weight_loss_pct: 0, food_intake_pct_reduction: 0, disease_severity: 'none', age: 40 });
  assert.strictEqual(r.severity, 'no_risk');
});

run('NRS-2002 severe malnutrition', () => {
  const r = nrs2002({ bmi: 17, weight_loss_pct: 12, food_intake_pct_reduction: 75, disease_severity: 'severe', age: 80 });
  // 3 (bmi<18.5) + 4 (10%+) + 3 (75%) + 3 (severe) + 1 (age 80) = 14
  assert.strictEqual(r.nrs2002, 14);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('severe') || r.action.includes('Enteral'));
});

run('NRS-2002 moderate risk', () => {
  const r = nrs2002({ bmi: 19, weight_loss_pct: 4, food_intake_pct_reduction: 30, disease_severity: 'mild', age: 65 });
  // 1 + 2 + 2 + 1 + 0 = 6 → severe actually
  // Let me try with lower values
  const r2 = nrs2002({ bmi: 20, weight_loss_pct: 2, food_intake_pct_reduction: 20, disease_severity: 'mild', age: 50 });
  // 1 + 0 + 1 + 1 + 0 = 3 → moderate
  assert.strictEqual(r2.severity, 'moderate');
});

run('Missing fields throws', () => {
  assert.throws(() => bmi({}), /weight_kg and height_m required/);
});

console.log('nutrition_malnutrition tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
