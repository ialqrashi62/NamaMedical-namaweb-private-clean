const { test } = require('node:test');
const assert = require('node:assert');
const { partographAssessment, bishopScore } = require('./partograph_extended_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('Partograph normal progression', () => {
  const r = partographAssessment({ current_dilation_cm: 7, hours_since_4cm: 3, parity: 'nulliparous', contractions_per_10min: 4, descent_station: 0 });
  assert.ok(r.dilationRateCmPerHour >= 1.0, `Expected >= 1.0, got ${r.dilationRateCmPerHour}`);
  assert.strictEqual(r.severity, 'normal');
});

run('Partograph prolonged (protraction)', () => {
  const r = partographAssessment({ current_dilation_cm: 5, hours_since_4cm: 4, parity: 'nulliparous', contractions_per_10min: 2, descent_station: -1 });
  assert.strictEqual(r.severity, 'prolonged_latent');
  assert.ok(r.action.includes('oxytocin'));
});

run('Partograph arrest of dilation', () => {
  const r = partographAssessment({ current_dilation_cm: 5, hours_since_4cm: 4, parity: 'multiparous', contractions_per_10min: 4, descent_station: -1 });
  assert.strictEqual(r.severity, 'prolonged_active');
  assert.ok(r.recommendations.some(rec => rec.action.includes('Cesarean')));
});

run('Partograph missing fields throws', () => {
  assert.throws(() => partographAssessment({}), /Missing required field/);
});

run('Bishop unfavorable (low score)', () => {
  const r = bishopScore({ dilation_cm: 0, effacement_pct: 0, station: -3, consistency: 'firm', position: 'posterior' });
  assert.strictEqual(r.bishop, 0);
  assert.strictEqual(r.category, 'unfavorable');
  assert.ok(r.recommendation.includes('ripening'));
});

run('Bishop favorable (high score)', () => {
  const r = bishopScore({ dilation_cm: 3, effacement_pct: 80, station: 0, consistency: 'soft', position: 'anterior' });
  assert.ok(r.bishop >= 8, `Expected >= 8, got ${r.bishop}`);
  assert.strictEqual(r.category, 'favorable');
  assert.ok(r.recommendation.includes('amniotomy'));
});

run('Bishop intermediate', () => {
  const r = bishopScore({ dilation_cm: 2, effacement_pct: 50, station: -2, consistency: 'medium', position: 'mid' });
  // dilation 2(2) + effacement 50(1) + station -2(1) + consistency medium(1) + position mid(1) = 6 → intermediate
  assert.ok(r.bishop >= 5 && r.bishop <= 7, `Expected 5-7, got ${r.bishop}`);
  assert.strictEqual(r.category, 'intermediate');
});

run('Bishop invalid consistency throws', () => {
  assert.throws(() => bishopScore({ dilation_cm: 0, effacement_pct: 0, station: -3, consistency: 'hard', position: 'posterior' }), /consistency must be/);
});

console.log('partograph_extended tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
