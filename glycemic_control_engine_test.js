const { test } = require('node:test');
const assert = require('node:assert');
const { glycemicControl, TIR_TARGETS } = require('./glycemic_control_engine');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); }
}

run('T1DM well-controlled', () => {
  const r = glycemicControl({ type: 'type1', hba1c: 6.5, tir_pct: 75, time_below_70: 3, time_below_54: 0 });
  assert.strictEqual(r.severity, 'normal');
});

run('T2DM uncontrolled', () => {
  const r = glycemicControl({ type: 'type2_young', hba1c: 10.5, tir_pct: 40, time_below_70: 2, time_below_54: 0 });
  assert.strictEqual(r.severity, 'uncontrolled');
  assert.ok(r.recommendations.some(rec => rec.action.includes('Intensify')));
});

run('Pregnancy strict target', () => {
  const r = glycemicControl({ type: 'type2_young', pregnant: true, hba1c: 6.8, tir_pct: 65, time_below_70: 3, time_below_54: 0 });
  assert.strictEqual(r.target.hba1c_max, 6.5);
});

run('Elderly lenient target', () => {
  const r = glycemicControl({ type: 'type2_elderly', age: 78, hba1c: 8.0, tir_pct: 60, time_below_70: 2, time_below_54: 0 });
  assert.strictEqual(r.severity, 'normal');
  assert.strictEqual(r.target.hba1c_max, 8.0);
});

run('Hypoglycemia risk flagged', () => {
  const r = glycemicControl({ type: 'type1', hba1c: 7.0, tir_pct: 70, time_below_70: 8, time_below_54: 2 });
  assert.strictEqual(r.severity, 'hypoglycemia-risk');
  assert.ok(r.recommendations.some(rec => rec.action.includes('Reduce hypoglycemia')));
});

run('Critical HbA1c >11', () => {
  const r = glycemicControl({ type: 'type2_young', hba1c: 12.0, tir_pct: 30, time_below_70: 1, time_below_54: 0 });
  assert.strictEqual(r.severity, 'critical');
});

run('Low eGFR renal dose adjustment', () => {
  const r = glycemicControl({ type: 'type2_young', hba1c: 7.5, tir_pct: 60, time_below_70: 1, time_below_54: 0, egfr: 25 });
  assert.ok(r.recommendations.some(rec => rec.action.includes('Renal dose')));
});

run('Missing hba1c throws', () => {
  assert.throws(() => glycemicControl({ type: 'type1', tir_pct: 70 }), /hba1c and tir_pct required/);
});

console.log('glycemic_control tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
