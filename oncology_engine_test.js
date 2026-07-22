const { test } = require('node:test');
const assert = require('node:assert');
const { tnmStage, bodySurfaceArea, chemoDose } = require('./oncology_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('TNM stage IA', () => {
  const r = tnmStage({ T: 1, N: 0, M: 0 });
  assert.strictEqual(r.stage, 'IA');
});

run('TNM stage IIB', () => {
  const r = tnmStage({ T: 4, N: 0, M: 0 });
  assert.strictEqual(r.stage, 'IIB');
});

run('TNM stage IIIA', () => {
  const r = tnmStage({ T: 1, N: 1, M: 0 });
  assert.strictEqual(r.stage, 'IIIA');
});

run('TNM stage IVB', () => {
  const r = tnmStage({ T: 2, N: 2, M: 1 });
  assert.strictEqual(r.stage, 'IVB');
});

run('TNM stage 0', () => {
  const r = tnmStage({ T: 0, N: 0, M: 0 });
  assert.strictEqual(r.stage, '0');
});

run('TNM invalid T throws', () => {
  assert.throws(() => tnmStage({ T: 5, N: 0, M: 0 }), /T must be 0-4/);
});

run('BSA Mosteller', () => {
  const r = bodySurfaceArea({ weight_kg: 70, height_cm: 170 });
  // sqrt(70 × 170 / 3600) = sqrt(3.306) = 1.818
  assert.ok(r.bsa > 1.7 && r.bsa < 1.9, `Expected 1.7-1.9, got ${r.bsa}`);
});

run('Chemo dose standard', () => {
  const r = chemoDose({ weight_kg: 70, height_cm: 170, dose_mg_per_m2: 100, renal_function_pct: 90, hepatic_function_pct: 90 });
  // bsa 1.82 × 100 = 182 mg
  assert.ok(r.calculatedDose > 170 && r.calculatedDose < 200, `Expected 170-200, got ${r.calculatedDose}`);
});

run('Chemo dose renal adjustment', () => {
  const r = chemoDose({ weight_kg: 70, height_cm: 170, dose_mg_per_m2: 100, renal_function_pct: 40, hepatic_function_pct: 90 });
  assert.ok(r.adjustments.length > 0, 'Should have adjustments');
  assert.ok(r.adjustedDose < r.calculatedDose, 'Dose should be reduced');
});

run('Chemo dose hepatic adjustment', () => {
  const r = chemoDose({ weight_kg: 70, height_cm: 170, dose_mg_per_m2: 100, renal_function_pct: 90, hepatic_function_pct: 25 });
  assert.ok(r.adjustments.some(adj => adj.includes('Hepatic')));
});

console.log('oncology tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
