'use strict';
// PatientPortal — sandbox-safe ledger for MyNama
// Hash-chained audit log for patient-initiated events (consent, export, login).
// PHI NEVER stored in entries — only sha256(tenantId+patientId) is referenced.

const crypto = require('crypto');

function hash(prev, payload) {
  const h = crypto.createHash('sha256');
  h.update(String(prev || ''));
  h.update('|');
  h.update(JSON.stringify(payload || {}));
  return h.digest('hex');
}

class MyNamaLedger {
  constructor() {
    this.entries = [];
    this.head = '0'.repeat(64);
  }
  append({ tenantId, patientIdHash, kind, payload }) {
    if (!tenantId || typeof tenantId !== 'string') throw new Error('TENANT_REQUIRED');
    if (!patientIdHash || typeof patientIdHash !== 'string') throw new Error('PATIENT_HASH_REQUIRED');
    if (!kind) throw new Error('KIND_REQUIRED');
    const prev = this.head;
    const nonce = crypto.randomBytes(8).toString('hex');
    const entry = {
      seq: this.entries.length + 1,
      ts: new Date().toISOString(),
      tenantId,
      patientIdHash,
      kind,
      payload: payload || {},
      nonce,
      prev,
    };
    entry.hash = hash(prev, { ...entry, hash: undefined });
    this.head = entry.hash;
    this.entries.push(entry);
    return entry;
  }
  verify() {
    let prev = '0'.repeat(64);
    for (const e of this.entries) {
      if (e.prev !== prev) return false;
      const recomputed = hash(prev, { ...e, hash: undefined });
      if (recomputed !== e.hash) return false;
      prev = e.hash;
    }
    return true;
  }
}

// Helper: derive a tenant-scoped, salted patient hash
function patientIdHash(tenantId, patientId, salt) {
  if (!tenantId || !patientId) throw new Error('MISSING_INPUTS');
  return 'sha:' + crypto.createHash('sha256')
    .update(String(tenantId) + ':' + String(salt || 'no-salt') + ':' + String(patientId))
    .digest('hex');
}

module.exports = { MyNamaLedger, patientIdHash };
