'use strict';
// Universal LangChain — chain composition for 39+ departments.
// Each chain: input → preprocess → lookup → [optional: rag] → llm → postprocess → guardrails.
// Deterministic when no LLM is available (returns rule-based output).

class UniversalLangChain {
  constructor(opts = {}) {
    this.llm = opts.llm || null; // sandbox: null
    this.audit = opts.audit || null;
    this.tokenBudget = opts.tokenBudget || 4096;
  }

  define(dept, steps) {
    if (!dept || !steps || !steps.length) throw new Error('CHAIN_INVALID');
    this._chains = this._chains || {};
    this._chains[dept] = steps;
    return this;
  }

  async invoke(dept, input) {
    const chain = this._chains && this._chains[dept];
    if (!chain) throw new Error('CHAIN_UNKNOWN:' + dept);
    let state = { input };
    const trace = [];
    for (const step of chain) {
      try {
        const out = await this._runStep(step, state);
        trace.push({ step: step.id, ok: true });
        state = { ...state, [step.id]: out };
      } catch (e) {
        trace.push({ step: step.id, ok: false, err: e.message });
        throw e;
      }
    }
    return { output: state[chain[chain.length - 1].id], trace };
  }

  async _runStep(step, state) {
    if (step.guard) {
      const ok = step.guard(state);
      if (!ok) throw new Error('GUARD_FAILED:' + step.id);
    }
    if (step.type === 'prompt') {
      return this._renderPrompt(step.template, state);
    }
    if (step.type === 'rag') {
      return step.lookup ? step.lookup(state) : null;
    }
    if (step.type === 'llm') {
      if (!this.llm) return { stub: true, prompt: step.prompt || state[step.from] };
      return this.llm.invoke({ prompt: step.prompt || state[step.from], budget: this.tokenBudget });
    }
    if (step.type === 'parse') return this._parseJSON(state[step.from]);
    if (step.type === 'audit') { this.audit && this.audit.append({ chain: step.id, dept: step.dept }); return true; }
    return null;
  }

  _renderPrompt(template, state) {
    return template.replace(/\{(\w+)\}/g, (_, k) => state[k] !== undefined ? String(state[k]) : `{${k}}`);
  }

  _parseJSON(s) {
    if (typeof s !== 'string') return s;
    return JSON.parse(s);
  }

  listDepts() {
    return Object.keys(this._chains || {});
  }
}

module.exports = { UniversalLangChain };
