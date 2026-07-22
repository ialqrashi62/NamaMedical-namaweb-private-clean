const { test } = require('node:test');
const assert = require('node:assert');
const { copdSeverity } = require('./copd_severity_engine');

let pass = 0, fail = 0;
function run(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, e.message); } }

run('COPD GOLD1 Group A — LAMA', () => {
  const r = copdSeverity({ fev1_pct: 85, cat_score: 5, exacerbations_last_12m: 0, hospitalization_last_12m: 0, mMRC_dyspnea: 0, smoke_status: 'current', eosinophils_cells_ul: 50 });
  assert.strictEqual(r.goldGroup, 'A');
  assert.ok(['LAMA', 'SAMA'].some(t => r.firstLine.includes(t)));
});

run('COPD GOLD2 Group B — LABA+LAMA', () => {
  const r = copdSeverity({ fev1_pct: 65, cat_score: 15, exacerbations_last_12m: 1, hospitalization_last_12m: 0, mMRC_dyspnea: 2, smoke_status: 'current', eosinophils_cells_ul: 80 });
  assert.strictEqual(r.goldGroup, 'B');
  assert.ok(r.firstLine.includes('LABA') || r.firstLine.includes('LAMA'));
});

run('COPD GOLD3 Group E with eos>300 — triple therapy', () => {
  const r = copdSeverity({ fev1_pct: 35, cat_score: 25, exacerbations_last_12m: 3, hospitalization_last_12m: 1, mMRC_dyspnea: 3, smoke_status: 'current', eosinophils_cells_ul: 400 });
  assert.strictEqual(r.goldGroup, 'E');
  assert.ok(r.firstLine.includes('ICS'));
  assert.ok(r.firstLine.includes('LAMA'));
});

run('Recent hospitalization flagged urgent', () => {
  const r = copdSeverity({ fev1_pct: 60, cat_score: 15, exacerbations_last_12m: 2, hospitalization_last_12m: 1, mMRC_dyspnea: 2, smoke_status: 'former', eosinophils_cells_ul: 100 });
  assert.ok(r.recommendations.some(rec => rec.action.includes('follow-up within 7 days')));
});

run('High CAT score escalation', () => {
  const r = copdSeverity({ fev1_pct: 70, cat_score: 22, exacerbations_last_12m: 0, hospitalization_last_12m: 0, mMRC_dyspnea: 1, smoke_status: 'never', eosinophils_cells_ul: 50 });
  assert.ok(r.recommendations.some(rec => rec.action.includes('triple therapy')));
});

run('Missing required fields throws', () => {
  assert.throws(() => copdSeverity({}), /fev1_pct, cat_score, exacerbations_last_12m required/);
});

console.log('copd_severity tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
