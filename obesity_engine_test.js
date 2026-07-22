const { test } = require('node:test');
const assert = require('node:assert');
const { assessObesity, BMI_CATEGORIES } = require('./obesity_engine');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); }
}

run('Normal BMI', () => {
  const r = assessObesity({ weight_kg: 65, height_cm: 170, waist_cm: 80, comorbidities: [] });
  assert.strictEqual(r.bmiCategory, 'normal');
});

run('Obesity class 1 with comorbidity → pharmacotherapy', () => {
  const r = assessObesity({ weight_kg: 90, height_cm: 170, waist_cm: 100, comorbidities: ['dm2', 'htn'] });
  assert.strictEqual(r.severity, 'obesity_1_with_comorb');
  assert.ok(r.recommendations.some(rec => rec.action.includes('GLP-1')));
});

run('Severe obesity → bariatric surgery candidate', () => {
  const r = assessObesity({ weight_kg: 130, height_cm: 170, waist_cm: 140, comorbidities: ['dm2', 'htn', 'osa'] });
  assert.strictEqual(r.severity, 'severe_obesity');
  assert.ok(r.recommendations.some(rec => rec.action.includes('bariatric')));
});

run('BMI calculation correct', () => {
  const r = assessObesity({ weight_kg: 80, height_cm: 180, waist_cm: 90 });
  // BMI = 80 / (1.8*1.8) = 24.69
  assert.ok(r.bmi >= 24 && r.bmi <= 25);
});

run('Metabolic syndrome detected', () => {
  const r = assessObesity({ weight_kg: 100, height_cm: 170, waist_cm: 110, comorbidities: ['htn', 'dm2', 'dyslipidemia'] });
  assert.ok(r.metabolicSyndrome);
});

run('Missing weight/height throws', () => {
  assert.throws(() => assessObesity({}), /weight_kg and height_cm required/);
});

console.log('obesity tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
