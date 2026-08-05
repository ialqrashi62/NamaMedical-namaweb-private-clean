'use strict';
// Saga — long-running business transaction with compensating actions.
// Each step has a `do` and a `compensate`. On failure, runs compensations in reverse.

class Saga {
  constructor(opts = {}) {
    this.steps = opts.steps || [];
  }

  define(name, steps) {
    if (!name || !steps || !steps.length) throw new Error('SAGA_INVALID');
    for (const s of steps) {
      if (!s.name || typeof s.do !== 'function') throw new Error('STEP_INVALID');
    }
    this._saga = { name, steps };
    return this;
  }

  async run({ ctx, executor }) {
    const compensations = [];
    const trace = [];
    try {
      for (const step of this._saga.steps) {
        const result = await executor(step.do, ctx);
        trace.push({ name: step.name, ok: true });
        compensations.push(step.compensate);
        ctx = { ...ctx, [step.name]: result };
      }
      return { ok: true, trace, ctx };
    } catch (e) {
      trace.push({ name: '<failed>', err: e.message });
      // Compensate in reverse order
      for (const c of compensations.reverse()) {
        if (typeof c === 'function') {
          try { await executor(c, ctx); } catch (_) { /* swallow */ }
        }
      }
      return { ok: false, trace, error: e.message };
    }
  }
}

module.exports = { Saga };
