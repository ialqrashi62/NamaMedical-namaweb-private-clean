'use strict';
// Budget Tracker — combines token + infra costs into a single monthly report.
class BudgetTracker {
  constructor(opts = {}) {
    this.tokenCosts = opts.tokenCosts || {}; // model → $/1M tokens
    this.infraCosts = opts.infraCosts || {}; // service → $/month
    this.records = [];
  }

  setTokenRate({ model, pricePerMTokens }) {
    this.tokenCosts[model] = pricePerMTokens;
  }

  setInfraRate({ service, monthly }) {
    this.infraCosts[service] = monthly;
  }

  logToken({ tenantId, model, tokens }) {
    const rate = this.tokenCosts[model] || 0;
    this.records.push({ kind: 'token', tenantId, model, tokens, cost: (tokens / 1e6) * rate, ts: Date.now() });
  }

  monthlyReport(tenantId) {
    const month = new Date().toISOString().slice(0, 7);
    const token = this.records
      .filter(r => r.kind === 'token' && r.tenantId === tenantId && new Date(r.ts).toISOString().slice(0, 7) === month)
      .reduce((s, r) => s + r.cost, 0);
    const infra = Object.values(this.infraCosts).reduce((a, b) => a + b, 0);
    return { tenantId, month, tokenCost: token, infraCost: infra, total: token + infra };
  }
}

module.exports = { BudgetTracker };
