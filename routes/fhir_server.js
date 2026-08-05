'use strict';
// FHIR server (sandbox) — minimal REST endpoints for Patient/Observation/Encounter.
// Designed to be wrapped in a deployment's `/fhir/*` routes via the existing
// sandbox-safe pattern (in-memory storage + tenant scoping).

function newFHIRServer(opts = {}) {
  const resources = opts.resources || {
    Patient: new Map(),
    Observation: new Map(),
    Encounter: new Map(),
    MedicationRequest: new Map(),
    Coverage: new Map(),
    Claim: new Map(),
  };

  function ok(res, status, payload) {
    res.status(status).json(payload || { resourceType: 'OperationOutcome' });
  }
  function notFound(res, type, id) {
    ok(res, 404, { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', details: { text: `${type}/${id} not found` } }] });
  }
  function badReq(res, msg) {
    ok(res, 400, { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid', details: { text: msg } }] });
  }

  function assertTenant(req) {
    const t = (req.headers && req.headers['x-tenant']) || (req.context && req.context.tenantId);
    if (!t) throw new Error('TENANT_REQUIRED');
    return t;
  }

  function withTenantScope(tenantId, r) {
    // Tenant-scoped resource lookup. Resources that don't belong to the
    // tenant are stripped from the result.
    if (!r._tenant) r._tenant = tenantId;
    return r._tenant === tenantId;
  }

  function expressify() {
    const express = require('express');
    const app = express();
    app.use(express.json({ limit: '2mb', type: ['application/json', 'application/fhir+json'] }));

    app.get('/fhir/Patient/:id', (req, res) => {
      const t = assertTenant(req);
      const id = req.params.id;
      const r = resources.Patient.get(id);
      if (!r || !withTenantScope(t, r)) return notFound(res, 'Patient', id);
      ok(res, 200, stripTenantMeta(r));
    });

    app.post('/fhir/Patient', (req, res) => {
      const t = assertTenant(req);
      const body = req.body;
      if (!body || body.resourceType !== 'Patient') return badReq(res, 'Patient resource expected');
      if (!body.id) body.id = 'p-' + Math.random().toString(36).slice(2, 10);
      body._tenant = t;
      body.meta = body.meta || { versionId: '1', lastUpdated: new Date().toISOString() };
      resources.Patient.set(body.id, body);
      res.setHeader('Location', `/fhir/Patient/${body.id}`);
      ok(res, 201, stripTenantMeta(body));
    });

    app.get('/fhir/Observation/:id', (req, res) => {
      const t = assertTenant(req);
      const r = resources.Observation.get(req.params.id);
      if (!r || !withTenantScope(t, r)) return notFound(res, 'Observation', req.params.id);
      ok(res, 200, stripTenantMeta(r));
    });

    app.post('/fhir/Observation', (req, res) => {
      const t = assertTenant(req);
      const body = req.body;
      if (!body || body.resourceType !== 'Observation') return badReq(res, 'Observation resource expected');
      if (!body.id) body.id = 'o-' + Math.random().toString(36).slice(2, 10);
      body._tenant = t;
      body.meta = body.meta || { versionId: '1', lastUpdated: new Date().toISOString() };
      resources.Observation.set(body.id, body);
      res.setHeader('Location', `/fhir/Observation/${body.id}`);
      ok(res, 201, stripTenantMeta(body));
    });

    app.get('/fhir/Encounter/:id', (req, res) => {
      const t = assertTenant(req);
      const r = resources.Encounter.get(req.params.id);
      if (!r || !withTenantScope(t, r)) return notFound(res, 'Encounter', req.params.id);
      ok(res, 200, stripTenantMeta(r));
    });

    app.post('/fhir/Encounter', (req, res) => {
      const t = assertTenant(req);
      const body = req.body;
      if (!body || body.resourceType !== 'Encounter') return badReq(res, 'Encounter resource expected');
      if (!body.id) body.id = 'e-' + Math.random().toString(36).slice(2, 10);
      body._tenant = t;
      body.meta = body.meta || { versionId: '1', lastUpdated: new Date().toISOString() };
      resources.Encounter.set(body.id, body);
      res.setHeader('Location', `/fhir/Encounter/${body.id}`);
      ok(res, 201, stripTenantMeta(body));
    });

    app.get('/fhir/Patient/:patient/observations', (req, res) => {
      const t = assertTenant(req);
      const list = [];
      for (const r of resources.Observation.values()) {
        if (withTenantScope(t, r) && r.subject && r.subject.reference === 'Patient/' + req.params.patient) {
          list.push(stripTenantMeta(r));
        }
      }
      ok(res, 200, { resourceType: 'Bundle', type: 'searchset', total: list.length, entry: list.map((r) => ({ resource: r })) });
    });

    app.get('/fhir/health', (_req, res) => ok(res, 200, { status: 'ok', fhirVersion: '4.0.1' }));

    return app;
  }

  function stripTenantMeta(r) {
    const o = Object.assign({}, r);
    delete o._tenant;
    return o;
  }

  return { resources, expressify };
}

module.exports = { newFHIRServer };
