// lib/genomic/storage.js
// In-memory variant store keyed by (tenantId, patientId, gene).
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).
//
// NOTE: This is the sandbox-friendly in-process store. In production
// the same interface is implemented against Postgres (table: pgx_variant)
// with RLS enabled. The route layer never touches the store directly —
// it always goes through the PgxReport class in lib/genomic/report.js.

'use strict';

function newGenomicStore() {
  // key = `${tenantId}::${patientId}::${gene.toUpperCase()}` → variant record
  const byKey = Object.create(null);
  // index = `${tenantId}::${patientId}` → Set<gene>  (for history)
  const byPatient = Object.create(null);

  function key(tenantId, patientId, gene) {
    return tenantId + '::' + patientId + '::' + String(gene || '').toUpperCase();
  }

  function indexKey(tenantId, patientId) {
    return tenantId + '::' + patientId;
  }

  function add({ tenantId, patientId, gene, variantType, rsId, phenotype, zygosity, source, recordedBy }) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!patientId) return { ok: false, error: 'PATIENT_REQUIRED' };
    if (!gene) return { ok: false, error: 'GENE_REQUIRED' };
    if (!phenotype) return { ok: false, error: 'PHENOTYPE_REQUIRED' };
    const k = key(tenantId, patientId, gene);
    const record = {
      tenantId: tenantId,
      patientId: patientId,
      gene: String(gene).toUpperCase(),
      variantType: variantType || 'snv',
      rsId: rsId || null,
      phenotype: String(phenotype),
      zygosity: zygosity || 'unknown',
      source: source || 'lab',
      recordedBy: recordedBy || null,
      recordedAt: new Date().toISOString()
    };
    byKey[k] = record;
    const ik = indexKey(tenantId, patientId);
    if (!byPatient[ik]) byPatient[ik] = Object.create(null);
    byPatient[ik][record.gene] = true;
    return { ok: true, record: record };
  }

  function get({ tenantId, patientId, gene }) {
    if (!tenantId || !patientId || !gene) return null;
    return byKey[key(tenantId, patientId, gene)] || null;
  }

  function listForPatient({ tenantId, patientId }) {
    if (!tenantId || !patientId) return [];
    const ik = indexKey(tenantId, patientId);
    const genes = byPatient[ik];
    if (!genes) return [];
    const out = [];
    for (const g of Object.keys(genes)) {
      const rec = byKey[key(tenantId, patientId, g)];
      if (rec) out.push(rec);
    }
    return out;
  }

  function remove({ tenantId, patientId, gene }) {
    if (!tenantId || !patientId || !gene) return { ok: false, error: 'MISSING_KEY' };
    const k = key(tenantId, patientId, gene);
    if (!byKey[k]) return { ok: false, error: 'NOT_FOUND' };
    delete byKey[k];
    const ik = indexKey(tenantId, patientId);
    if (byPatient[ik]) {
      delete byPatient[ik][String(gene).toUpperCase()];
    }
    return { ok: true };
  }

  function clear() {
    for (const k of Object.keys(byKey)) delete byKey[k];
    for (const k of Object.keys(byPatient)) delete byPatient[k];
  }

  function size() {
    return Object.keys(byKey).length;
  }

  return {
    add: add,
    get: get,
    listForPatient: listForPatient,
    remove: remove,
    clear: clear,
    size: size
  };
}

module.exports = { newGenomicStore };
