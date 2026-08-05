'use strict';
// lib/trials/storage.js
// In-memory store for clinical trial protocols, enrolments, outcomes,
// and consent records. Keyed by (tenantId, protocolId) to enforce
// tenant isolation at the storage layer (defence-in-depth alongside
// route middleware). Pure JS; no npm install. Process-local only;
// production deployments may swap with a persistence adapter that
// honours the same interface (`get`, `set`, `list`, `delete`).

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  function _key(tenantId, id) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!id) throw new Error('ID_REQUIRED');
    return tenantId + '::' + String(id);
  }

  // Buckets -----------------------------------------------------------------
  // protocols:   { tenantId, protocolId, status, version, ...meta }
  // enrolments:  { tenantId, protocolId, patientId, screeningId, ...meta }
  // outcomes:    { tenantId, protocolId, patientId, outcome, ...meta }
  // randomizations: { tenantId, protocolId, patientId, arm, block, seq }
  // amendments:  { tenantId, protocolId, version, changes, reason, actorId, prevHash, hash }

  const buckets = {
    protocols: new Map(),
    enrolments: new Map(),
    outcomes: new Map(),
    randomizations: new Map(),
    amendments: new Map(),
    blocks: new Map() // tenantId::protocolId -> { blockSeq, arms[][], usedCount }
  };

  function newTrialsStorage() {
    return {
      _raw: buckets,
      putProtocol(rec) {
        if (!rec || !rec.tenantId || !rec.protocolId) {
          throw new Error('RECORD_INVALID');
        }
        buckets.protocols.set(_key(rec.tenantId, rec.protocolId), Object.assign({}, rec));
      },
      getProtocol(tenantId, protocolId) {
        const k = _key(tenantId, protocolId);
        const v = buckets.protocols.get(k);
        return v ? Object.assign({}, v) : null;
      },
      listProtocols(tenantId, filter) {
        filter = filter || {};
        const out = [];
        buckets.protocols.forEach(function (v, k) {
          if (k.indexOf(tenantId + '::') !== 0) return;
          if (filter.status && v.status !== filter.status) return;
          if (filter.phase && v.phase !== filter.phase) return;
          if (filter.sponsor && v.sponsor !== filter.sponsor) return;
          out.push(Object.assign({}, v));
        });
        return out;
      },

      putEnrollment(rec) {
        if (!rec || !rec.tenantId || !rec.protocolId || !rec.patientId) {
          throw new Error('RECORD_INVALID');
        }
        const k = _key(rec.tenantId, rec.protocolId + '/' + rec.patientId);
        buckets.enrolments.set(k, Object.assign({}, rec));
      },
      getEnrollment(tenantId, protocolId, patientId) {
        const v = buckets.enrolments.get(_key(tenantId, protocolId + '/' + patientId));
        return v ? Object.assign({}, v) : null;
      },
      listEnrollments(tenantId, protocolId) {
        const out = [];
        const prefix = _key(tenantId, protocolId + '/');
        buckets.enrolments.forEach(function (v, k) {
          if (k.indexOf(prefix) === 0) out.push(Object.assign({}, v));
        });
        return out;
      },

      putOutcome(rec) {
        if (!rec || !rec.tenantId || !rec.protocolId || !rec.patientId) {
          throw new Error('RECORD_INVALID');
        }
        const k = _key(rec.tenantId, protocolIdAndPatient(rec) + '/' + rec.outcomeId);
        buckets.outcomes.set(k, Object.assign({}, rec));
      },
      getOutcome(tenantId, protocolId, outcomeId) {
        const v = buckets.outcomes.get(_key(tenantId, protocolId + '/' + outcomeId));
        return v ? Object.assign({}, v) : null;
      },
      listOutcomes(tenantId, protocolId) {
        const out = [];
        const prefix = protocolId + '/';
        buckets.outcomes.forEach(function (v, k) {
          if (k.indexOf(tenantId + '::') !== 0) return;
          if (k.indexOf(prefix) === -1) return;
          out.push(Object.assign({}, v));
        });
        return out;
      },

      putRandomization(rec) {
        if (!rec || !rec.tenantId || !rec.protocolId || !rec.patientId) {
          throw new Error('RECORD_INVALID');
        }
        const k = _key(rec.tenantId, rec.protocolId + '/' + rec.patientId);
        buckets.randomizations.set(k, Object.assign({}, rec));
      },
      getRandomization(tenantId, protocolId, patientId) {
        const v = buckets.randomizations.get(_key(tenantId, protocolId + '/' + patientId));
        return v ? Object.assign({}, v) : null;
      },

      putAmendment(rec) {
        if (!rec || !rec.tenantId || !rec.protocolId) {
          throw new Error('RECORD_INVALID');
        }
        const key = _key(rec.tenantId, rec.protocolId);
        const list = buckets.amendments.get(key) || [];
        list.push(Object.assign({}, rec));
        buckets.amendments.set(key, list);
      },
      listAmendments(tenantId, protocolId) {
        const v = buckets.amendments.get(_key(tenantId, protocolId));
        return v ? v.slice() : [];
      },

      getBlock(tenantId, protocolId) {
        const k = _key(tenantId, protocolId);
        return buckets.blocks.get(k) || null;
      },
      putBlock(tenantId, protocolId, state) {
        buckets.blocks.set(_key(tenantId, protocolId), Object.assign({}, state));
      },

      // ---- low-level reset (NOT exposed via route layer) ----
      _reset(tenantId) {
        if (!tenantId) throw new Error('TENANT_REQUIRED');
        const prefix = tenantId + '::';
        ['protocols', 'enrolments', 'outcomes', 'randomizations', 'amendments', 'blocks']
          .forEach(function (b) {
            buckets[b].forEach(function (_v, k) {
              if (k.indexOf(prefix) === 0) buckets[b].delete(k);
            });
          });
      }
    };
  }

  function protocolIdAndPatient(rec) {
    return rec.protocolId + '/' + rec.patientId;
  }

  module.exports = { newTrialsStorage };
})();
