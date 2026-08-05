'use strict';
// FHIR R4 Bridge — token-saver wrapper for NPHIES + HAPI FHIR servers.
// 5 verbs · 4 converters · NPHIES Bundle support.

const FhirBridge = (() => {
  function toFhirDate(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const Converters = {
    patient(row, lang = 'ar-SA') {
      if (!row) return null;
      return {
        resourceType: 'Patient',
        id: row.id || row.mrn,
        identifier: [
          { system: 'http://nphies.sa/identifier/nationalid', value: row.national_id || '' },
          { system: 'http://nphies.sa/identifier/mrn', value: row.mrn || row.id },
        ],
        active: true,
        name: [{ use: 'official', text: row.name || '', family: (row.name || '').split(' ').slice(-1)[0] }],
        gender: row.sex || row.gender || 'unknown',
        birthDate: row.dob || row.birthDate || null,
        communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: lang }] } }],
      };
    },
    observation(row) {
      if (!row) return null;
      return {
        resourceType: 'Observation',
        id: row.id,
        status: row.status || 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: row.category || 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: row.loinc || row.code || '', display: row.name || '' }] },
        subject: { reference: 'Patient/' + (row.patient_id || row.patientId) },
        effectiveDateTime: toFhirDate(row.ts || row.effectiveDateTime),
        valueQuantity: row.value !== undefined ? {
          value: Number(row.value),
          unit: row.unit || '',
          system: 'http://unitsofmeasure.org',
          code: row.ucum || row.unit || '',
        } : undefined,
      };
    },
    medicationRequest(row) {
      if (!row) return null;
      return {
        resourceType: 'MedicationRequest',
        id: row.id,
        status: row.status || 'active',
        intent: 'order',
        medicationCodeableConcept: { coding: [{ system: row.system || 'http://www.nlm.nih.gov/research/umls/rxnorm', code: row.code || '', display: row.name || '' }] },
        subject: { reference: 'Patient/' + (row.patient_id || row.patientId) },
        authoredOn: toFhirDate(row.authoredOn || row.ts),
        requester: { reference: 'Practitioner/' + (row.requester_id || row.doctorId) },
        dosageInstruction: [{
          text: row.dose || row.directions || '',
          route: { coding: [{ code: row.route || 'PO' }] },
          doseAndRate: row.dose_mg ? [{ doseQuantity: { value: row.dose_mg, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }] : undefined,
        }],
      };
    },
    encounter(row) {
      if (!row) return null;
      return {
        resourceType: 'Encounter',
        id: row.id,
        status: row.status || 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: row.encounter_class || 'AMB' },
        type: row.type ? [{ coding: [{ code: row.type }] }] : undefined,
        subject: { reference: 'Patient/' + (row.patient_id || row.patientId) },
        period: { start: toFhirDate(row.start || row.period_start), end: toFhirDate(row.end || row.period_end) },
      };
    },
  };

  function newBridge({ base, auth, resourceMap } = {}) {
    if (!base) throw new Error('FHIR_BASE_REQUIRED');
    const tenantHeaders = () => ({
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json',
      'X-Tenant-Id': (window.NAMAMEDICAL && window.NAMAMEDICAL.TENANT_ID) || (sessionStorage.getItem('tenantId') || 'demo'),
      'Authorization': auth ? `Bearer ${auth.token}` : '',
    });

    async function fetchJson(url, init = {}) {
      const res = await fetch(url, { ...init, headers: { ...tenantHeaders(), ...(init.headers || {}) }, credentials: 'same-origin' });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error('FHIR_HTTP_' + res.status + ': ' + (data.resourceType || text || 'unknown'));
      return data;
    }

    async function create(resource) {
      if (!resource || !resource.resourceType) throw new Error('FHIR_RESOURCE_REQUIRED');
      return fetchJson(`${base}/${resource.resourceType}`, { method: 'POST', body: JSON.stringify(resource) });
    }

    async function read(type, id) {
      if (!type || !id) throw new Error('FHIR_TYPE_AND_ID_REQUIRED');
      return fetchJson(`${base}/${type}/${encodeURIComponent(id)}`);
    }

    async function search(type, params = {}) {
      if (!type) throw new Error('FHIR_TYPE_REQUIRED');
      const qs = new URLSearchParams(params).toString();
      return fetchJson(`${base}/${type}${qs ? '?' + qs : ''}`);
    }

    async function update(resource) {
      if (!resource || !resource.resourceType || !resource.id) throw new Error('FHIR_UPDATE_REQUIRES_ID');
      return fetchJson(`${base}/${resource.resourceType}/${encodeURIComponent(resource.id)}`, { method: 'PUT', body: JSON.stringify(resource) });
    }

    async function transaction(bundle) {
      if (!bundle || bundle.resourceType !== 'Bundle') throw new Error('FHIR_BUNDLE_REQUIRED');
      return fetchJson(base, { method: 'POST', body: JSON.stringify(bundle) });
    }

    // Helper: build a transaction bundle from a list of resources
    function buildTransacionBundle(resources, verb = 'POST') {
      return {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: resources.map((r) => ({
          request: { method: verb, url: r.resourceType + (verb !== 'POST' ? '/' + r.id : '') },
          resource: r,
        })),
      };
    }

    return { create, read, search, update, transaction, buildTransacionBundle, converters: Converters, base };
  }

  window.FhirBridge = { new: newBridge, converters: Converters };
  return { new: newBridge, converters: Converters };
})();