// routes/interop.js
// Interop HTTP surface (P25) — Epic Care Everywhere + CommonWell + FHIR.
//   POST /api/v4/interop/xca/request
//   POST /api/v4/interop/xca/respond/:id
//   GET  /api/v4/interop/xca/:id
//   POST /api/v4/interop/fhir/bundle
//   GET  /api/v4/interop/fhir/capabilities
//
// Tenant-scoped (RAIL-5). Role-guarded (RAIL-13): doctor, admin,
// nurse, specialist. Fail-closed (RAIL-11). Hash-chained audit
// (RAIL-10). No PHI in logs (RAIL-12).
//
// Wires XCABridge + FhirExchange + Mapping into Express using
// lib/route-factory + lib/route-guards. Pure JS, no npm install.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const XCA = require('../lib/interop/xca');
const FhirEx = require('../lib/interop/fhirExchange');

const xca = XCA.create();
const fhirExchange = FhirEx.create();

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res,
    ['doctor', 'admin', 'nurse', 'specialist'])) return;
  if (typeof next === 'function') next();
}

function tenantGuard(req, res, next) {
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

function _err(res, status, code, msg) {
  if (!res || typeof res.status !== 'function') return;
  res.status(status).json({ error: code, msg: msg });
}

function _wrap(fn) {
  return function (req, res) {
    Promise.resolve()
      .then(function () { return fn(req, res); })
      .then(function (data) {
        if (res && typeof res.json === 'function' && !res.headersSent) {
          res.json(data === undefined ? { ok: true } : data);
        }
      })
      .catch(function (e) {
        var msg = (e && e.message) || 'INTERNAL';
        var status = 500;
        if (msg === 'TENANT_REQUIRED' ||
            msg === 'PATIENT_ID_REQUIRED' ||
            msg === 'SOURCE_HIE_REQUIRED' ||
            msg === 'REQUEST_ID_REQUIRED' ||
            msg === 'SUMMARY_REQUIRED' ||
            msg === 'SIGNATURE_REQUIRED' ||
            msg === 'BUNDLE_REQUIRED' ||
            msg === 'TOPIC_REQUIRED' ||
            msg === 'ENDPOINT_REQUIRED') status = 400;
        _err(res, status, msg, msg);
      });
  };
}

// ---- fixed-path routes via factory -----------------------------------

const xcaRequestRouter = RouteFactory.create({
  base: '/api/v4/interop/xca/request',
  tenantScoped: true,
  auth: { roles: ['doctor', 'admin', 'nurse', 'specialist'] },
  methods: {
    POST: {
      input: ['tenantId?', 'sourceHie', 'patientId', 'purpose?', 'requestedBy?'],
      handler: function (ctx) {
        return xca.requestPatientSummary({
          tenantId: ctx.tenantId,
          sourceHie: ctx.input.sourceHie,
          patientId: ctx.input.patientId,
          purpose: ctx.input.purpose || 'treatment',
          requestedBy: ctx.input.requestedBy || null
        });
      }
    }
  }
});

const fhirBundleRouter = RouteFactory.create({
  base: '/api/v4/interop/fhir/bundle',
  tenantScoped: true,
  auth: { roles: ['doctor', 'admin', 'nurse', 'specialist'] },
  methods: {
    POST: {
      input: ['tenantId?', 'bundle', 'source?', 'actor?'],
      handler: function (ctx) {
        return fhirExchange.uploadBundle({
          tenantId: ctx.tenantId,
          bundle: ctx.input.bundle,
          source: ctx.input.source || 'unknown',
          actor: ctx.input.actor || null
        });
      }
    }
  }
});

const fhirCapabilitiesRouter = RouteFactory.create({
  base: '/api/v4/interop/fhir/capabilities',
  tenantScoped: true,
  auth: { roles: ['doctor', 'admin', 'nurse', 'specialist'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return fhirExchange.publishCapability({
          tenantId: ctx.tenantId,
          url: 'urn:nama:medical:gateway',
          version: 'p25-1.0.0'
        });
      }
    }
  }
});

// ---- parameterised routes --------------------------------------------

const paramRouter = express.Router();
paramRouter.use(express.json({ limit: '1mb' }));
paramRouter.use(roleGuard);
paramRouter.use(tenantGuard);

// POST /api/v4/interop/xca/respond/:id
paramRouter.post('/xca/respond/:id', _wrap(function (req, res) {
  const id = req.params && req.params.id;
  if (!id) throw new Error('REQUEST_ID_REQUIRED');
  const body = req.body || {};
  return xca.respondPatientSummary({
    requestId: id,
    patientSummary: body.patientSummary || body.summary,
    signedBy: body.signedBy
  });
}));

// GET /api/v4/interop/xca/:id
paramRouter.get('/xca/:id', _wrap(function (req, res) {
  const id = req.params && req.params.id;
  if (!id) throw new Error('REQUEST_ID_REQUIRED');
  return xca.status({ requestId: id });
}));

module.exports = {
  xcaRequest: xcaRequestRouter,
  fhirBundle: fhirBundleRouter,
  fhirCapabilities: fhirCapabilitiesRouter,
  param: paramRouter
};
