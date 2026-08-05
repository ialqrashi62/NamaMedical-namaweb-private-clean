'use strict';
// Token Budget Manager — caps LLM spending per tenant/per day.
// Rejects when budget exceeded.

class TokenBudgetManager {
  constructor(opts = {}) {
    this.budgets = opts.budgets || {}; // { tenantId: { daily, monthly } }
    this.usage = {};                   // { tenantId: { day: { tokens, calls } } }
  }

  setBudget({ tenantId, daily, monthly }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    this.budgets[tenantId] = { daily: daily || Infinity, monthly: monthly || Infinity };
  }

  consume({ tenantId, tokens }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    if (!this.usage[tenantId]) this.usage[tenantId] = { day: {}, month: {} };
    this.usage[tenantId].day[today] = (this.usage[tenantId].day[today] || 0) + tokens;
    this.usage[tenantId].month[month] = (this.usage[tenantId].month[month] || 0) + tokens;
    const b = this.budgets[tenantId] || {};
    if (this.usage[tenantId].day[today] > b.daily) throw new Error('DAILY_BUDGET_EXCEEDED');
    if (this.usage[tenantId].month[month] > b.monthly) throw new Error('MONTHLY_BUDGET_EXCEEDED');
  }

  report(tenantId) {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const u = this.usage[tenantId] || { day: {}, month: {} };
    const b = this.budgets[tenantId] || {};
    return {
      tenantId,
      day: { used: u.day[today] || 0, budget: b.daily || 0 },
      month: { used: u.month[month] || 0, budget: b.monthly || 0 },
    };
  }
}

module.exports = { TokenBudgetManager };
