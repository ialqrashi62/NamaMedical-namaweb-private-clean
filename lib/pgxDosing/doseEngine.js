// lib/pgxDosing/doseEngine.js
// DoseEngine — orchestrates lookup → phenotype classification →
// dose recommendation → audit-hash. Pure JS, no npm install.
// Tenant-scoped (RAIL-5). Fail-closed (RAIL-11). Hash-chained audit
// (RAIL-10). No PHI in logs (RAIL-12).
//
// Public API:
//   const de = new DoseEngine();
//   de.recommend({ tenantId, patientId, drug, variant, actorId })
//      → { ok, drug, gene, phenotype, dose, altDrug, evidence,
//          guidelineRef, auditHash, recordedAt }
//   de.history({ tenantId, patientId })
//      → [ { drug, gene, phenotype, dose, altDrug, auditHash, recordedAt } ]
//   de.alerts({ tenantId, drug, patientId? })
//      → CDSS-style alert payload(s)
//
// Storage: in-process map keyed by (tenantId, patientId, drug). In
// production the same interface is implemented against Postgres with
// RLS enabled; the route layer never touches the store directly.

'use strict';

const crypto = require('crypto');
const Pairings = require('./pairings');
const Variants = require('./variants');

function _nowIso() { return new Date().toISOString(); }

function _hash(parts) {
  // Deterministic hash over the structured recommendation payload.
  // RAIL-10: audit chain. We hash on tenant|patient|drug|gene|dose|ts
  // so the chain is order-independent but tamper-evident.
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(parts));
  return 'pgx_' + h.digest('hex').slice(0, 32);
}

function DoseEngine(opts) {
  opts = opts || {};
  this._store = opts.store || new DoseStore();
  this._chain = opts.chain || []; // process-wide hash chain
}

DoseEngine.prototype.recommend = function (req) {
  if (!req || typeof req !== 'object') return { ok: false, error: 'BAD_REQUEST' };
  if (!req.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
  if (!req.patientId) return { ok: false, error: 'PATIENT_REQUIRED' };
  if (!req.drug) return { ok: false, error: 'DRUG_REQUIRED' };

  // Normalize drug and resolve pairing.
  const drugKey = Pairings.lookupPairing(req.drug) ? _normDrug(req.drug) : null;
  if (!drugKey) return { ok: false, error: 'UNKNOWN_DRUG' };
  const pairing = Pairings.PAIRINGS[drugKey];

  // Resolve phenotype from `variant` (a raw call) or explicit `phenotype`.
  let phenotype = 'unknown';
  if (req.phenotype && typeof req.phenotype === 'string') {
    phenotype = _normPhenotype(req.phenotype);
  } else if (req.variant && typeof req.variant === 'object') {
    // { gene, call, rsId? } → classify
    phenotype = Variants.classify(req.variant.gene || pairing.gene, req.variant.call || req.variant.diplotype);
  } else if (req.variant && typeof req.variant === 'string') {
    phenotype = Variants.classify(pairing.gene, req.variant);
  } else if (req.haplotype && typeof req.haplotype === 'string') {
    phenotype = Pairings.matchHaplotype(pairing.gene, req.haplotype);
  }

  const rec = Pairings.recommendDose(drugKey, phenotype);
  if (!rec.ok) return rec;

  const recordedAt = _nowIso();
  const auditHash = _hash({
    tenantId: req.tenantId,
    patientId: req.patientId,
    drug: drugKey,
    gene: pairing.gene,
    phenotype: phenotype,
    dose: rec.dose,
    altDrug: rec.altDrug,
    ts: recordedAt,
    prev: this._chain.length ? this._chain[this._chain.length - 1] : null
  });

  const rec_record = {
    tenantId: req.tenantId,
    patientId: req.patientId,
    drug: drugKey,
    gene: pairing.gene,
    drugClass: pairing.drugClass,
    phenotype: phenotype,
    dose: rec.dose,
    altDrug: rec.altDrug,
    evidence: rec.evidence,
    guidelineRef: rec.guidelineRef,
    level: rec.level,
    actorId: req.actorId || null,
    auditHash: auditHash,
    recordedAt: recordedAt
  };

  // Persist + chain.
  this._store.add(rec_record);
  this._chain.push(auditHash);

  return { ok: true, recommendation: rec_record };
};

DoseEngine.prototype.history = function (req) {
  if (!req || !req.tenantId || !req.patientId) return [];
  return this._store.list(req.tenantId, req.patientId);
};

DoseEngine.prototype.alerts = function (req) {
  if (!req || !req.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
  if (!req.drug) return { ok: false, error: 'DRUG_REQUIRED' };

  const drugKey = _normDrug(req.drug);
  if (!Pairings.PAIRINGS[drugKey]) return { ok: false, error: 'UNKNOWN_DRUG' };

  // If we have a stored phenotype for the patient, use it; otherwise
  // return an alert prompting the clinician to consult a genotype.
  let phenotype = 'unknown';
  if (req.patientId) {
    const recs = this._store.list(req.tenantId, req.patientId);
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].drug === drugKey) { phenotype = recs[i].phenotype; break; }
    }
  }

  const alert = Pairings.alertForPairing(drugKey, phenotype);
  return {
    ok: true,
    tenantId: req.tenantId,
    drug: drugKey,
    patientId: req.patientId || null,
    phenotype: phenotype,
    severity: alert.severity,
    alert: alert.alert,
    message: alert.message,
    guidelineRef: alert.guidelineRef
  };
};

