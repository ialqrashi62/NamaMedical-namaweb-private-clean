const { test } = require('node:test');
const assert = require('node:assert');
const { pasiScore, scoradScore } = require('./derm_score_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('PASI 0 (clear)', () => {
  const r = pasiScore({ head: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, trunk: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, upper_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, lower_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 } });
  assert.strictEqual(r.pasi, 0);
  assert.strictEqual(r.severity, 'mild');
});

run('PASI mild', () => {
  const r = pasiScore({ head: { erythema: 1, induration: 1, desquamation: 1, area_pct: 5 }, trunk: { erythema: 1, induration: 1, desquamation: 1, area_pct: 8 }, upper_extremities: { erythema: 1, induration: 1, desquamation: 1, area_pct: 5 }, lower_extremities: { erythema: 1, induration: 1, desquamation: 1, area_pct: 5 } });
  assert.ok(r.pasi < 7, `Expected < 7, got ${r.pasi}`);
});

run('PASI severe', () => {
  const r = pasiScore({ head: { erythema: 3, induration: 3, desquamation: 3, area_pct: 60 }, trunk: { erythema: 3, induration: 3, desquamation: 3, area_pct: 70 }, upper_extremities: { erythema: 3, induration: 3, desquamation: 3, area_pct: 60 }, lower_extremities: { erythema: 3, induration: 3, desquamation: 3, area_pct: 80 } });
  assert.ok(r.pasi > 12, `Expected > 12, got ${r.pasi}`);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('biologic'));
});

run('PASI invalid area throws', () => {
  assert.throws(() => pasiScore({ head: { erythema: 0, induration: 0, desquamation: 0, area_pct: 110 }, trunk: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, upper_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 }, lower_extremities: { erythema: 0, induration: 0, desquamation: 0, area_pct: 0 } }), /area_pct must be 0-100/);
});

run('SCORAD mild', () => {
  const r = scoradScore({ extent_pct_0_100: 10, intensity_erythema_0_3: 1, intensity_papulation_0_3: 1, intensity_oozing_0_3: 0, intensity_excoriation_0_3: 0, intensity_lichenification_0_3: 0, intensity_dryness_0_3: 1, subjective_itch_0_10: 2, subjective_sleep_loss_0_10: 1 });
  assert.ok(r.scorad < 25);
  assert.strictEqual(r.severity, 'mild');
});

run('SCORAD severe — dupilumab', () => {
  const r = scoradScore({ extent_pct_0_100: 100, intensity_erythema_0_3: 3, intensity_papulation_0_3: 3, intensity_oozing_0_3: 3, intensity_excoriation_0_3: 3, intensity_lichenification_0_3: 3, intensity_dryness_0_3: 3, subjective_itch_0_10: 10, subjective_sleep_loss_0_10: 10 });
  assert.ok(r.scorad >= 50, `Expected >= 50, got ${r.scorad}`);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('dupilumab'));
});

run('SCORAD missing field throws', () => {
  assert.throws(() => scoradScore({}), /Missing required field/);
});

console.log('derm_score tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
