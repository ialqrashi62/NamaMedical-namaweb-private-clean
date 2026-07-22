const { test } = require('node:test');
const assert = require('node:assert');
const { interpretThyroid, TSH_REF, FT4_REF } = require('./thyroid_engine');

let pass = 0, fail = 0;
function run(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error('FAIL', name, e.message);
  }
}

run('Overt hypothyroid — start levothyroxine', () => {
  const r = interpretThyroid({ tsh: 25, ft4: 0.5, age: 45 });
  assert.strictEqual(r.pattern, 'overt_hypothyroid');
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.recommendations[0].action.includes('levothyroxine'));
});

run('Subclinical hypothyroid — observe', () => {
  const r = interpretThyroid({ tsh: 6, ft4: 1.0, age: 45 });
  assert.strictEqual(r.pattern, 'subclinical_hypothyroid');
  assert.strictEqual(r.severity, 'moderate');
});

run('Subclinical hypothyroid TSH > 10 — treat', () => {
  const r = interpretThyroid({ tsh: 12, ft4: 1.0, age: 45 });
  assert.ok(r.recommendations[0].action.includes('levothyroxine'));
});

run('Overt hyperthyroid', () => {
  const r = interpretThyroid({ tsh: 0.05, ft4: 3.0, age: 45 });
  assert.strictEqual(r.pattern, 'overt_hyperthyroid');
  assert.strictEqual(r.severity, 'high');
  assert.ok(r.recommendations[0].action.includes('endocrinology'));
});

run('Euthyroid', () => {
  const r = interpretThyroid({ tsh: 2.5, ft4: 1.2, age: 45 });
  assert.strictEqual(r.pattern, 'euthyroid');
  assert.strictEqual(r.severity, 'normal');
});

run('Pregnancy subclinical — treat', () => {
  const r = interpretThyroid({ tsh: 5, ft4: 1.2, age: 30, pregnant: true });
  assert.ok(r.recommendations[0].action.includes('levothyroxine') || r.recommendations[0].action.includes('Treat'));
});

run('Comorbid heart — smaller dose', () => {
  const r = interpretThyroid({ tsh: 25, ft4: 0.5, age: 70, comorbid_heart: true });
  assert.strictEqual(r.pattern, 'overt_hypothyroid');
  assert.ok(r.recommendations[0].action.includes('12.5') || r.recommendations[0].action.includes('0.025'));
});

run('Missing TSH throws', () => {
  assert.throws(() => interpretThyroid({ ft4: 1.0 }), /tsh required/);
});

console.log('thyroid tests: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
