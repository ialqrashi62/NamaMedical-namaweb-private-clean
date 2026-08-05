'use strict';
// Contract Test — verifies that provider meets a contract.
// (provider = { getName, evaluate, supports })
// Compares actual vs expected outputs.

class ContractTest {
  constructor(opts = {}) {
    this.contracts = opts.contracts || [];
  }

  add(contract) {
    if (!contract.name || !contract.provider || !contract.cases) throw new Error('CONTRACT_INVALID');
    this.contracts.push(contract);
  }

  async run() {
    const results = [];
    for (const c of this.contracts) {
      for (const tc of c.cases) {
        let actual;
        try {
          actual = await c.provider.evaluate(tc.input);
        } catch (e) {
          results.push({ name: c.name, case: tc.name, ok: false, reason: 'exception:' + e.message });
          continue;
        }
        const expected = tc.expected;
        const ok = this._compare(actual, expected, tc.comparator || 'eq');
        results.push({ name: c.name, case: tc.name, ok, actual, expected });
      }
    }
    return { ok: results.every(r => r.ok), results };
  }

  _compare(a, e, op) {
    if (op === 'eq') return JSON.stringify(a) === JSON.stringify(e);
    if (op === 'contains') return JSON.stringify(a).includes(JSON.stringify(e));
    if (op === 'gte') return a >= e;
    return false;
  }
}

module.exports = { ContractTest };