// ---- in-process store --------------------------------------------------

function DoseStore() {
  this._byKey = Object.create(null);
}
DoseStore.prototype._key = function (tenantId, patientId, drug) {
  return tenantId + '::' + patientId + '::' + String(drug || '').toLowerCase();
};
DoseStore.prototype.add = function (rec) {
  const k = this._key(rec.tenantId, rec.patientId, rec.drug);
  // Replace any prior recommendation for the same key (latest wins).
  this._byKey[k] = rec;
};
DoseStore.prototype.list = function (tenantId, patientId) {
  if (!tenantId || !patientId) return [];
  const prefix = tenantId + '::' + patientId + '::';
  const out = [];
  for (const k in this._byKey) {
    if (k.indexOf(prefix) === 0) out.push(this._byKey[k]);
  }
  out.sort(function (a, b) {
    return (a.recordedAt < b.recordedAt) ? -1 : (a.recordedAt > b.recordedAt ? 1 : 0);
  });
  return out;
};

// ---- helpers -----------------------------------------------------------

function _normDrug(drug) {
  if (!drug || typeof drug !== 'string') return null;
  const k = String(drug).toLowerCase().trim();
  if (Pairings.PAIRINGS[k]) return k;
  // tolerate common synonyms (mirror pairings._normKey surface)
  const syn = {
    '5-fu': 'fluorouracil', '5fu': 'fluorouracil', 'capecitabine': 'fluorouracil',
    '6-mp': 'azathioprine', '6mp': 'azathioprine', 'mercaptopurine': 'azathioprine',
    'plavix': 'clopidogrel', 'zocor': 'simvastatin',
    'camptosar': 'irinotecan', 'cpt-11': 'irinotecan',
    'ziagen': 'abacavir', 'abc': 'abacavir'
  };
  return syn[k] || k;
}

function _normPhenotype(p) {
  if (!p || typeof p !== 'string') return 'unknown';
  const x = p.toLowerCase().trim();
  if (x === 'um' || x === 'ultrarapid') return 'ultrarapid';
  if (x === 'pm' || x === 'poor') return 'poor';
  if (x === 'im' || x === 'intermediate') return 'intermediate';
  if (x === 'nm' || x === 'normal' || x === 'extensive') return 'normal';
  if (x === 'positive' || x === 'carrier') return 'positive';
  return 'unknown';
}

module.exports = DoseEngine;
module.exports.DoseStore = DoseStore;
