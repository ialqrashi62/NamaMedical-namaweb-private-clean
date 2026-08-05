'use strict';
// LLM Observability — tracks token usage, latency, errors per call.
class LLMObserver {
  constructor(opts = {}) {
    this.calls = [];
    this.alerts = [];
  }

  observe({ model, prompt, response, tokens, latencyMs, error }) {
    const record = {
      ts: Date.now(),
      model,
      tokens: tokens || 0,
      latencyMs: latencyMs || 0,
      error: error || null,
      promptLength: (prompt || '').length,
      responseLength: (response || '').length,
    };
    this.calls.push(record);
    if (error) this.alerts.push({ kind: 'error', ...record });
    if (latencyMs > 5000) this.alerts.push({ kind: 'slow', ...record });
    return record;
  }

  metrics() {
    const total = this.calls.length;
    const errors = this.calls.filter(c => c.error).length;
    const tokens = this.calls.reduce((s, c) => s + c.tokens, 0);
    const avgLatency = total ? this.calls.reduce((s, c) => s + c.latencyMs, 0) / total : 0;
    return { total, errors, errorRate: total ? errors / total : 0, tokens, avgLatency };
  }

  export() {
    return { calls: this.calls, alerts: this.alerts };
  }
}

module.exports = { LLMObserver };
