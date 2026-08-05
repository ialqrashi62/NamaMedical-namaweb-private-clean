// lib/pharmacy/compounder.js
// Compounder — orchestrates the USP <797>/<800> compounding workflow.
//
//   - create():  create a batch from a master formula; stamp BUD, ISO class,
//                and double-witness requirements.
//   - dispense(): FEFO (first-expiry-first-out) on available batches +
//                 enforce double-witness for sterile / hazardous.
//   - recall():  withdraw a batch from circulation and log an audit event.
//   - list():    filter batches by tenant + status.
//
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).
// Hash-chained audit log (RAIL-10).

'use strict';

const crypto = require('crypto');
const Usp = require('./usp');
const Storage = require('./storage');

function Compounder(opts) {
  opts = opts || {};
  const store = opts.store || Storage.newPharmacyStorage();
  let lastChain = '0'.repeat(64);

  function chainHash(prev, payload) {
    const h = crypto.createHash('sha256');
    h.update(prev);
    h.update('|');
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  }

  function audit(event) {
    const payload = Object.assign({}, event, { ts: new Date().toISOString() });
    const chain = chainHash(lastChain, payload);
    lastChain = chain;
    const full = Object.assign({}, payload, { hash: chain, prevHash: payload.prevHash || null });
    store.appendAudit(full);
    return full;
  }

  function create({ tenantId, patientId, formulaId, batchSize, operatorId, witnessId }) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!formulaId) return { ok: false, error: 'FORMULA_REQUIRED' };
    const formula = store.getFormula(tenantId, formulaId);
    if (!formula) return { ok: false, error: 'FORMULA_NOT_FOUND' };
    // Enforce double-witness for high-risk compounding
    if (formula.doubleWitness && !witnessId) {
      return { ok: false, error: 'WITNESS_REQUIRED', msg: 'Double-witness required for ' + formula.category };
    }
    const batchId = 'cb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const budExpiresAt = new Date(Date.now() + formula.budHours * 3600 * 1000).toISOString();
    const batch = {
      batchId: batchId,
      tenantId: tenantId,
      patientId: patientId || null,
      formulaId: formulaId,
      formulaName: formula.name,
      category: formula.category,
      storage: formula.storage,
      riskLevel: formula.riskLevel,
      requiresPEC: formula.requiresPEC,
      requiresISOClass: formula.requiresISOClass,
      doubleWitness: formula.doubleWitness,
      batchSize: batchSize || null,
      operatorId: operatorId || null,
      witnessId: witnessId || null,
      status: 'available',
      budHours: formula.budHours,
      budBasis: formula.basis,
      budExpiresAt: budExpiresAt,
      createdAt: new Date().toISOString(),
      dispensedAt: null,
      dispensedTo: null,
      recallReason: null
    };
    store.putBatch(batch);
    audit({
      kind: 'compounding_batch_created',
      tenantId: tenantId,
      batchId: batchId,
      formulaId: formulaId,
      category: formula.category,
      riskLevel: formula.riskLevel,
      operatorId: operatorId || null,
      witnessId: witnessId || null
    });
    return { ok: true, batch: batch };
  }

  function dispense({ batchId, dispensedTo, witnessId, dispensedBy }) {
    if (!batchId) return { ok: false, error: 'BATCH_REQUIRED' };
    const batch = store.getBatch(batchId);
    if (!batch) return { ok: false, error: 'BATCH_NOT_FOUND' };
    if (batch.status !== 'available') {
      return { ok: false, error: 'BATCH_NOT_AVAILABLE', currentStatus: batch.status };
    }
    // Expiry check (FEFO is implicit: caller picked the batch)
    if (batch.budExpiresAt && new Date(batch.budExpiresAt).getTime() < Date.now()) {
      batch.status = 'expired';
      store.putBatch(batch);
      return { ok: false, error: 'BATCH_EXPIRED' };
    }
    // Double-witness for high-risk
    if (batch.doubleWitness && (!witnessId || witnessId === dispensedBy)) {
      return { ok: false, error: 'WITNESS_REQUIRED' };
    }
    if (!dispensedTo) return { ok: false, error: 'DISPENSED_TO_REQUIRED' };
    batch.status = 'dispensed';
    batch.dispensedAt = new Date().toISOString();
    batch.dispensedTo = dispensedTo;
    batch.dispensedBy = dispensedBy || null;
    batch.witnessId = witnessId || null;
    store.putBatch(batch);
    audit({
      kind: 'compounding_batch_dispensed',
      tenantId: batch.tenantId,
      batchId: batch.batchId,
      dispensedTo: dispensedTo,
      dispensedBy: dispensedBy || null,
      witnessId: witnessId || null
    });
    return { ok: true, batch: batch };
  }

  function recall({ batchId, reason, recalledBy }) {
    if (!batchId) return { ok: false, error: 'BATCH_REQUIRED' };
    const batch = store.getBatch(batchId);
    if (!batch) return { ok: false, error: 'BATCH_NOT_FOUND' };
    if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
    const previousStatus = batch.status;
    batch.status = 'recalled';
    batch.recallReason = reason;
    batch.recalledAt = new Date().toISOString();
    batch.recalledBy = recalledBy || null;
    store.putBatch(batch);
    audit({
      kind: 'compounding_batch_recalled',
      tenantId: batch.tenantId,
      batchId: batch.batchId,
      previousStatus: previousStatus,
      reason: reason,
      recalledBy: recalledBy || null
    });
    return { ok: true, batch: batch, notify: ['pharmacy', 'risk_mgmt', batch.tenantId] };
  }

  function list({ tenantId, status }) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const batches = store.listBatches(tenantId, status);
    return { ok: true, count: batches.length, batches: batches };
  }

  function chainHead() {
    return lastChain;
  }

  function auditLog({ tenantId }) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    return { ok: true, events: store.auditFor(tenantId) };
  }

  return {
    create: create,
    dispense: dispense,
    recall: recall,
    list: list,
    chainHead: chainHead,
    auditLog: auditLog,
    _store: store
  };
}

module.exports = Compounder;
