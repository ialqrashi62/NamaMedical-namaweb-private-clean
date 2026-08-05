// lib/cqm/measures.js
// CMS eCQM measure catalog (P14 starter set).
// Pure JS, no npm install. Tenant-scoped (RAIL-5), no PHI (RAIL-12).
//
// Exports:
//   MEASURES         - { measureId: { id, title, domain, valueSet, ... } }
//   listMeasures({tenantId, domain})
//   getMeasure(measureId)
//   valueSets(measureId) -> { measureId, valueSet, codes } (placeholder OIDs)
//   eligiblePopulation({tenantId, measureId, period}) -> { ipop, denom }

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CqmMeasures = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // CMS eCQM starter catalog. Five measures covering VTE, Immunization,
  // ED throughput, Diabetes A1c, and Hypertension. valueSets are OID
  // placeholders referenced from VSAC; tenant-scoped catalogs live in
  // lib/cqm/storage.js for runtime overrides.
  var MEASURES = Object.freeze({
    CMS108: {
      id: 'CMS108',
      title: 'Venous Thromboembolism Prophylaxis',
      domain: 'VTE',
      valueSet: 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1085',
      steward: 'The Joint Commission',
      type: 'process',
      period: '2026-01-01/2026-12-31'
    },
    CMS110: {
      id: 'CMS110',
      title: 'Influenza Immunization',
      domain: 'Immunization',
      valueSet: 'urn:oid:2.16.840.1.113883.3.464.1003.110.12.1039',
      steward: 'CDC/NQF',
      type: 'process',
      period: '2026-01-01/2026-12-31'
    },
    CMS111: {
      id: 'CMS111',
      title: 'Median Time from ED Arrival to ED Departure for Admitted ED Patients',
      domain: 'ED',
      valueSet: 'urn:oid:2.16.840.1.113883.3.464.1003.108.12.1040',
      steward: 'CMS',
      type: 'intermediate-outcome',
      period: '2026-01-01/2026-12-31'
    },
    CMS122: {
      id: 'CMS122',
      title: 'Diabetes: Hemoglobin A1c Poor Control',
      domain: 'Diabetes',
      valueSet: 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1073',
      steward: 'NCQA',
      type: 'intermediate-outcome',
      period: '2026-01-01/2026-12-31'
    },
    CMS165: {
      id: 'CMS165',
      title: 'Controlling High Blood Pressure',
      domain: 'HTN',
      valueSet: 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1075',
      steward: 'NCQA',
      type: 'intermediate-outcome',
      period: '2026-01-01/2026-12-31'
    }
  });

  function _measureOrThrow(measureId) {
    var m = MEASURES[measureId];
    if (!m) {
      var known = Object.keys(MEASURES).join(', ');
      throw new Error('UNKNOWN_MEASURE:' + measureId + ' (known: ' + known + ')');
    }
    return m;
  }

  // Public: listMeasures({tenantId, domain})
  // - tenantId is required (RAIL-5)
  // - optional domain filters by measure domain (case-insensitive)
  function listMeasures(spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    var filter = spec.domain ? String(spec.domain).toLowerCase() : '';
    var out = [];
    var ids = Object.keys(MEASURES);
    for (var i = 0; i < ids.length; i++) {
      var m = MEASURES[ids[i]];
      if (filter && String(m.domain).toLowerCase() !== filter) continue;
      out.push({
        id: m.id,
        title: m.title,
        domain: m.domain,
        steward: m.steward,
        type: m.type,
        period: m.period
      });
    }
    return { ok: true, count: out.length, measures: out };
  }

  function getMeasure(measureId) {
    var m = _measureOrThrow(measureId);
    return {
      id: m.id,
      title: m.title,
      domain: m.domain,
      steward: m.steward,
      type: m.type,
      period: m.period,
      valueSet: m.valueSet
    };
  }

  // valueSets returns the canonical OID plus a placeholder code list.
  // In production, lib/cqm/storage.js overlays tenant-specific value sets.
  function valueSets(measureId) {
    var m = _measureOrThrow(measureId);
    return {
      ok: true,
      measureId: m.id,
      title: m.title,
      valueSet: m.valueSet,
      codes: [],
      note: 'value-set codes available via VSAC; placeholder returned in sandbox.'
    };
  }

  // eligiblePopulation returns the Initial Population counts for the period.
  // Real population runs aggregate from encounter + condition tables.
  // For sandbox runs, counts come from tenant-scoped storage.
  function eligiblePopulation(spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.measureId) throw new Error('FIELD_REQUIRED:measureId');
    if (!spec.period) throw new Error('FIELD_REQUIRED:period');
    var m = _measureOrThrow(spec.measureId);
    var storage;
    try {
      storage = require('./storage');
    } catch (_e) {
      storage = null;
    }
    var counts = { ipop: 0, denom: 0, numer: 0, exclusions: 0, exceptions: 0 };
    if (storage && typeof storage.eligiblePopulationFor === 'function') {
      counts = storage.eligiblePopulationFor(spec.tenantId, m.id, spec.period) || counts;
    }
    return {
      ok: true,
      measureId: m.id,
      tenantId: spec.tenantId,
      period: spec.period,
      ipop: counts.ipop || 0,
      denom: counts.denom || 0,
      numer: counts.numer || 0,
      exclusions: counts.exclusions || 0,
      exceptions: counts.exceptions || 0
    };
  }

  return {
    MEASURES: MEASURES,
    listMeasures: listMeasures,
    getMeasure: getMeasure,
    valueSets: valueSets,
    eligiblePopulation: eligiblePopulation
  };
});
