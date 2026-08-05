'use strict';
// lib/hl7v2/mapper.js
// Maps HL7 v2 parsed messages into NamaMedical internal domain objects.
// Pure JS, no npm install.
//
// Domain contracts:
//   - adtToEncounter(parsed)  -> Encounter   { tenantId, patientId, ... }
//   - ormToOrder(parsed)      -> Order       { tenantId, patientId, ... }
//   - oruToObservation(parsed) -> Observation { tenantId, patientId, ... }
//
// SAFETY:
//   - Functions never throw on missing fields; they return best-effort
//     objects with empty strings for missing values. Callers (routes
//     layer) decide whether to ACK or NACK.
//   - No PHI in any error path; only IDs and type names.
//   - tenantId MUST be supplied by the caller (RAIL-5: tenant context
//     cannot be inferred from a free-text HL7 feed).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HL7v2Mapper = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var ParserMod = require('./parser');
  // parser.js exports the HL7Parser constructor directly, with namespace
  // helpers attached as properties (HL7Parser.HL7Parser, HL7Parser.create, ...).
  var HL7Parser = (ParserMod && typeof ParserMod.HL7Parser === 'function')
    ? ParserMod.HL7Parser
    : ParserMod;

  function safeString(v) {
    if (v === undefined || v === null) return '';
    return String(v);
  }

  // Map ADT^A01 (Admission) -> internal Encounter.
  //   tenantId: required, supplied by caller (RAIL-5)
  //   parsed:   the object returned by HL7Parser.parse()
  function adtToEncounter(parsed, tenantId) {
    var parser = new HL7Parser();
    var patient = parser.extractPatient(parsed) || {};
    var attending = patient.attendingDoctor || {};
    return {
      tenantId: safeString(tenantId),
      patientId: safeString(patient.patientId),
      // Synthesize an encounter id from the MSH control id so retries are
      // idempotent at the storage layer.
      encounterId: 'enc-' + safeString(parsed && parsed.messageControlId),
      messageControlId: safeString(parsed && parsed.messageControlId),
      messageType: 'ADT',
      trigger: safeString(parsed && parsed.trigger),
      admittingDoctor: safeString(attending.id),
      admittingDoctorName: [
        safeString(attending.givenName),
        safeString(attending.familyName)
      ].filter(Boolean).join(' ').trim(),
      patient: {
        familyName: safeString(patient.familyName),
        givenName: safeString(patient.givenName),
        middleName: safeString(patient.middleName),
        sex: safeString(patient.sex),
        dob: safeString(patient.dob)
      },
      at: safeString(parsed && parsed.timestamp),
      receivedAt: new Date().toISOString(),
      source: 'hl7v2',
      version: safeString(parsed && parsed.versionId)
    };
  }

  // Map ORM^O01 (Order) -> internal Order.
  function ormToOrder(parsed, tenantId) {
    var parser = new HL7Parser();
    var order = parser.extractOrder(parsed) || {};
    var provider = order.orderingProvider || {};
    return {
      tenantId: safeString(tenantId),
      patientId: safeString(order.patientId),
      placerNumber: safeString(order.placerOrderNumber),
      orderType: safeString(order.orderControl) || 'NW',
      items: [{
        code: safeString(order.orderCode),
        name: safeString(order.orderName)
      }],
      orderingProvider: safeString(provider.id),
      orderingProviderName: [
        safeString(provider.givenName),
        safeString(provider.familyName)
      ].filter(Boolean).join(' ').trim(),
      messageControlId: safeString(parsed && parsed.messageControlId),
      messageType: 'ORM',
      trigger: safeString(parsed && parsed.trigger),
      at: safeString(parsed && parsed.timestamp),
      receivedAt: new Date().toISOString(),
      source: 'hl7v2',
      version: safeString(parsed && parsed.versionId)
    };
  }

  // Map ORU^R01 (Result) -> internal Observation.
  function oruToObservation(parsed, tenantId) {
    var parser = new HL7Parser();
    var result = parser.extractResult(parsed) || {};
    return {
      tenantId: safeString(tenantId),
      patientId: safeString(result.patientId),
      orderNumber: safeString(result.orderNumber),
      code: safeString(result.observationCode),
      name: safeString(result.observationName),
      value: safeString(result.value),
      unit: safeString(result.unit),
      refRange: safeString(result.referenceRange),
      abnormalFlag: safeString(result.abnormalFlag),
      messageControlId: safeString(parsed && parsed.messageControlId),
      messageType: 'ORU',
      trigger: safeString(parsed && parsed.trigger),
      at: safeString(parsed && parsed.timestamp),
      receivedAt: new Date().toISOString(),
      source: 'hl7v2',
      version: safeString(parsed && parsed.versionId)
    };
  }

  // Convenience: dispatch by parsed.type.
  function toDomain(parsed, tenantId) {
    if (!parsed) return null;
    switch (String(parsed.type || '').toUpperCase()) {
      case 'ADT': return adtToEncounter(parsed, tenantId);
      case 'ORM': return ormToOrder(parsed, tenantId);
      case 'ORU': return oruToObservation(parsed, tenantId);
      default:
        return {
          tenantId: safeString(tenantId),
          messageType: safeString(parsed.type),
          trigger: safeString(parsed.trigger),
          messageControlId: safeString(parsed.messageControlId),
          at: safeString(parsed.timestamp),
          receivedAt: new Date().toISOString(),
          source: 'hl7v2',
          unhandled: true
        };
    }
  }

  return {
    adtToEncounter: adtToEncounter,
    ormToOrder: ormToOrder,
    oruToObservation: oruToObservation,
    toDomain: toDomain
  };
});
