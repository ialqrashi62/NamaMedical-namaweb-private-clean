const { test } = require('node:test');
const assert = require('node:assert');
const { giBleedRisk } = require('./gi_bleed_risk_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('Low risk outpatient discharge', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 13.5, sex: 'male', systolic_bp_mmHg: 130, pulse_bpm: 80, BUN_mmol_L: 5.0, melena: false, syncope: false, age: 45, hepatic_disease: false, cardiac_failure: false, source: 'upper' });
  assert.strictEqual(r.glascoGBS.score, 0);
  assert.strictEqual(r.severity, 'low');
  assert.strictEqual(r.location, 'outpatient');
});

run('Moderate inpatient admission', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 11.0, sex: 'male', systolic_bp_mmHg: 120, pulse_bpm: 95, BUN_mmol_L: 7.0, melena: true, syncope: false, age: 50, hepatic_disease: false, cardiac_failure: false, source: 'upper' });
  // melena(1) + hgb 11(3) + BUN 7(2) = 6 → moderate
  assert.strictEqual(r.glascoGBS.score, 6);
  assert.strictEqual(r.severity, 'moderate');
});

run('High risk with melena + hepatic', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 9.0, sex: 'male', systolic_bp_mmHg: 105, pulse_bpm: 95, BUN_mmol_L: 9.0, melena: true, syncope: false, age: 65, hepatic_disease: true, cardiac_failure: false, source: 'upper' });
  // hgb 9 (6) + melena 1 + BUN 9 (3) + hepatic 2 + pulse 1 = 13 → very_high
  assert.strictEqual(r.severity, 'very_high');
  assert.ok(r.recommendations.some(rec => rec.action.includes('Octreotide')));
});

run('Very high with massive bleed features', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 5.0, sex: 'male', systolic_bp_mmHg: 80, pulse_bpm: 130, BUN_mmol_L: 30, melena: true, syncope: true, age: 80, hepatic_disease: true, cardiac_failure: false, source: 'upper' });
  assert.strictEqual(r.severity, 'very_high');
  assert.strictEqual(r.location, 'ICU');
});

run('Anticoagulation reversal recommended', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 9.0, sex: 'male', systolic_bp_mmHg: 100, pulse_bpm: 95, BUN_mmol_L: 12, melena: true, syncope: false, age: 65, hepatic_disease: false, cardiac_failure: false, anticoagulation: true, source: 'upper' });
  assert.ok(r.recommendations.some(rec => rec.action.includes('Reverse anticoagulation')));
});

run('Lower GI bleed excluded from variceal care', () => {
  const r = giBleedRisk({ hemoglobin_g_dL: 10.0, sex: 'male', systolic_bp_mmHg: 110, pulse_bpm: 90, BUN_mmol_L: 7, melena: false, syncope: false, age: 60, hepatic_disease: false, cardiac_failure: false, source: 'lower' });
  assert.ok(!r.recommendations.some(rec => rec.action.includes('Octreotide')));
});

run('Missing fields throws', () => {
  assert.throws(() => giBleedRisk({}), /Missing required field/);
});

console.log('gi_bleed_risk tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
