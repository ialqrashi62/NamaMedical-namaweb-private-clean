const { test } = require('node:test');
const assert = require('node:assert');
const { asaClassification, rcriScore, capriniScore } = require('./surgical_preop_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('ASA 1 healthy', () => {
  const r = asaClassification({ asa_class: 1 });
  assert.strictEqual(r.asaClass, 1);
  assert.ok(r.label.includes('Normal'));
});

run('ASA 3E emergency severe disease', () => {
  const r = asaClassification({ asa_class: 3, emergency: true });
  assert.strictEqual(r.asaClass, 3);
  assert.ok(r.emergency);
  assert.ok(r.action.includes('Optimize') || r.action.includes('Cardiology'));
});

run('ASA 5 moribund', () => {
  const r = asaClassification({ asa_class: 5 });
  assert.strictEqual(r.asaClass, 5);
  assert.ok(r.label.includes('Moribund'));
});

run('ASA invalid throws', () => {
  assert.throws(() => asaClassification({ asa_class: 7 }), /asa_class must be 1-6/);
});

run('RCRI 0 very low', () => {
  const r = rcriScore({});
  assert.strictEqual(r.rcri, 0);
  assert.strictEqual(r.severity, 'no_risk');
});

run('RCRI 3 high', () => {
  const r = rcriScore({ high_risk_surgery: true, ischemic_heart_disease: true, congestive_heart_failure: true });
  assert.strictEqual(r.rcri, 3);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.action.includes('Cardiology'));
});

run('RCRI 4 very high', () => {
  const r = rcriScore({ high_risk_surgery: true, ischemic_heart_disease: true, congestive_heart_failure: true, cerebrovascular_disease: true });
  assert.strictEqual(r.rcri, 4);
  assert.strictEqual(r.severity, 'very_high');
});

run('Caprini very low (young, minor surgery)', () => {
  const r = capriniScore({ age: 20, surgery_type: 'minor' });
  // 0 (age) + 1 (minor) = 1 → low
  assert.strictEqual(r.severity, 'low');
});

run('Caprini high (THR candidate)', () => {
  const r = capriniScore({ age: 65, surgery_type: 'major_orthopedic', bmi: 32 });
  // 2 (age) + 1 (bmi) + 5 (THR) = 8
  assert.ok(r.caprini >= 5);
  assert.strictEqual(r.severity, 'very_high');
  assert.ok(r.action.includes('LMWH') || r.action.includes('extended'));
});

run('Caprini moderate (abdominal surgery)', () => {
  const r = capriniScore({ age: 55, surgery_type: 'major_general' });
  // 1 + 4 = 5 → very high
  assert.ok(r.caprini >= 4);
});

console.log('surgical_preop tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
