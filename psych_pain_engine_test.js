const { test } = require('node:test');
const assert = require('node:assert');
const { phq9Score, gad7Score, wongBakerFaces } = require('./psych_pain_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('PHQ-9 minimal', () => {
  const r = phq9Score({ q1_anhedonia: 0, q2_mood: 1, q3_sleep: 1, q4_energy: 0, q5_appetite: 0, q6_self_esteem: 0, q7_concentration: 0, q8_motor: 0, q9_self_harm: 0 });
  assert.strictEqual(r.phq9, 2);
  assert.strictEqual(r.severity, 'minimal');
});

run('PHQ-9 moderate', () => {
  const r = phq9Score({ q1_anhedonia: 2, q2_mood: 2, q3_sleep: 2, q4_energy: 1, q5_appetite: 1, q6_self_esteem: 1, q7_concentration: 1, q8_motor: 0, q9_self_harm: 0 });
  assert.ok(r.phq9 >= 10);
  assert.strictEqual(r.severity, 'moderate');
  assert.ok(r.action.includes('SSRI'));
});

run('PHQ-9 severe with suicidality', () => {
  const r = phq9Score({ q1_anhedonia: 3, q2_mood: 3, q3_sleep: 3, q4_energy: 3, q5_appetite: 3, q6_self_esteem: 3, q7_concentration: 3, q8_motor: 2, q9_self_harm: 2 });
  assert.ok(r.phq9 >= 20);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.suicialIdeation);
  assert.ok(r.action.includes('SUICIDAL'));
});

run('PHQ-9 invalid throws', () => {
  assert.throws(() => phq9Score({ q1_anhedonia: 4, q2_mood: 0, q3_sleep: 0, q4_energy: 0, q5_appetite: 0, q6_self_esteem: 0, q7_concentration: 0, q8_motor: 0, q9_self_harm: 0 }), /must be 0-3/);
});

run('GAD-7 minimal', () => {
  const r = gad7Score({ q1_nervous: 1, q2_worry_control: 0, q3_worry_too_much: 1, q4_relaxation_difficulty: 0, q5_restless: 0, q6_annoyed: 0, q7_afraid: 0 });
  assert.strictEqual(r.gad7, 2);
  assert.strictEqual(r.severity, 'minimal');
});

run('GAD-7 severe', () => {
  const r = gad7Score({ q1_nervous: 3, q2_worry_control: 3, q3_worry_too_much: 3, q4_relaxation_difficulty: 3, q5_restless: 3, q6_annoyed: 3, q7_afraid: 3 });
  assert.strictEqual(r.gad7, 21);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('SSRI') || r.action.includes('SNRI'));
});

run('Wong-Baker 0 = no pain', () => {
  const r = wongBakerFaces({ face_score: 0 });
  assert.strictEqual(r.painScore, 0);
  assert.strictEqual(r.face.label, 'No hurt');
});

run('Wong-Baker 6 = moderate pain', () => {
  const r = wongBakerFaces({ face_score: 6 });
  assert.strictEqual(r.painScore, 6);
  assert.ok(r.action.includes('opioid') || r.action.includes('tramadol') || r.action.includes('codeine'));
});

run('Wong-Baker 10 = worst pain', () => {
  const r = wongBakerFaces({ face_score: 10 });
  assert.ok(r.action.includes('morphine') || r.action.includes('Pain team'));
});

run('Wong-Baker invalid face score throws', () => {
  assert.throws(() => wongBakerFaces({ face_score: 5 }), /must be 0, 2, 4, 6, 8, or 10/);
});

console.log('psych_pain tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
