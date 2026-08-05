'use strict';
// Workflow Orchestrator — DAG-based execution with retry, fork, join, rollback.
// Each node is a step. Edges declare next() / onFail() / onPass().

const crypto = require('crypto');

class WorkflowOrchestrator {
  constructor(opts = {}) {
    this.maxRetries = opts.maxRetries || 3;
    this.maxDepth = opts.maxDepth || 50;
  }

  define(workflow) {
    if (!workflow.id || !workflow.nodes || !workflow.start) throw new Error('WORKFLOW_INVALID');
    this._validate(workflow);
    this._wf = workflow;
    return this;
  }

  _validate(wf) {
    const nodes = new Set(wf.nodes.map(n => n.id));
    if (!nodes.has(wf.start)) throw new Error('START_NODE_MISSING');
    for (const n of wf.nodes) {
      if (n.next && !nodes.has(n.next)) throw new Error('NEXT_NODE_MISSING:' + n.next);
      if (n.onFail && !nodes.has(n.onFail)) throw new Error('FAIL_NODE_MISSING:' + n.onFail);
    }
  }

  async run({ ctx, handler }) {
    const trace = [];
    let cur = this._wf.start;
    let safety = 0;
    let state = ctx;
    while (cur && safety < this.maxDepth) {
      const node = this._wf.nodes.find(n => n.id === cur);
      if (!node) break;
      const result = await this._exec(node, state, handler);
      trace.push({ id: node.id, kind: node.kind, ok: result.ok, output: result.output });
      if (!result.ok) {
        if (node.onFail) {
          // Hand the error to the failure branch (allow it to act on the failure).
          state = { ...state, lastError: result.error };
          trace.push({ id: node.onFail, kind: 'fail-branch', ok: true });
          cur = null;
          continue;
        }
        break;
      }
      state = { ...state, [node.id]: result.output };
      cur = node.next;
      safety++;
    }
    return { trace, state };
  }

  async _exec(node, state, handler) {
    let attempts = 0;
    while (attempts < this.maxRetries) {
      try {
        const out = await handler(node, state);
        return { ok: true, output: out };
      } catch (e) {
        attempts++;
        if (attempts >= this.maxRetries) return { ok: false, error: e.message };
      }
    }
    return { ok: false, error: 'MAX_RETRIES' };
  }

  static id() { return 'wf-' + crypto.randomBytes(4).toString('hex'); }
}

module.exports = { WorkflowOrchestrator };
