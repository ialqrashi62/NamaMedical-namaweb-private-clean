const { test } = require('node:test');
const assert = require('node:assert');
const { karnofskyScore, ecogScore, pallPerformanceScale } = require('./palliative_performance_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('KPS 90 normal', () => {
  const r = karnofskyScore({ karnofsky: 90 });
  assert.strictEqual(r.band, 'able_normal');
});

run('KPS 60 unable work', () => {
  const r = karnofskyScore({ karnofsky: 60 });
  assert.strictEqual(r.band, 'unable_work');
});

run('KPS 20 hospice eligible', () => {
  const r = karnofskyScore({ karnofsky: 20 });
  assert.strictEqual(r.band, 'unable_care');
  assert.ok(r.action.includes('Hospice') || r.action.includes('comfort'));
});

run('KPS 0 moribund', () => {
  const r = karnofskyScore({ karnofsky: 0 });
  assert.strictEqual(r.band, 'moribund');
});

run('KPS invalid value throws', () => {
  assert.throws(() => karnofskyScore({ karnofsky: 55 }), /multiple of 10/);
});

run('ECOG 0 normal', () => {
  const r = ecogScore({ ecog: 0 });
  assert.strictEqual(r.ecog, 0);
});

run('ECOG 3 limited', () => {
  const r = ecogScore({ ecog: 3 });
  assert.strictEqual(r.ecog, 3);
  assert.ok(r.action.includes('Hospice'));
});

run('ECOG invalid throws', () => {
  assert.throws(() => ecogScore({ ecog: 6 }), /ecog must be 0-5/);
});

run('PPS 90 healthy', () => {
  const r = pallPerformanceScale({});
  assert.strictEqual(r.pps, 100);
});

run('PPS 30 — PPS = min of components', () => {
  const r = pallPerformanceScale({ ambulation: 50, activity: 50, self_care: 30, oral_intake: 50, consciousness: 50 });
  assert.strictEqual(r.pps, 30);
  assert.ok(r.action.includes('Hospice'));
});

run('PPS 0 dying', () => {
  const r = pallPerformanceScale({ ambulation: 0 });
  assert.strictEqual(r.pps, 0);
  assert.ok(r.action.includes('dignity'));
});

console.log('palliative tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
