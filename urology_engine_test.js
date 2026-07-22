const { test } = require('node:test');
const assert = require('node:assert');
const { ipssScore, renalStonesRisk } = require('./urology_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('IPSS mild', () => {
  const r = ipssScore({ incomplete_emptying: 1, frequency: 1, intermittency: 1, urgency: 1, weak_stream: 1, straining: 0, nocturia: 1, qol_score_0_6: 1 });
  assert.strictEqual(r.ipss, 6);
  assert.strictEqual(r.total, 7);
  assert.strictEqual(r.severity, 'mild');
});

run('IPSS moderate', () => {
  const r = ipssScore({ incomplete_emptying: 2, frequency: 2, intermittency: 2, urgency: 2, weak_stream: 2, straining: 2, nocturia: 2, qol_score_0_6: 2 });
  // symptoms 14 + qol 2 = 16
  assert.ok(r.ipss >= 8 && r.ipss < 20, `Expected 8-19, got ${r.ipss}`);
  assert.strictEqual(r.severity, 'moderate');
  assert.ok(r.action.includes('α-blocker') || r.action.includes('5-ARI'));
});

run('IPSS severe (surgical candidate)', () => {
  const r = ipssScore({ incomplete_emptying: 5, frequency: 5, intermittency: 5, urgency: 5, weak_stream: 5, straining: 5, nocturia: 5, qol_score_0_6: 6 });
  assert.strictEqual(r.total, 41);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('surgical') || r.action.includes('TURP'));
});

run('IPSS invalid throws', () => {
  assert.throws(() => ipssScore({ incomplete_emptying: 6, frequency: 0, intermittency: 0, urgency: 0, weak_stream: 0, straining: 0, nocturia: 0, qol_score_0_6: 0 }), /must be 0-5/);
});

run('Stones low risk', () => {
  const r = renalStonesRisk({ sex: 'female', age: 30, bmi: 22, fluid_intake_L_d: 3, sodium_g_d: 3, animal_protein_g_d: 60, oxalate_mg_d: 100, calcium_mg_d: 1000 });
  assert.strictEqual(r.severity, 'low');
});

run('Stones high risk (recurrent + low fluid + high salt)', () => {
  const r = renalStonesRisk({ sex: 'male', age: 55, bmi: 32, fluid_intake_L_d: 1.0, sodium_g_d: 6, animal_protein_g_d: 150, oxalate_mg_d: 250, calcium_mg_d: 500, recurrent_stones: true, family_history: true });
  assert.ok(r.riskPoints >= 12);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.action.includes('24-hour urine'));
});

run('Stones missing field throws', () => {
  assert.throws(() => renalStonesRisk({ sex: 'male' }), /Missing required field/);
});

console.log('urology tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
