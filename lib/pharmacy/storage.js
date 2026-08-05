// lib/pharmacy/storage.js
// In-memory master formula + compounding batch + log store.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).
//
// The store is split into three flat maps for fast lookup:
//   - formulas   : key=`${tenantId}::${formulaId}` → frozen formula
//   - batches    : key=`${batchId}`                → batch record
//   - auditLog   : append-only array of audit events
//
// In production this layer is backed by Postgres (compounding_master_formula,
// compounding_batch, compounding_audit_log) with RLS enabled. The route
// layer never touches the store directly — it always goes through
// lib/pharmacy/compounder.js.

'use strict';

function newPharmacyStorage() {
  const formulas = Object.create(null);
  const batches = Object.create(null);
  const auditLog = [];

  function formulaKey(tenantId, formulaId) {
    return tenantId + '::' + formulaId;
  }

  function putFormula(tenantId, formula) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!formula || !formula.formulaId) return { ok: false, error: 'FORMULA_REQUIRED' };
    formulas[formulaKey(tenantId, formula.formulaId)] = formula;
    return { ok: true };
  }

  function getFormula(tenantId, formulaId) {
    if (!tenantId || !formulaId) return null;
    return formulas[formulaKey(tenantId, formulaId)] || null;
  }

  function listFormulas(tenantId) {
    if (!tenantId) return [];
    const out = [];
    for (const k of Object.keys(formulas)) {
      if (k.indexOf(tenantId + '::') === 0) {
        out.push(formulas[k]);
      }
    }
    return out;
  }

  function putBatch(batch) {
    if (!batch || !batch.batchId) return { ok: false, error: 'BATCH_REQUIRED' };
    batches[batch.batchId] = batch;
    return { ok: true };
  }

  function getBatch(batchId) {
    if (!batchId) return null;
    return batches[batchId] || null;
  }

  function listBatches(tenantId, status) {
    if (!tenantId) return [];
    const out = [];
    for (const b of Object.values(batches)) {
      if (b.tenantId !== tenantId) continue;
      if (status && b.status !== status) continue;
      out.push(b);
    }
    return out;
  }

  function appendAudit(event) {
    if (!event || !event.kind) return { ok: false, error: 'EVENT_INVALID' };
    auditLog.push(event);
    return { ok: true };
  }

  function auditFor(tenantId) {
    if (!tenantId) return [];
    const out = [];
    for (const e of auditLog) {
      if (e.tenantId === tenantId) out.push(e);
    }
    return out;
  }

  function clear() {
    for (const k of Object.keys(formulas)) delete formulas[k];
    for (const k of Object.keys(batches)) delete batches[k];
    auditLog.length = 0;
  }

  function stats() {
    return {
      formulas: Object.keys(formulas).length,
      batches: Object.keys(batches).length,
      auditEvents: auditLog.length
    };
  }

  return {
    putFormula: putFormula,
    getFormula: getFormula,
    listFormulas: listFormulas,
    putBatch: putBatch,
    getBatch: getBatch,
    listBatches: listBatches,
    appendAudit: appendAudit,
    auditFor: auditFor,
    clear: clear,
    stats: stats
  };
}

module.exports = { newPharmacyStorage };
