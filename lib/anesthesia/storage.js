// lib/anesthesia/storage.js
// In-memory case + vital + audit storage for the Anesthesia Monitor
// Integration (P15). Pure JS, no npm install. Tenant-scoped (RAIL-5),
// no PHI in any persisted field beyond operational mrns (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnesthesiaStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function newAnesthesiaStorage() {
    var state = { _cases: {}, _lastHash: null };

    function createCase(c) {
      if (!c || !c.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
      if (state._cases[c.caseId]) return { ok: false, error: 'DUPLICATE_CASE' };
      state._cases[c.caseId] = {
        caseId: c.caseId,
        tenantId: c.tenantId,
        patientId: c.patientId,
        surgeonId: c.surgeonId,
        anesthesiaType: c.anesthesiaType,
        agent: c.agent,
        status: c.status || 'active',
        startTs: c.startTs,
        endTs: c.endTs || null,
        outcome: c.outcome || null,
        preop: c.preop || null,
        events: c.events || [],
        vitals: c.vitals || [],
        audit: c.audit || []
      };
      return { ok: true, caseId: c.caseId };
    }

    function appendVital(caseId, entry) {
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      if (c.status !== 'active') return { ok: false, error: 'CASE_FINALIZED' };
      c.vitals.push({ ts: entry.ts, code: entry.code, value: entry.value, unit: entry.unit });
      return { ok: true, caseId: caseId };
    }

    function appendEvent(caseId, entry) {
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      if (c.status !== 'active') return { ok: false, error: 'CASE_FINALIZED' };
      c.events.push({ ts: entry.ts, type: entry.type, note: entry.note || null });
      return { ok: true, caseId: caseId };
    }

    function appendAudit(caseId, record) {
      var c = state._cases[caseId];
      if (c) c.audit.push(record);
      state._lastHash = record.hash || state._lastHash;
      return { ok: true, caseId: caseId };
    }

    function closeCase(caseId, payload) {
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      c.endTs = payload.endTs;
      c.outcome = payload.outcome || c.outcome;
      c.status = 'closed';
      return { ok: true, caseId: caseId };
    }

    function getCase(caseId) {
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      // Return defensive copies
      return {
        ok: true,
        case: {
          caseId: c.caseId,
          tenantId: c.tenantId,
          patientId: c.patientId,
          surgeonId: c.surgeonId,
          anesthesiaType: c.anesthesiaType,
          agent: c.agent,
          status: c.status,
          startTs: c.startTs,
          endTs: c.endTs,
          outcome: c.outcome,
          preop: c.preop ? Object.assign({}, c.preop) : null,
          events: c.events.slice(),
          vitals: c.vitals.slice(),
          audit: c.audit.slice()
        }
      };
    }

    function listCases(spec) {
      spec = spec || {};
      var out = [];
      for (var k in state._cases) {
        if (!Object.prototype.hasOwnProperty.call(state._cases, k)) continue;
        var row = state._cases[k];
        if (spec.tenantId && row.tenantId !== spec.tenantId) continue;
        out.push({ caseId: row.caseId, status: row.status, startTs: row.startTs, endTs: row.endTs });
      }
      return { ok: true, count: out.length, cases: out };
    }

    function clear(tenantId) {
      var removed = 0;
      for (var k in state._cases) {
        if (!Object.prototype.hasOwnProperty.call(state._cases, k)) continue;
        if (tenantId && state._cases[k].tenantId !== tenantId) continue;
        delete state._cases[k];
        removed++;
      }
      return { ok: true, removed: removed };
    }

    function lastHash(caseId) {
      if (caseId && state._cases[caseId]) {
        var c = state._cases[caseId];
        if (c.audit && c.audit.length) return c.audit[c.audit.length - 1].hash;
      }
      return state._lastHash;
    }

    return {
      createCase: createCase,
      appendVital: appendVital,
      appendEvent: appendEvent,
      appendAudit: appendAudit,
      closeCase: closeCase,
      getCase: getCase,
      listCases: listCases,
      clear: clear,
      lastHash: lastHash,
      _state: state
    };
  }

  return { newAnesthesiaStorage: newAnesthesiaStorage };
});
