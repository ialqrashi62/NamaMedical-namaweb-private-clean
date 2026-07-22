const { test } = require('node:test');
const assert = require('node:assert');
const { das28crp, sledai2k } = require('./rheum_activity_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('DAS28-CRP remission', () => {
  const r = das28crp({ tender_joints_28: 0, swollen_joints_28: 0, crp_mg_L: 1, patient_global_vas_0_100: 5 });
  assert.ok(r.das28 < 2.6, `Expected < 2.6, got ${r.das28}`);
  assert.strictEqual(r.severity, 'remission');
});

run('DAS28-CRP low activity', () => {
  const r = das28crp({ tender_joints_28: 2, swollen_joints_28: 1, crp_mg_L: 5, patient_global_vas_0_100: 20 });
  assert.ok(r.das28 >= 2.6 && r.das28 <= 3.2, `Expected 2.6-3.2, got ${r.das28}`);
  assert.strictEqual(r.severity, 'low');
});

run('DAS28-CRP moderate', () => {
  const r = das28crp({ tender_joints_28: 6, swollen_joints_28: 4, crp_mg_L: 15, patient_global_vas_0_100: 50 });
  assert.ok(r.das28 > 3.2 && r.das28 <= 5.1, `Expected 3.2-5.1, got ${r.das28}`);
  assert.strictEqual(r.severity, 'moderate');
});

run('DAS28-CRP high activity', () => {
  const r = das28crp({ tender_joints_28: 18, swollen_joints_28: 12, crp_mg_L: 50, patient_global_vas_0_100: 80 });
  assert.ok(r.das28 > 5.1, `Expected > 5.1, got ${r.das28}`);
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.recommendations.some(rec => rec.action.includes('biologic')));
});

run('DAS28 invalid joint count throws', () => {
  assert.throws(() => das28crp({ tender_joints_28: 30, swollen_joints_28: 0, crp_mg_L: 5, patient_global_vas_0_100: 20 }), /must be 0-28/);
});

run('SLEDAI-2K no activity', () => {
  const r = sledai2k({});
  assert.strictEqual(r.sledai, 0);
  assert.strictEqual(r.severity, 'no_activity');
});

run('SLEDAI-2K mild flare', () => {
  const r = sledai2k({ rash: 1, arthritis: 1 });  // 2 + 4 = 6 → moderate actually
  // Let's calculate: rash(2) + arthritis(4) = 6
  assert.strictEqual(r.sledai, 6);
  assert.strictEqual(r.severity, 'moderate');
});

run('SLEDAI-2K severe (lupus nephritis)', () => {
  const r = sledai2k({ proteinuria_500mg_d: 1, hematuria_5rbc: 1, casts: 1, low_complement: 1, elevated_dsdna: 1 });
  // 4+4+4+2+2 = 16 → severe
  assert.strictEqual(r.sledai, 16);
  assert.strictEqual(r.severity, 'severe');
  assert.ok(r.action.includes('IV methylprednisolone'));
});

run('SLEDAI-2K very severe (CNS)', () => {
  const r = sledai2k({ seizure: 1, psychosis: 1, cva: 1 });
  // 8+8+8 = 24 → very severe
  assert.strictEqual(r.sledai, 24);
  assert.strictEqual(r.severity, 'very_severe');
  assert.ok(r.action.includes('cyclophosphamide'));
});

console.log('rheum_activity tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
