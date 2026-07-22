const { test } = require('node:test');
const assert = require('node:assert');
const { nihssScore, apacheIV } = require('./nihss_apache_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('NIHSS 0 — no stroke', () => {
  const r = nihssScore({ consciousness_lvlc: 0, consciousness_lvl1a: 0, consciousness_lvl1b: 0, best_gaze: 0, visual_field: 0, facial_palsy: 0, motor_arm_left: 0, motor_arm_right: 0, motor_leg_left: 0, motor_leg_right: 0, limb_ataxia: 0, sensory: 0, language: 0, dysarthria: 0, extinction_inattention: 0 });
  assert.strictEqual(r.nihss, 0);
  assert.strictEqual(r.severity, 'no_stroke');
});

run('NIHSS minor stroke', () => {
  const r = nihssScore({ consciousness_lvlc: 0, consciousness_lvl1a: 0, consciousness_lvl1b: 0, best_gaze: 0, visual_field: 0, facial_palsy: 1, motor_arm_left: 0, motor_arm_right: 0, motor_leg_left: 0, motor_leg_right: 0, limb_ataxia: 0, sensory: 1, language: 0, dysarthria: 0, extinction_inattention: 0 });
  assert.strictEqual(r.nihss, 2);
  assert.strictEqual(r.severity, 'minor');
});

run('NIHSS moderate with tPA recommendation', () => {
  const r = nihssScore({ consciousness_lvlc: 0, consciousness_lvl1a: 1, consciousness_lvl1b: 0, best_gaze: 1, visual_field: 0, facial_palsy: 1, motor_arm_left: 2, motor_arm_right: 0, motor_leg_left: 2, motor_leg_right: 0, limb_ataxia: 0, sensory: 0, language: 0, dysarthria: 0, extinction_inattention: 0, symptom_onset_hours: 2 });
  assert.ok(r.nihss >= 5 && r.nihss <= 15);
  assert.ok(r.recommendations.some(rec => rec.action.includes('alteplase')));
});

run('NIHSS severe — NICU', () => {
  const r = nihssScore({ consciousness_lvlc: 2, consciousness_lvl1a: 2, consciousness_lvl1b: 1, best_gaze: 2, visual_field: 2, facial_palsy: 3, motor_arm_left: 4, motor_arm_right: 4, motor_leg_left: 4, motor_leg_right: 4, limb_ataxia: 0, sensory: 2, language: 3, dysarthria: 2, extinction_inattention: 2 });
  assert.ok(r.nihss >= 21);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('NICU') || r.action.includes('hemicraniectomy'));
});

run('Hemorrhagic stroke plan', () => {
  const r = nihssScore({ consciousness_lvlc: 1, consciousness_lvl1a: 0, consciousness_lvl1b: 0, best_gaze: 0, visual_field: 0, facial_palsy: 0, motor_arm_left: 0, motor_arm_right: 0, motor_leg_left: 0, motor_leg_right: 0, limb_ataxia: 0, sensory: 0, language: 0, dysarthria: 0, extinction_inattention: 0, known_hemorrhage: true });
  assert.ok(r.recommendations.some(rec => rec.action.includes('neurosurgery')));
});

run('APACHE IV low', () => {
  const r = apacheIV({ age: 30, sex: 'male', chronic_health: {}, admission_diagnosis: 'surgical_elective', saps3_like_inputs: { temperature_c: 37, mbp_mmHg: 80, heart_rate_bpm: 80, resp_rate: 16, gcs_total: 15 } });
  assert.ok(r.apache_iv < 50);
  assert.strictEqual(r.severity, 'low');
});

run('APACHE IV high with chronic disease', () => {
  const r = apacheIV({ age: 85, sex: 'male', chronic_health: { metastatic_cancer: true, ckd_on_dialysis: true, hepatic_failure: true }, admission_diagnosis: 'septic_shock', saps3_like_inputs: { temperature_c: 39.5, mbp_mmHg: 50, heart_rate_bpm: 140, resp_rate: 32, pao2_fio2_ratio: 100, gcs_total: 9, sodium: 155, potassium: 6.5, creatinine_mg_dL: 4.5 } });
  assert.ok(r.apache_iv > 100, `Expected > 100, got ${r.apache_iv}`);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.mortalityEstimate.high >= 0.5, `Expected high mortality >= 0.5, got ${r.mortalityEstimate.high}`);
});

run('Missing fields throws', () => {
  assert.throws(() => nihssScore({}), /Missing required field/);
});

console.log('nihss_apache tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
