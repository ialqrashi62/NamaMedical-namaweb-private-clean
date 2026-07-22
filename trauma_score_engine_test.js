const { test } = require('node:test');
const assert = require('node:assert');
const { glasgowComaScale, injurySeverityScore, revisedTraumaScore } = require('./trauma_score_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('GCS 15 (alert)', () => {
  const r = glasgowComaScale({ eye: 4, verbal: 5, motor: 6 });
  assert.strictEqual(r.gcs, 15);
  assert.strictEqual(r.severity, 'mild');
});

run('GCS 8 (intubation threshold)', () => {
  const r = glasgowComaScale({ eye: 2, verbal: 2, motor: 4 });
  assert.strictEqual(r.gcs, 8);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('intubate'));
});

run('GCS 3 (worst)', () => {
  const r = glasgowComaScale({ eye: 1, verbal: 1, motor: 1 });
  assert.strictEqual(r.gcs, 3);
  assert.strictEqual(r.severity, 'severe');
});

run('GCS invalid motor throws', () => {
  assert.throws(() => glasgowComaScale({ eye: 4, verbal: 5, motor: 7 }), /motor must be 1-6/);
});

run('ISS minor (only 1s)', () => {
  const r = injurySeverityScore({ injuries: [{ ais_severity: 1 }, { ais_severity: 1 }, { ais_severity: 1 }] });
  assert.strictEqual(r.iss, 3);
  assert.strictEqual(r.severity, 'minor');
});

run('ISS serious (multi-region)', () => {
  const r = injurySeverityScore({ injuries: [{ ais_severity: 4 }, { ais_severity: 3 }, { ais_severity: 2 }] });
  // 16+9+4 = 29
  assert.strictEqual(r.iss, 29);
  assert.strictEqual(r.severity, 'severe');
});

run('ISS auto-75 if any AIS=6', () => {
  const r = injurySeverityScore({ injuries: [{ ais_severity: 6 }, { ais_severity: 1 }] });
  assert.strictEqual(r.iss, 75);
  assert.strictEqual(r.severity, 'critical');
});

run('RTS 7.84 (normal)', () => {
  const r = revisedTraumaScore({ gcs_total: 15, systolic_bp_mmHg: 120, resp_rate: 16 });
  assert.strictEqual(r.rts, 7.84);
  assert.strictEqual(r.severity, 'mild');
});

run('RTS critical (low GCS + hypotension)', () => {
  const r = revisedTraumaScore({ gcs_total: 4, systolic_bp_mmHg: 60, resp_rate: 4 });
  assert.ok(r.rts < 4);
  assert.ok(['severe', 'critical', 'unsurvivable'].includes(r.severity));
});

run('RTS missing throws', () => {
  assert.throws(() => revisedTraumaScore({}), /Missing required field/);
});

console.log('trauma_score tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
