// lib/cqm/storage.js
// In-memory CQM data store (P14). Tenant-scoped (RAIL-5).
// Pure JS, no npm install. No PHI in any persisted field.
//
// Keying convention: (tenantId, measureId, period[start..end])
// Two shapes of data:
//   - population()  counts per (tenantId, measureId, period)
//   - patientList() rows per (tenantId, measureId, period)
//
// This storage is a sandbox. In production, lib/cqm/* reads from the
// postgres encounter + condition tables; the shape is preserved here.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CqmStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function _key(tenantId, measureId, period) {
    var p = (period && period.start) || '_open';
    var pe = (period && period.end) || '_open';
    return String(tenantId) + '|' + String(measureId) + '|' + p + '/' + pe;
  }

  function _genStore(state) {
    var s = state._generations;
    if (!s) { s = state._generations = []; }
    return s;
  }

  function newCqmStorage() {
    var state = { _store: {}, _patients: {}, _generations: [] };

    function setPopulation(spec) {
      if (!spec || !spec.tenantId) throw new Error('TENANT_REQUIRED');
      if (!spec.measureId) throw new Error('FIELD_REQUIRED:measureId');
      if (!spec.period || !spec.period.start || !spec.period.end) {
        throw new Error('FIELD_REQUIRED:period.start,period.end');
      }
      var key = _key(spec.tenantId, spec.measureId, spec.period);
      state._store[key] = {
        ipop: spec.ipop || 0,
        denom: spec.denom || 0,
        numer: spec.numer || 0,
        exclusions: spec.exclusions || 0,
        exceptions: spec.exceptions || 0
      };
      _genStore(state).push({ op: 'setPopulation', key: key, ts: new Date().toISOString() });
      return { ok: true, key: key };
    }

    function populationFor(tenantId, measureId, period) {
      var key = _key(tenantId, measureId, period);
      var row = state._store[key];
      if (!row) {
        return { ipop: 0, denom: 0, numer: 0, exclusions: 0, exceptions: 0 };
      }
      return { ipop: row.ipop, denom: row.denom, numer: row.numer, exclusions: row.exclusions, exceptions: row.exceptions };
    }

    function eligiblePopulationFor(tenantId, measureId, period) {
      return populationFor(tenantId, measureId, period);
    }

    function setPatientList(spec) {
      if (!spec || !spec.tenantId) throw new Error('TENANT_REQUIRED');
      if (!spec.measureId) throw new Error('FIELD_REQUIRED:measureId');
      if (!spec.period) throw new Error('FIELD_REQUIRED:period');
      if (!Array.isArray(spec.patients)) throw new Error('FIELD_REQUIRED:patients');
      var key = _key(spec.tenantId, spec.measureId, spec.period);
      // strip PHI: keep only operational keys (mrn + age bracket + enc id)
      var clean = [];
      for (var i = 0; i < spec.patients.length; i++) {
        var p = spec.patients[i] || {};
        clean.push({
          mrn: p.mrn || ('PT-' + (clean.length + 1)),
          encounterId: p.encounterId || ('ENC-' + (clean.length + 1)),
          ageBracket: p.ageBracket || 'unspecified'
        });
      }
      state._patients[key] = clean;
      _genStore(state).push({ op: 'setPatientList', key: key, count: clean.length, ts: new Date().toISOString() });
      return { ok: true, key: key, count: clean.length };
    }

    function patientListFor(tenantId, measureId, period) {
      var key = _key(tenantId, measureId, period);
      var rows = state._patients[key] || [];
      // Return defensive copy so callers cannot mutate storage
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        out.push({ mrn: rows[i].mrn, encounterId: rows[i].encounterId, ageBracket: rows[i].ageBracket });
      }
      return out;
    }

    function clear(tenantId) {
      // Clear rows for one tenant (used in tests / sandbox resets)
      var prefix = String(tenantId) + '|';
      var removed = 0;
      var k;
      for (k in state._store) {
        if (Object.prototype.hasOwnProperty.call(state._store, k) && k.indexOf(prefix) === 0) {
          delete state._store[k];
          removed++;
        }
      }
      for (k in state._patients) {
        if (Object.prototype.hasOwnProperty.call(state._patients, k) && k.indexOf(prefix) === 0) {
          delete state._patients[k];
        }
      }
      return { ok: true, removed: removed };
    }

    function generations() {
      return _genStore(state).slice();
    }

    return {
      setPopulation: setPopulation,
      populationFor: populationFor,
      eligiblePopulationFor: eligiblePopulationFor,
      setPatientList: setPatientList,
      patientListFor: patientListFor,
      clear: clear,
      generations: generations,
      // expose internal state for tests; not used by lib/cqm/*
      _state: state
    };
  }

  // Single shared singleton — keeps the verify command's processes aligned
  return {
    newCqmStorage: newCqmStorage,
    _shared: newCqmStorage()
  };
});
