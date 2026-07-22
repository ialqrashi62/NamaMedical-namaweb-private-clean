const { test } = require('node:test');
const assert = require('node:assert');
const { ckdEgfr, ckdStaging } = require('./ckd_staging_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('eGFR normal young adult', () => {
  const r = ckdEgfr({ age: 25, sex: 'female', creatinine_mg_dL: 0.7, race_black: false });
  assert.ok(r.egfr > 90, `Expected eGFR > 90, got ${r.egfr}`);
  assert.strictEqual(r.gfrCategory, 1);
});

run('eGFR moderately decreased (G3a)', () => {
  const r = ckdEgfr({ age: 60, sex: 'male', creatinine_mg_dL: 1.5, race_black: false });
  assert.ok(r.egfr >= 45 && r.egfr < 60, `Expected 45-60, got ${r.egfr}`);
  assert.strictEqual(r.gfrCategory, '3a');
});

run('eGFR kidney failure (G5)', () => {
  const r = ckdEgfr({ age: 70, sex: 'male', creatinine_mg_dL: 8.0, race_black: false });
  assert.ok(r.egfr < 15, `Expected < 15, got ${r.egfr}`);
  assert.strictEqual(r.gfrCategory, 5);
});

run('CKD full staging with albuminuria', () => {
  const r = ckdStaging({ age: 60, sex: 'male', creatinine_mg_dL: 2.5, race_black: false, albumin_creatinine_ratio_mg_g: 350 });
  assert.strictEqual(r.gfrCategory, 4);
  assert.strictEqual(r.albuminuriaCategory, 3);
  assert.strictEqual(r.kdigoStage, 'G4A3');
  assert.strictEqual(r.riskLevel, 'very_high');
  assert.ok(r.action.includes('RRT'));
});

run('CKD stage 3a with A1 low risk', () => {
  const r = ckdStaging({ age: 65, sex: 'female', creatinine_mg_dL: 1.2, race_black: false, albumin_creatinine_ratio_mg_g: 15 });
  assert.strictEqual(r.gfrCategory, '3a');
  assert.strictEqual(r.albuminuriaCategory, 1);
});

run('KFRE 5-year risk > 5% with severe G4A3', () => {
  const r = ckdStaging({ age: 75, sex: 'male', creatinine_mg_dL: 3.5, race_black: false, albumin_creatinine_ratio_mg_g: 1500 });
  assert.ok(r.fiveYearEsrdRisk > 5, `Expected > 5%, got ${r.fiveYearEsrdRisk}`);
});

run('SGLT2i recommended for diabetic CKD', () => {
  const r = ckdStaging({ age: 65, sex: 'male', creatinine_mg_dL: 1.5, race_black: false, albumin_creatinine_ratio_mg_g: 100, diabetes: true });
  assert.ok(r.recommendations.some(rec => rec.action.includes('SGLT2')));
});

run('Missing fields throws', () => {
  assert.throws(() => ckdEgfr({}), /Missing required field/);
});

console.log('ckd_staging tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
