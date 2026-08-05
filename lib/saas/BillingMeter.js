'use strict';
// BillingMeter — increments usage counters per tenant. Used by the SaaS billing
// pipeline. Discrete events: encounters, apiCalls, storage, voiceMinutes.

function newBillingMeter() {
  const counters = new Map(); // tenantId → { events }
  function tick({ tenantId, event, value }) {
    if (!tenantId || !event) throw new Error('TENANT_AND_EVENT_REQUIRED');
    if (!counters.has(tenantId)) counters.set(tenantId, { encounters: 0, apiCalls: 0, storageGB: 0, voiceMinutes: 0 });
    counters.get(tenantId)[event] = (counters.get(tenantId)[event] || 0) + (value || 1);
    return counters.get(tenantId);
  }
  function snapshot(tenantId) { return counters.get(tenantId) || null; }
  function invoice(tenantId, prices) {
    const s = counters.get(tenantId);
    if (!s) return null;
    const p = prices || { encounters: 0.5, apiCalls: 0.001, storageGB: 0.1, voiceMinutes: 0.05 };
    let total = 0;
    for (const k of Object.keys(p)) {
      total += (s[k] || 0) * p[k];
    }
    return { tenantId, snapshot: s, total };
  }
  return { tick, snapshot, invoice, _counters: counters };
}

module.exports = { newBillingMeter };
