'use strict';
// lib/fhir/router.js
// FHIR R4 Public Surface for NamaMedical.
// Exposes /fhir/* routes. Tenant-scoped (RAIL-5), content-type=application/fhir+json.
// Pure JS, no npm install. Fail-closed on missing tenant context.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FhirRouter = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const express = require('express');
  const RouteGuards = require('../route-guards');
  const Storage = require('./storage');
  const devCtx = require('../dev-ctx');

  const router = express.Router();
  const FHIR_CT = 'application/fhir+json';

  // Apply JSON body parser for POST/PUT (search-only surface; harmless for GET).
  router.use(express.json({ limit: '1mb', type: ['application/json', FHIR_CT] }));

  // Dev/test tenant header trust (GATE-4 aligned; same pattern as autowire `_ctx`).
  // Production callers set req.tenantId via real session; this only fills in when missing.
  router.use(devCtx);

  // ---- Helpers ----
  function _tenantFromReq(req) {
    return (req && (req.tenantId || (req.context && req.context.tenantId))) || null;
  }

  function _setFhirHeaders(res) {
    res.setHeader('Content-Type', FHIR_CT);
    res.setHeader('X-FHIR-Version', '4.0.1');
  }

  function _bundle(type, total, rows) {
    return {
      resourceType: 'Bundle',
      id: type.toLowerCase() + '-searchset-' + Date.now().toString(36),
      type: 'searchset',
      total: total,
      link: [{ relation: 'self', url: '/fhir/' + type }],
      entry: rows.map((r) => ({ resource: r, fullUrl: '/fhir/' + type + '/' + r.id })),
    };
  }

  function _notFound(res, type, id) {
    _setFhirHeaders(res);
    res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        details: { text: type + '/' + (id || '') + ' not found' },
      }],
    });
  }

  function _badRequest(res, msg) {
    _setFhirHeaders(res);
    res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: msg || 'Bad request' } }],
    });
  }

  function _tenantGuard(req, res, next) {
    // Both guards from lib/route-guards; chain is fail-closed.
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    return next();
  }

  // ---- CapabilityStatement ----
  function _buildCapabilityStatement() {
    return {
      resourceType: 'CapabilityStatement',
      id: 'namamedical-capability',
      status: 'active',
      date: new Date().toISOString(),
      publisher: 'NamaMedical',
      kind: 'instance',
      fhirVersion: '4.0.1',
      format: ['json'],
      software: {
        name: 'NamaMedical',
        version: 'vGlobal.0',
        releaseDate: new Date().toISOString().slice(0, 10),
      },
      implementation: {
        description: 'NamaMedical FHIR R4 Public Surface',
        url: '/fhir',
      },
      rest: [{
        mode: 'server',
        security: {
          service: [{
            coding: [
              { system: 'http://terminology.hl7.org/CodeSystem/restful-security-service', code: 'SMART-on-FHIR' },
            ],
          }],
          extension: [{
            url: 'http://hl7.org/fhir/uv/security-label-ds4p/StructureDefinition/ds4p-confidentiality',
            valueCode: 'L',
          }],
        },
        resource: [
          { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'name', type: 'string' }, { name: 'mrn', type: 'token' }, { name: '_id', type: 'token' },
          ] },
          { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }, { name: '_id', type: 'token' },
          ] },
          { type: 'MedicationRequest', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }, { name: '_id', type: 'token' },
          ] },
          { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'patient', type: 'reference' }, { name: '_id', type: 'token' },
          ] },
          { type: 'AllergyIntolerance', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'patient', type: 'reference' }, { name: '_id', type: 'token' },
          ] },
          { type: 'DiagnosticReport', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [
            { name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }, { name: '_id', type: 'token' },
          ] },
        ],
      }],
    };
  }

  function capability() {
    return _buildCapabilityStatement();
  }

  // ---- Routes ----
  // Root + metadata: tenant-scoped (RAIL-5) but the CapabilityStatement itself
  // is non-PHI; we still apply guards so unauthenticated tenants are blocked.
  router.get('/metadata', _tenantGuard, (_req, res) => {
    _setFhirHeaders(res);
    res.status(200).json(_buildCapabilityStatement());
  });

  // Convenience: expose CapabilityStatement also at root for HAPI clients.
  router.get('/', _tenantGuard, (_req, res) => {
    _setFhirHeaders(res);
    res.status(200).json(_buildCapabilityStatement());
  });

  // --- Patient ---
  router.get('/Patient/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.Patient.findById(t, req.params.id);
    if (!row) return _notFound(res, 'Patient', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  router.get('/Patient', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const rows = Storage.Patient.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('Patient', rows.length, rows));
  });

  // --- Observation ---
  router.get('/Observation', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    if (!req.query || !req.query.patient) {
      // FHIR R4 mandates "patient" for clinical searches; we fail-closed.
      return _badRequest(res, 'patient query parameter is required');
    }
    const rows = Storage.Observation.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('Observation', rows.length, rows));
  });

  router.get('/Observation/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.Observation.findById(t, req.params.id);
    if (!row) return _notFound(res, 'Observation', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  // --- MedicationRequest ---
  router.get('/MedicationRequest', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    if (!req.query || !req.query.patient) {
      return _badRequest(res, 'patient query parameter is required');
    }
    const rows = Storage.MedicationRequest.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('MedicationRequest', rows.length, rows));
  });

  router.get('/MedicationRequest/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.MedicationRequest.findById(t, req.params.id);
    if (!row) return _notFound(res, 'MedicationRequest', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  // --- Condition ---
  router.get('/Condition', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    if (!req.query || !req.query.patient) {
      return _badRequest(res, 'patient query parameter is required');
    }
    const rows = Storage.Condition.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('Condition', rows.length, rows));
  });

  router.get('/Condition/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.Condition.findById(t, req.params.id);
    if (!row) return _notFound(res, 'Condition', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  // --- AllergyIntolerance ---
  router.get('/AllergyIntolerance', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    if (!req.query || !req.query.patient) {
      return _badRequest(res, 'patient query parameter is required');
    }
    const rows = Storage.AllergyIntolerance.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('AllergyIntolerance', rows.length, rows));
  });

  router.get('/AllergyIntolerance/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.AllergyIntolerance.findById(t, req.params.id);
    if (!row) return _notFound(res, 'AllergyIntolerance', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  // --- DiagnosticReport ---
  router.get('/DiagnosticReport', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    if (!req.query || !req.query.patient) {
      return _badRequest(res, 'patient query parameter is required');
    }
    const rows = Storage.DiagnosticReport.search(t, req.query || {});
    _setFhirHeaders(res);
    res.status(200).json(_bundle('DiagnosticReport', rows.length, rows));
  });

  router.get('/DiagnosticReport/:id', _tenantGuard, (req, res) => {
    const t = _tenantFromReq(req);
    const row = Storage.DiagnosticReport.findById(t, req.params.id);
    if (!row) return _notFound(res, 'DiagnosticReport', req.params.id);
    _setFhirHeaders(res);
    res.status(200).json(row);
  });

  // Fallback 404 — OperationOutcome.
  router.use((_req, res) => {
    _notFound(res, 'API', 'endpoint');
  });

  return {
    router: router,
    capability: capability,
    _internal: {
      _setFhirHeaders: _setFhirHeaders,
      _bundle: _bundle,
      _buildCapabilityStatement: _buildCapabilityStatement,
    },
  };
});
