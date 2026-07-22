const { test } = require('node:test');
const assert = require('node:assert');
const { interpretSleepStudy } = require('./sleep_study_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('Severe OSA — CPAP', () => {
  const r = interpretSleepStudy({ ahi: 45, odi: 42, min_spo2: 75, tst_hours: 7.5, sleep_efficiency: 88, rem_pct: 18, arousal_index: 35, periodic_limb_movement_index: 5, predominant_event_type: 'obstructive' });
  assert.strictEqual(r.severity, 'severe_OSA_with_hypoxemia');
  assert.ok(r.recommendations.some(rec => rec.action.includes('CPAP')));
  assert.ok(r.recommendations.some(rec => rec.action.includes('drive')));
});

run('Mild OSA positional', () => {
  const r = interpretSleepStudy({ ahi: 8, odi: 7, min_spo2: 88, tst_hours: 7, sleep_efficiency: 90, rem_pct: 22, arousal_index: 12, periodic_limb_movement_index: 2, predominant_event_type: 'positional' });
  assert.strictEqual(r.severity, 'mild_OSA');
  assert.ok(r.recommendations.some(rec => rec.action.includes('Positional')));
});

run('Moderate OSA — CPAP + lifestyle', () => {
  const r = interpretSleepStudy({ ahi: 22, odi: 20, min_spo2: 86, tst_hours: 7, sleep_efficiency: 88 });
  assert.strictEqual(r.severity, 'moderate_OSA');
  assert.ok(r.recommendations.some(rec => rec.action.includes('CPAP')));
});

run('PLMD detected', () => {
  const r = interpretSleepStudy({ ahi: 2, odi: 2, min_spo2: 92, tst_hours: 7, sleep_efficiency: 80, rem_pct: 20, arousal_index: 18, periodic_limb_movement_index: 25, predominant_event_type: 'normal' });
  assert.ok(r.recommendations.some(rec => rec.action.includes('pramipexole')));
});

run('Normal study', () => {
  const r = interpretSleepStudy({ ahi: 2, odi: 1, min_spo2: 94, tst_hours: 7.5, sleep_efficiency: 92 });
  assert.strictEqual(r.severity, 'normal');
});

run('Missing required fields throws', () => {
  assert.throws(() => interpretSleepStudy({}), /ahi, odi, min_spo2, tst_hours required/);
});

console.log('sleep_study tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
