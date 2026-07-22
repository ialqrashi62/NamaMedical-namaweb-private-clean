const { test } = require('node:test');
const assert = require('node:assert');
const { ucMayoScore, crohnCDAI } = require('./ibd_activity_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('UC Mayo remission', () => {
  const r = ucMayoScore({ stool_frequency_subscore: 0, rectal_bleeding_subscore: 0, endoscopic_subscore: 0, physician_global_subscore: 0 });
  assert.strictEqual(r.totalScore, 0);
  assert.strictEqual(r.severity, 'remission');
});

run('UC Mayo mild', () => {
  const r = ucMayoScore({ stool_frequency_subscore: 1, rectal_bleeding_subscore: 1, endoscopic_subscore: 1, physician_global_subscore: 1 });
  assert.strictEqual(r.totalScore, 4);
  assert.strictEqual(r.severity, 'mild');
});

run('UC Mayo moderate', () => {
  const r = ucMayoScore({ stool_frequency_subscore: 2, rectal_bleeding_subscore: 2, endoscopic_subscore: 2, physician_global_subscore: 1 });
  assert.strictEqual(r.totalScore, 7);
  assert.strictEqual(r.severity, 'moderate');
});

run('UC Mayo severe — IV steroids', () => {
  const r = ucMayoScore({ stool_frequency_subscore: 3, rectal_bleeding_subscore: 3, endoscopic_subscore: 3, physician_global_subscore: 3 });
  assert.strictEqual(r.totalScore, 12);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.recommendation.includes('IV methylprednisolone'));
});

run('Crohn CDAI remission', () => {
  const r = crohnCDAI({ liquid_stools_7d: 5, abdominal_pain_7d: 0, general_wellbeing_7d: 0, hematocrit_pct: 45, weight_loss_pct: 0, sex: 'male' });
  assert.ok(r.totalScore < 150);
  assert.strictEqual(r.severity, 'remission');
});

run('Crohn CDAI severe', () => {
  const r = crohnCDAI({ liquid_stools_7d: 50, abdominal_pain_7d: 18, general_wellbeing_7d: 24, hematocrit_pct: 28, weight_loss_pct: 15, sex: 'female', extraintestinal_complications: 2 });
  assert.ok(r.totalScore > 450);
  assert.strictEqual(r.severity, 'severe');
});

run('Crohn CDAI missing fields throws', () => {
  assert.throws(() => crohnCDAI({}), /Missing required field/);
});

run('UC Mayo invalid subscore throws', () => {
  assert.throws(() => ucMayoScore({ stool_frequency_subscore: 5, rectal_bleeding_subscore: 0, endoscopic_subscore: 0, physician_global_subscore: 0 }), /must be 0-3/);
});

console.log('ibd_activity tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
