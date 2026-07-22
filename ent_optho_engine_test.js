const { test } = require('node:test');
const assert = require('node:assert');
const { pureToneAverage, visualAcuity, glaucomaRisk } = require('./ent_optho_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('PTA normal', () => {
  const r = pureToneAverage({ thresholds_500_4000_hz: { db_500: 10, db_1000: 15, db_2000: 10, db_4000: 15 } });
  assert.strictEqual(r.pta, 12.5);
  assert.strictEqual(r.grade, 'normal');
});

run('PTA mild', () => {
  const r = pureToneAverage({ thresholds_500_4000_hz: { db_500: 25, db_1000: 30, db_2000: 25, db_4000: 35 } });
  assert.ok(r.pta >= 28 && r.pta <= 29, `Expected ~28.8, got ${r.pta}`);
  assert.strictEqual(r.grade, 'mild');
});

run('PTA profound', () => {
  const r = pureToneAverage({ thresholds_500_4000_hz: { db_500: 95, db_1000: 100, db_2000: 100, db_4000: 105 } });
  assert.ok(r.pta >= 90);
  assert.strictEqual(r.grade, 'profound');
  assert.ok(r.action.includes('cochlear implant'));
});

run('VA 20/20 normal', () => {
  const r = visualAcuity({ snellen_20x: 20 });
  assert.strictEqual(r.logmar, 0);
  assert.strictEqual(r.grade, 'normal');
});

run('VA 20/200 legal blindness', () => {
  const r = visualAcuity({ snellen_20x: 200 });
  assert.strictEqual(r.logmar, 1);
  assert.ok(['severe', 'blind'].includes(r.grade));
});

run('VA 20/400 blind', () => {
  const r = visualAcuity({ snellen_20x: 400 });
  assert.ok(r.logmar >= 1.3, `Expected logmar >= 1.3, got ${r.logmar}`);
  assert.strictEqual(r.grade, 'blind');
});

run('Glaucoma low risk', () => {
  const r = glaucomaRisk({ iop_mmHg: 14, cup_disc_ratio: 0.3, central_corneal_thickness_um: 550 });
  assert.strictEqual(r.severity, 'low');
});

run('Glaucoma high risk (high IOP + large cup)', () => {
  const r = glaucomaRisk({ iop_mmHg: 32, cup_disc_ratio: 0.85, central_corneal_thickness_um: 480, family_history: true, age: 70, vf_defect_present: true });
  assert.ok(r.riskPoints >= 8);
  assert.strictEqual(r.severity, 'high');
});

run('Missing fields throws', () => {
  assert.throws(() => pureToneAverage({}), /thresholds_500_4000_hz required/);
  assert.throws(() => visualAcuity({}), /snellen_20x required/);
});

console.log('ent_optho tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
