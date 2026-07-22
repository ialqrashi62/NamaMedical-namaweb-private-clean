const { test } = require('node:test');
const assert = require('node:assert');
const { apgarScore, bhutaniRisk, birthweightCategory } = require('./neonatal_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('APGAR 10 (normal)', () => {
  const r = apgarScore({ appearance_0_2: 2, pulse_0_2: 2, grimace_0_2: 2, activity_0_2: 2, respiration_0_2: 2 });
  assert.strictEqual(r.apgar, 10);
  assert.strictEqual(r.severity, 'normal');
});

run('APGAR 4 (intermediate)', () => {
  const r = apgarScore({ appearance_0_2: 1, pulse_0_2: 1, grimace_0_2: 1, activity_0_2: 1, respiration_0_2: 0 });
  assert.strictEqual(r.apgar, 4);
  assert.strictEqual(r.severity, 'intermediate');
});

run('APGAR 2 (critical)', () => {
  const r = apgarScore({ appearance_0_2: 0, pulse_0_2: 1, grimace_0_2: 0, activity_0_2: 0, respiration_0_2: 1 });
  assert.strictEqual(r.apgar, 2);
  assert.strictEqual(r.severity, 'critical');
  assert.ok(r.action.includes('resuscitation'));
});

run('APGAR invalid throws', () => {
  assert.throws(() => apgarScore({ appearance_0_2: 3, pulse_0_2: 2, grimace_0_2: 2, activity_0_2: 2, respiration_0_2: 2 }), /must be 0, 1, or 2/);
});

run('Bhutani low risk', () => {
  const r = bhutaniRisk({ total_serum_bilirubin_mg_dL: 5, age_hours: 48, gestational_age_weeks: 39 });
  assert.strictEqual(r.riskLevel, 'low');
});

run('Bhutani high risk — phototherapy', () => {
  const r = bhutaniRisk({ total_serum_bilirubin_mg_dL: 14, age_hours: 48, gestational_age_weeks: 39 });
  assert.strictEqual(r.riskLevel, 'high');
  assert.ok(r.action.includes('Intensive phototherapy'));
});

run('Bhutani very high — exchange', () => {
  const r = bhutaniRisk({ total_serum_bilirubin_mg_dL: 22, age_hours: 72, gestational_age_weeks: 39 });
  assert.strictEqual(r.riskLevel, 'very_high');
  assert.ok(r.action.includes('exchange'));
});

run('Birthweight VLBW', () => {
  const r = birthweightCategory({ birth_weight_grams: 1200, gestational_age_weeks: 30 });
  assert.strictEqual(r.weightCategory, 'very_low_birth_weight');
  assert.strictEqual(r.gaCategory, 'very_preterm');
});

run('Birthweight macrosomia', () => {
  const r = birthweightCategory({ birth_weight_grams: 4500, gestational_age_weeks: 39 });
  assert.strictEqual(r.weightCategory, 'macrosomia');
  assert.strictEqual(r.gaCategory, 'term');
});

run('Bhutani missing throws', () => {
  assert.throws(() => bhutaniRisk({}), /Missing required field/);
});

console.log('neonatal tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
