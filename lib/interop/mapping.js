// lib/interop/mapping.js
// Resource mapping between NamaMedical internal resources and
// Epic / CommonWell / Care Everywhere.
//
// Conventions:
//   - EPIC uses FHIR R4 with custom Coding systems and USCDI v2.
//   - CommonWell uses PIX / PDQm + DocumentReference for summary.
//   - Care Everywhere (Epic's XCA) uses IHE XCA / XDS.b-style manifests.
//
// All mapping functions are PURE: they accept a normalised internal
// resource and return the equivalent FHIR R4 resource. They NEVER
// log or print PHI (RAIL-12).
//
// Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InteropMapping = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var NAMA_SYSTEM  = 'urn:nama:medical:id';
  var EPIC_SYSTEM  = 'urn:epic:cerner:ehr-id';
  var COMMONWELL   = 'urn:commonwell:patient-id';
  var MRN_SYSTEM   = 'http://terminology.hl7.org/CodeSystem/v2-0203';

  function _nowIso() { return new Date().toISOString(); }

  function _safeStr(v, max) {
    if (v === undefined || v === null) return null;
    var s = String(v);
    if (typeof max === 'number' && s.length > max) s = s.slice(0, max);
    return s;
  }

  function _code(code, system, display) {
    return { coding: [{ system: system || NAMA_SYSTEM, code: String(code), display: display || '' }] };
  }

  // ---- Patient ------------------------------------------------------

  function patientToFhir(internal, opts) {
    opts = opts || {};
    var identifiers = [
      {
        system: NAMA_SYSTEM,
        value: _safeStr(internal && internal.patientId, 64)
      },
      {
        system: MRN_SYSTEM,
        type: _code('MR', 'http://terminology.hl7.org/CodeSystem/v2-0203', 'Medical Record Number'),
        value: _safeStr(internal && internal.mrn, 64)
      }
    ];
    if (opts.epicMrn) {
      identifiers.push({ system: EPIC_SYSTEM, value: _safeStr(opts.epicMrn, 64) });
    }
    if (opts.commonwellId) {
      identifiers.push({ system: COMMONWELL, value: _safeStr(opts.commonwellId, 64) });
    }

    return {
      resourceType: 'Patient',
      id: _safeStr(internal && internal.patientId, 64),
      active: internal && typeof internal.active === 'boolean' ? internal.active : true,
      identifier: identifiers,
      name: [{
        family: _safeStr(internal && internal.family, 80),
        given: Array.isArray(internal && internal.given)
          ? internal.given.map(function (n) { return _safeStr(n, 80); })
          : (_safeStr(internal && internal.given, 80) ? [_safeStr(internal.given, 80)] : [])
      }],
      gender: _safeStr(internal && internal.gender, 16) || 'unknown',
      birthDate: _safeStr(internal && internal.birthDate, 16)
    };
  }

  function patientFromFhir(fhir) {
    fhir = fhir || {};
    var identifiers = Array.isArray(fhir.identifier) ? fhir.identifier : [];
    var primary = identifiers.find(function (i) { return i && i.system === NAMA_SYSTEM; }) || {};
    var mrn = identifiers.find(function (i) { return i && i.system === MRN_SYSTEM; }) || {};
    var names = Array.isArray(fhir.name) ? fhir.name : [];
    var first = names[0] || {};
    return {
      patientId: primary.value || _safeStr(fhir.id, 64),
      mrn: mrn.value || null,
      family: _safeStr(first.family, 80),
      given: Array.isArray(first.given) ? first.given.slice() : [],
      gender: _safeStr(fhir.gender, 16),
      birthDate: _safeStr(fhir.birthDate, 16)
    };
  }

  // ---- Condition -----------------------------------------------------

  // NamaMedical's clinical event / diagnosis row → FHIR Condition
  function conditionToFhir(internal) {
    var coding = [];
    if (internal && internal.icd10) {
      coding.push({
        system: 'http://hl7.org/fhir/sid/icd-10',
        code: _safeStr(internal.icd10, 8),
        display: _safeStr(internal.icd10Display, 200) || ''
      });
    }
    if (internal && internal.snomed) {
      coding.push({
        system: 'http://snomed.info/sct',
        code: _safeStr(internal.snomed, 32),
        display: _safeStr(internal.snomedDisplay, 200) || ''
      });
    }

    // Map Nama category → FHIR Encounter.diagnosis.condition category
    // (Epic uses 'problem-list-item', 'encounter-diagnosis', 'chief-complaint')
    var fhirCategory = 'encounter-diagnosis';
    var c = (internal && internal.category || '').toLowerCase();
    if (c === 'problem' || c === 'problem-list') fhirCategory = 'problem-list-item';
    else if (c === 'chief' || c === 'chief-complaint') fhirCategory = 'chief-complaint';

    return {
      resourceType: 'Condition',
      id: _safeStr(internal && internal.eventId, 64),
      clinicalStatus: _code('active', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'Active'),
      verificationStatus: _code('confirmed', 'http://terminology.hl7.org/CodeSystem/condition-ver-status', 'Confirmed'),
      category: [_code(fhirCategory, 'http://terminology.hl7.org/CodeSystem/condition-category', fhirCategory)],
      code: { coding: coding.length ? coding : [_code(_safeStr(internal && internal.label, 80) || 'unknown')] },
      subject: { reference: 'Patient/' + _safeStr(internal && internal.patientId, 64) },
      onsetDateTime: _safeStr(internal && internal.onsetDate, 32),
      recordedDate: _safeStr(internal && internal.recordedAt, 32) || _nowIso()
    };
  }

  // ---- MedicationRequest --------------------------------------------

  // NamaMedical order row → FHIR MedicationRequest.
  // dosageInstruction encodes sig (dose+route+frequency) as
  // { text, doseAndRate, route, timing } following Epic expectations.
  function medicationRequestToFhir(internal) {
    var dose = internal && internal.dose;
    var doseQty = (typeof dose === 'number')
      ? { value: dose, unit: _safeStr(internal && internal.doseUnit, 16) || 'mg' }
      : null;

    return {
      resourceType: 'MedicationRequest',
      id: _safeStr(internal && internal.orderId, 64),
      status: _safeStr(internal && internal.status, 16) || 'active',
      intent: _safeStr(internal && internal.intent, 24) || 'order',
      medicationCodeableConcept: {
        coding: [{
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: _safeStr(internal && internal.rxnorm, 32) || _safeStr(internal && internal.code, 64) || 'unknown',
          display: _safeStr(internal && internal.label, 200) || ''
        }]
      },
      subject: { reference: 'Patient/' + _safeStr(internal && internal.patientId, 64) },
      authoredOn: _safeStr(internal && internal.authoredOn, 32) || _nowIso(),
      requester: { display: _safeStr(internal && internal.requester, 120) || '' },
      dosageInstruction: [{
        text: _safeStr(internal && internal.sig, 500) || '',
        timing: {
          repeat: {
            frequency: (typeof internal.frequency === 'number') ? internal.frequency : 1,
            period: (typeof internal.period === 'number') ? internal.period : 1,
            periodUnit: _safeStr(internal.periodUnit, 12) || 'd'
          },
          code: _code(_safeStr(internal.timingCode, 16) || 'QD', 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation')
        },
        doseAndRate: doseQty ? [{
          doseQuantity: doseQty
        }] : [],
        route: internal && internal.route
          ? _code(internal.route, 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', _safeStr(internal.routeDisplay, 80) || '')
          : undefined
      }]
    };
  }

  // ---- Observation (vitals + labs) ----------------------------------

  // valueQuantity + valueString + valueCodeableConcept — pick the right
  // shape based on type. Epic and CommonWell both honour this R4 rule.
  function observationToFhir(internal) {
    var value = internal && internal.value;
    var valueKey = internal && internal.valueKey;
    var rv = { resourceType: 'Observation', id: _safeStr(internal && internal.obsId, 64) };
    rv.status = _safeStr(internal && internal.status, 16) || 'final';
    rv.code = { coding: [{
      system: _safeStr(internal && internal.codeSystem, 200) || 'http://loinc.org',
      code: _safeStr(internal && internal.code, 32) || 'unknown',
      display: _safeStr(internal && internal.label, 200) || ''
    }] };
    if (internal && internal.patientId) {
      rv.subject = { reference: 'Patient/' + _safeStr(internal.patientId, 64) };
    }
    if (internal && internal.effectiveAt) {
      rv.effectiveDateTime = _safeStr(internal.effectiveAt, 32);
    }

    // Decide which value[x] to populate
    if (typeof value === 'number' && isFinite(value)) {
      rv.valueQuantity = {
        value: value,
        unit: _safeStr(internal && internal.unit, 32) || '',
        system: 'http://unitsofmeasure.org',
        code: _safeStr(internal && internal.ucum, 16) || _safeStr(internal && internal.unit, 16) || ''
      };
    } else if (typeof value === 'string') {
      if (valueKey === 'code') {
        rv.valueCodeableConcept = _code(value,
          _safeStr(internal && internal.codeSystem2, 200) || NAMA_SYSTEM,
          _safeStr(internal && internal.valueDisplay, 200) || '');
      } else {
        rv.valueString = _safeStr(value, 2000);
      }
    } else if (value && typeof value === 'object' && Array.isArray(value.components)) {
      // Blood-pressure-style: components[].value
      rv.component = value.components.map(function (c) {
        return {
          code: { coding: [{
            system: _safeStr(c.codeSystem, 200) || 'http://loinc.org',
            code: _safeStr(c.code, 32), display: _safeStr(c.label, 200) || ''
          }] },
          valueQuantity: (typeof c.value === 'number') ? {
            value: c.value, unit: _safeStr(c.unit, 16) || 'mm[Hg]',
            system: 'http://unitsofmeasure.org', code: _safeStr(c.ucum, 16) || 'mm[Hg]'
          } : undefined
        };
      });
    }
    return rv;
  }

  // ---- Bundle builder ------------------------------------------------

  function buildPatientSummaryBundle(internal, opts) {
    opts = opts || {};
    var entries = [];
    function add(res, fullUrl) {
      if (!res) return;
      var r = res;
      entries.push({ resource: r, fullUrl: fullUrl || ('urn:uuid:' + (r.id || (Math.random().toString(36).slice(2)))).toLowerCase() });
    }
    add(patientToFhir(internal && internal.patient || {}, {
      epicMrn: opts.epicMrn,
      commonwellId: opts.commonwellId
    }));
    var conds = Array.isArray(internal && internal.conditions) ? internal.conditions : [];
    conds.forEach(function (c) { add(conditionToFhir(c), 'Condition/' + c.eventId); });
    var meds = Array.isArray(internal && internal.medications) ? internal.medications : [];
    meds.forEach(function (m) { add(medicationRequestToFhir(m), 'MedicationRequest/' + m.orderId); });
    var obs = Array.isArray(internal && internal.observations) ? internal.observations : [];
    obs.forEach(function (o) { add(observationToFhir(o), 'Observation/' + o.obsId); });

    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: _nowIso(),
      entry: entries
    };
  }

  // ---- Reverse map helpers ------------------------------------------

  function parseFhirBundle(bundle) {
    bundle = bundle || {};
    var entries = Array.isArray(bundle.entry) ? bundle.entry : [];
    var out = { patient: null, conditions: [], medications: [], observations: [] };
    for (var i = 0; i < entries.length; i++) {
      var r = entries[i] && entries[i].resource;
      if (!r) continue;
      if (r.resourceType === 'Patient') {
        out.patient = patientFromFhir(r);
      } else if (r.resourceType === 'Condition') {
        var coding = r.code && Array.isArray(r.code.coding) ? r.code.coding : [];
        var icd = coding.find(function (c) { return /sid\/icd-10/.test(c.system); });
        var sno = coding.find(function (c) { return /snomed\.info/.test(c.system); });
        out.conditions.push({
          eventId: r.id,
          patientId: (r.subject && r.subject.reference || '').replace(/^Patient\//, ''),
          icd10: icd && icd.code,
          icd10Display: icd && icd.display,
          snomed: sno && sno.code,
          snomedDisplay: sno && sno.display,
          recordedAt: r.recordedDate
        });
      } else if (r.resourceType === 'MedicationRequest') {
        var dos = Array.isArray(r.dosageInstruction) ? r.dosageInstruction[0] : null;
        var dq = dos && dos.doseAndRate && dos.doseAndRate[0] && dos.doseAndRate[0].doseQuantity;
        var mcc = r.medicationCodeableConcept || {};
        out.medications.push({
          orderId: r.id,
          patientId: (r.subject && r.subject.reference || '').replace(/^Patient\//, ''),
          status: r.status,
          rxnorm: mcc && mcc.coding && mcc.coding[0] && mcc.coding[0].code,
          label: mcc && mcc.coding && mcc.coding[0] && mcc.coding[0].display,
          dose: dq && dq.value,
          doseUnit: dq && dq.unit,
          sig: dos && dos.text
        });
      } else if (r.resourceType === 'Observation') {
        var v;
        var valueKey = 'valueString';
        if (r.valueQuantity) { v = r.valueQuantity.value; valueKey = 'valueQuantity'; }
        else if (r.valueCodeableConcept) { v = r.valueCodeableConcept.text || ''; valueKey = 'code'; }
        else if (r.valueString) { v = r.valueString; valueKey = 'valueString'; }
        var c0 = r.code && r.code.coding && r.code.coding[0];
        out.observations.push({
          obsId: r.id,
          patientId: (r.subject && r.subject.reference || '').replace(/^Patient\//, ''),
          code: c0 && c0.code,
          label: c0 && c0.display,
          codeSystem: c0 && c0.system,
          value: v,
          valueKey: valueKey,
          unit: r.valueQuantity && r.valueQuantity.unit,
          ucum: r.valueQuantity && r.valueQuantity.code,
          effectiveAt: r.effectiveDateTime
        });
      }
    }
    return out;
  }

  return {
    patientToFhir: patientToFhir,
    patientFromFhir: patientFromFhir,
    conditionToFhir: conditionToFhir,
    medicationRequestToFhir: medicationRequestToFhir,
    observationToFhir: observationToFhir,
    buildPatientSummaryBundle: buildPatientSummaryBundle,
    parseFhirBundle: parseFhirBundle,
    _SYSTEMS: { NAMA_SYSTEM: NAMA_SYSTEM, EPIC_SYSTEM: EPIC_SYSTEM,
                COMMONWELL: COMMONWELL, MRN_SYSTEM: MRN_SYSTEM }
  };
});
