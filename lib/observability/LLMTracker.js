// lib/observability/LLMTracker.js
// RAIL-12 compliant: prompt content is NEVER stored or logged — only metadata
// (model, tenant, tokens, cost, timestamp, period).
//
// In-memory store. Multi-tenant. Per-model breakdown. Monthly budget guard.
(function (root) {
  'use strict';

  // In-memory store: one record per LLM call
  // Shape: { period: 'YYYY-MM', model, tenant, tokens, cost, ts }
  const records = [];

  // Per-tenant monthly budget. Shape: { monthly, period, used }
  const budgets = new Map();

  // ---- helpers ----

  function getPeriod(date) {
    const d = (date instanceof Date) ? date : new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return y + '-' + m;
  }

  function asNum(v, dflt) {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  }

  function emptyBucket() {
    return { tokens: 0, cost: 0 };
  }

  // ---- public API ----

  /**
   * Record one LLM call.
   * NOTE: `prompt` is accepted in the signature for API ergonomics but is
   * NEVER stored, echoed, or logged. Only metadata is kept (RAIL-12).
   */
  function record(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const tokens = asNum(entry.tokens, NaN);
    const cost   = asNum(entry.cost, NaN);
    const model  = entry.model;
    const tenant = entry.tenant;
    if (!Number.isFinite(tokens) || tokens < 0) return false;
    if (!Number.isFinite(cost)   || cost   < 0) return false;
    if (typeof model  !== 'string' || !model)  return false;
    if (typeof tenant !== 'string' || !tenant) return false;

    records.push({
      period: getPeriod(),
      model:  model,
      tenant: tenant,
      tokens: tokens,
      cost:   cost,
      ts:     Date.now()
    });
    return true;
  }

  /**
   * Aggregate report for a period (default: current UTC month).
   * Returns { totalTokens, totalCost, byModel, byTenant }
   */
  function report(opts) {
    const period = (opts && typeof opts.period === 'string') ? opts.period : getPeriod();

    let totalTokens = 0;
    let totalCost   = 0;
    const byModel  = {};
    const byTenant = {};

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.period !== period) continue;

      totalTokens += r.tokens;
      totalCost   += r.cost;

      if (!byModel[r.model])   byModel[r.model]   = emptyBucket();
      if (!byTenant[r.tenant]) byTenant[r.tenant] = emptyBucket();

      byModel[r.model].tokens   += r.tokens;
      byModel[r.model].cost     += r.cost;
      byTenant[r.tenant].tokens += r.tokens;
      byTenant[r.tenant].cost   += r.cost;
    }

    return { totalTokens: totalTokens, totalCost: totalCost, byModel: byModel, byTenant: byTenant };
  }

  /**
   * Set the monthly budget (USD cost) for a tenant.
   * Stored against the current period; rolls over to a fresh window on month change.
   */
  function setBudget(opts) {
    if (!opts || typeof opts !== 'object') return false;
    const tenant  = opts.tenant;
    const monthly = asNum(opts.monthly, NaN);
    if (typeof tenant !== 'string' || !tenant) return false;
    if (!Number.isFinite(monthly) || monthly < 0) return false;

    budgets.set(tenant, {
      monthly: monthly,
      period:  getPeriod(),
      used:    0
    });
    return true;
  }

  /**
   * Returns true if the tenant's accumulated cost in the current period
   * exceeds the configured monthly budget. Returns false if no budget set.
   */
  function alert(opts) {
    if (!opts || typeof opts.tenant !== 'string' || !opts.tenant) return false;
    const tenant = opts.tenant;
    const b = budgets.get(tenant);
    if (!b) return false;

    const period = getPeriod();
    if (b.period !== period) {
      // New month: reset window. Existing records still queryable by period.
      b.period = period;
      b.used   = 0;
    }

    const r = report({ period: period });
    const bucket = r.byTenant[tenant];
    const used = bucket ? bucket.cost : 0;
    b.used = used;
    return used > b.monthly;
  }

  const LLMTracker = { record: record, report: report, setBudget: setBudget, alert: alert };

  // Export for CommonJS (Node) — supports both `require(...).LLMTracker`
  // and destructured `const { LLMTracker } = require(...)`.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.LLMTracker = LLMTracker;
    module.exports.default    = LLMTracker;
  }
  // Browser fallback
  if (typeof window !== 'undefined') {
    window.LLMTracker = LLMTracker;
  }
})(typeof window !== 'undefined' ? window : globalThis);
