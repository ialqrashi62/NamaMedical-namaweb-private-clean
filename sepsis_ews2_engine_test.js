const { test } = require('node:test');
const assert = require('node:assert');
const { news2Score } = require('./sepsis_ews2_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('NEWS2 normal vitals', () => {
  const r = news2Score({ resp_rate: 16, spo2_pct: 98, oxygen_supplement: false, temperature_c: 37.0, systolic_bp_mmHg: 130, pulse_bpm: 75, consciousness: 'alert' });
  assert.strictEqual(r.news2, 0);
  assert.strictEqual(r.severity, 'low');
});

run('NEWS2 medium (5) — sepsis screen', () => {
  const r = news2Score({ resp_rate: 24, spo2_pct: 94, oxygen_supplement: true, temperature_c: 38.5, systolic_bp_mmHg: 105, pulse_bpm: 110, consciousness: 'alert' });
  assert.ok(r.news2 >= 5, `Expected >= 5, got ${r.news2}`);
  assert.strictEqual(r.severity, 'medium');
});

run('NEWS2 high (>=7) — ICU', () => {
  const r = news2Score({ resp_rate: 28, spo2_pct: 88, oxygen_supplement: true, temperature_c: 39.5, systolic_bp_mmHg: 85, pulse_bpm: 135, consciousness: 'new_confusion' });
  assert.ok(r.news2 >= 7, `Expected >= 7, got ${r.news2}`);
  assert.strictEqual(r.severity, 'high');
});

run('qSOFA + septic shock', () => {
  const r = news2Score({ resp_rate: 26, spo2_pct: 90, oxygen_supplement: true, temperature_c: 39.0, systolic_bp_mmHg: 90, pulse_bpm: 130, consciousness: 'new_confusion', lactate_mmol_L: 4.5 });
  assert.strictEqual(r.qsofa.score, 3);
  assert.ok(r.septicShockFlag);
  assert.ok(r.recommendations.some(rec => rec.action.includes('norepinephrine')));
});

run('Septic shock flags SBP <=100', () => {
  const r = news2Score({ resp_rate: 24, spo2_pct: 95, oxygen_supplement: true, temperature_c: 38.5, systolic_bp_mmHg: 95, pulse_bpm: 110, consciousness: 'alert', lactate_mmol_L: 3 });
  assert.ok(r.qsofa.score >= 2);
  assert.ok(r.septicShockFlag);
});

run('Missing fields throws', () => {
  assert.throws(() => news2Score({}), /Missing required field/);
});

console.log('sepsis_ews2 tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
