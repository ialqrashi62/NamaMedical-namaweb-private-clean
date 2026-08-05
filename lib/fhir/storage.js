'use strict';
// lib/fhir/storage.js
// In-memory FHIR R4 storage adapter (sandbox-safe; no PHI; no DB).
// 5 dummy patients per tenant seed by default. Pure JS, no npm install.
// Tenant isolation enforced at the store-key level — rows are never returned
// across tenants. RAIL-5 compliant (fail-closed on missing tenantId).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FhirStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Internal tenant-keyed maps per resource type.
  // Each value is a Map<id, resource> nested under tenant.
  // Outer: { Patient: Map<tenantId, Map<id, row>> }
  const _stores = {
    Patient: new Map(),
    Observation: new Map(),
    MedicationRequest: new Map(),
    Condition: new Map(),
    AllergyIntolerance: new Map(),
    DiagnosticReport: new Map(),
  };

  function _bucket(type, tenantId) {
    if (!_stores[type]) _stores[type] = new Map();
    let b = _stores[type].get(tenantId);
    if (!b) {
      b = new Map();
      _stores[type].set(tenantId, b);
    }
    return b;
  }

  function _ensureTenant(type, tenantId) {
    if (!type) throw new Error('FHIR_TYPE_REQUIRED');
    if (!tenantId) throw new Error('FHIR_TENANT_REQUIRED');
    if (!_stores[type]) _stores[type] = new Map();
    return true;
  }

  function _rowForPatient(tenantId, n) {
    // NO PHI. Dummy labels only.
    const label = 'Patient ' + String.fromCharCode(64 + n); // A, B, C, D, E
    return {
      resourceType: 'Patient',
      id: tenantId + '-' + n,
      _tenant: tenantId,
      identifier: [
        { system: 'http://nphies.sa/identifier/mrn', value: 'MRN-' + tenantId + '-' + n },
        { system: 'http://nphies.sa/identifier/nationalid', value: 'NID-' + tenantId + '-' + (1000000 + n) },
      ],
      active: true,
      name: [{ use: 'official', text: label, family: 'Family' + n }],
      gender: n % 2 === 0 ? 'male' : 'female',
      birthDate: '1990-0' + ((n % 9) + 1) + '-15',
    };
  }

  function _seedObservations(tenantId, patientId) {
    return [
      {
        resourceType: 'Observation',
        id: patientId + '-obs-hr',
        _tenant: tenantId,
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
        subject: { reference: 'Patient/' + patientId },
        effectiveDateTime: new Date(Date.now() - 3600000).toISOString(),
        valueQuantity: { value: 72 + (patientId.length % 7), unit: 'bpm', system: 'http://unitsofmeasure.org', code: '/min' },
      },
      {
        resourceType: 'Observation',
        id: patientId + '-obs-spo2',
        _tenant: tenantId,
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '2708-6', display: 'Oxygen saturation' }] },
        subject: { reference: 'Patient/' + patientId },
        effectiveDateTime: new Date(Date.now() - 3000000).toISOString(),
        valueQuantity: { value: 98, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
      },
    ];
  }

  function _seedMedicationRequests(tenantId, patientId) {
    return [
      {
        resourceType: 'MedicationRequest',
        id: patientId + '-med-1',
        _tenant: tenantId,
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '197361', display: 'Sample Medication ' + patientId }] },
        subject: { reference: 'Patient/' + patientId },
        authoredOn: new Date().toISOString(),
        requester: { reference: 'Practitioner/pract-' + tenantId },
        dosageInstruction: [{
          text: 'Take 1 tablet by mouth daily',
          route: { coding: [{ code: 'PO' }] },
          doseAndRate: [{ doseQuantity: { value: 5, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }],
        }],
      },
    ];
  }

  function _seedConditions(tenantId, patientId) {
    return [
      {
        resourceType: 'Condition',
        id: patientId + '-cond-1',
        _tenant: tenantId,
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
        verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] }],
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'Z00.00', display: 'Sample diagnosis (sandbox)' }] },
        subject: { reference: 'Patient/' + patientId },
        recordedDate: new Date().toISOString(),
      },
    ];
  }

  function _seedAllergies(tenantId, patientId) {
    return [
      {
        resourceType: 'AllergyIntolerance',
        id: patientId + '-allergy-1',
        _tenant: tenantId,
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
        verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }] },
        type: 'allergy',
        category: ['food'],
        criticality: 'low',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '764146007', display: 'Sample allergen (sandbox)' }] },
        patient: { reference: 'Patient/' + patientId },
        recordedDate: new Date().toISOString(),
      },
    ];
  }

  function _seedReports(tenantId, patientId) {
    return [
      {
        resourceType: 'DiagnosticReport',
        id: patientId + '-rep-1',
        _tenant: tenantId,
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/diagnostic-service-sections', code: 'LAB' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '24323-8', display: 'Sample lab report (sandbox)' }] },
        subject: { reference: 'Patient/' + patientId },
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
      },
    ];
  }

  function _stripMeta(row) {
    if (!row) return null;
    const out = Object.assign({}, row);
    delete out._tenant;
    return out;
  }

  // --- Public API: per-resource facade ---
  function _makeFacade(type) {
    return {
      seed(tenantId) {
        _ensureTenant(type, tenantId);
        const bucket = _bucket(type, tenantId);
        bucket.clear();
        if (type === 'Patient') {
          for (let n = 1; n <= 5; n++) {
            const p = _rowForPatient(tenantId, n);
            bucket.set(p.id, p);
            // Seed related resources for each dummy patient.
            const obs = _seedObservations(tenantId, p.id);
            obs.forEach((r) => _bucket('Observation', tenantId).set(r.id, r));
            const meds = _seedMedicationRequests(tenantId, p.id);
            meds.forEach((r) => _bucket('MedicationRequest', tenantId).set(r.id, r));
            const conds = _seedConditions(tenantId, p.id);
            conds.forEach((r) => _bucket('Condition', tenantId).set(r.id, r));
            const alls = _seedAllergies(tenantId, p.id);
            alls.forEach((r) => _bucket('AllergyIntolerance', tenantId).set(r.id, r));
            const reps = _seedReports(tenantId, p.id);
            reps.forEach((r) => _bucket('DiagnosticReport', tenantId).set(r.id, r));
          }
        }
        return bucket.size;
      },
      findById(tenantId, id) {
        _ensureTenant(type, tenantId);
        if (!id) return null;
        const row = _bucket(type, tenantId).get(String(id));
        if (!row) return null;
        if (row._tenant !== tenantId) return null; // defense-in-depth
        return _stripMeta(row);
      },
      search(tenantId, params) {
        _ensureTenant(type, tenantId);
        const p = params || {};
        const all = Array.from(_bucket(type, tenantId).values()).filter((r) => r._tenant === tenantId);

        // Patient-specific search: name (substring, case-insensitive) and mrn (exact).
        if (type === 'Patient') {
          let out = all;
          if (p.name) {
            const needle = String(p.name).toLowerCase();
            out = out.filter((r) => {
              if (!r.name || !Array.isArray(r.name)) return false;
              for (let i = 0; i < r.name.length; i++) {
                const txt = (r.name[i].text || '').toLowerCase();
                const fam = (r.name[i].family || '').toLowerCase();
                if (txt.indexOf(needle) !== -1 || fam.indexOf(needle) !== -1) return true;
              }
              return false;
            });
          }
          if (p.mrn) {
            const mrn = String(p.mrn);
            out = out.filter((r) => {
              if (!Array.isArray(r.identifier)) return false;
              for (let i = 0; i < r.identifier.length; i++) {
                if (r.identifier[i].value === mrn) return true;
              }
              return false;
            });
          }
          if (p._id) out = out.filter((r) => r.id === String(p._id));
          return out.map(_stripMeta);
        }

        // For clinical resources: filter by patient reference if provided.
        const ref = p.patient ? 'Patient/' + String(p.patient) : null;
        let out = all;
        if (ref) {
          out = out.filter((r) => {
            if (type === 'Observation' || type === 'DiagnosticReport') {
              return r.subject && r.subject.reference === ref;
            }
            if (type === 'MedicationRequest' || type === 'Condition') {
              return r.subject && r.subject.reference === ref;
            }
            if (type === 'AllergyIntolerance') {
              return r.patient && r.patient.reference === ref;
            }
            return true;
          });
        }
        if (p._id) out = out.filter((r) => r.id === String(p._id));
        if (p.status) {
          const st = String(p.status);
          out = out.filter((r) => r.status === st);
        }
        return out.map(_stripMeta);
      },
      insert(tenantId, row) {
        _ensureTenant(type, tenantId);
        if (!row || row.resourceType !== type) throw new Error('FHIR_TYPE_MISMATCH');
        row._tenant = tenantId;
        if (!row.id) row.id = type.toLowerCase() + '-' + Math.random().toString(36).slice(2, 10);
        _bucket(type, tenantId).set(row.id, row);
        return _stripMeta(row);
      },
      all(tenantId) {
        _ensureTenant(type, tenantId);
        return Array.from(_bucket(type, tenantId).values()).map(_stripMeta);
      },
      reset(tenantId) {
        if (!_stores[type]) return 0;
        if (!tenantId) {
          const n = _stores[type].size;
          _stores[type].clear();
          return n;
        }
        const b = _stores[type].get(tenantId);
        if (!b) return 0;
        const n = b.size;
        b.clear();
        return n;
      },
    };
  }

  return {
    Patient: _makeFacade('Patient'),
    Observation: _makeFacade('Observation'),
    MedicationRequest: _makeFacade('MedicationRequest'),
    Condition: _makeFacade('Condition'),
    AllergyIntolerance: _makeFacade('AllergyIntolerance'),
    DiagnosticReport: _makeFacade('DiagnosticReport'),
    _internal: _stores,
  };
});
