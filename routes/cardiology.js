// routes/cardiology.js
// Cardiology Structured Reporting API (P16).
// Wires Templates + StructuredReport driver + Storage into:
//   GET  /api/v4/cardiology/templates
//   POST /api/v4/cardiology/report
//   POST /api/v4/cardiology/report/:id/finalize
//   GET  /api/v4/cardiology/report/:id
//   GET  /api/v4/cardiology/reports/:patientId
//   GET  /api/v4/cardiology/report/:id/dicom-sr
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// no PHI in logs (RAIL-12), hash-chained audit (RAIL-10).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const Templates = require('../lib/cardiology/templates');
const CardiologyStorage = require('../lib/cardiology/storage');
const CardiologyReport = require('../lib/cardiology/structuredReport');

const storage = CardiologyStorage.newCardiologyStorage();
const driver = new CardiologyReport({ storage: storage });

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'cardiologist', 'nurse', 'admin'])) return;
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

function _handler(fn) {
  return function (req, res) {
    Promise.resolve()
      .then(function () { return fn(req, res); })
      .then(function (data) {
        if (res && typeof res.json === 'function' && !res.headersSent) {
          res.json(data === undefined ? { ok: true } : data);
        }
      })
      .catch(function (err) {
        if (res && typeof res.status === 'function' && !res.headersSent) {
          var msg = (err && err.message) ? err.message : 'Internal error';
          if (/FIELD_REQUIRED|TENANT|VALIDATION|UNKNOWN/i.test(msg)) {
            return _err(res, 400, 'BAD_REQUEST', msg);
          }
          if (/NOT_FOUND|NOT_FINALIZED/i.test(msg)) {
            return _err(res, 404, 'NOT_FOUND', msg);
          }
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

// =========================================================================
// /api/v4/cardiology/templates — list structured-report templates
// =========================================================================
const templatesRouter = RouteFactory.create({
  base: '/api/v4/cardiology/templates',
  tenantScoped: true,
  auth: { roles: ['doctor', 'cardiologist', 'nurse', 'admin'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return { ok: true, templates: Templates.list() };
      }
    }
  }
});

// =========================================================================
// Parameter-routed :id endpoints
// =========================================================================
const idRouter = express.Router({ mergeParams: true });
idRouter.use(roleGuard, tenantGuard);

// POST /report/:id/finalize
idRouter.post('/report/:id/finalize', _handler(function (req, res) {
  var reportId = req.params && req.params.id;
  if (!reportId) return _err(res, 400, 'FIELD_REQUIRED', 'report id is required');
  return driver.finalize({
    reportId: reportId,
    tenantId: req.tenantId,
    actorId: (req.user && (req.user.userId || req.user.id)) || null,
    hash: (req.body && req.body.hash) || undefined
  });
}));

// GET /report/:id
idRouter.get('/report/:id', _handler(function (req, res) {
  var reportId = req.params && req.params.id;
  if (!reportId) return _err(res, 400, 'FIELD_REQUIRED', 'report id is required');
  return driver.get({ reportId: reportId, tenantId: req.tenantId });
}));

// GET /report/:id/dicom-sr
idRouter.get('/report/:id/dicom-sr', _handler(function (req, res) {
  var reportId = req.params && req.params.id;
  if (!reportId) return _err(res, 400, 'FIELD_REQUIRED', 'report id is required');
  return driver.exportDicomSR({ reportId: reportId, tenantId: req.tenantId });
}));

// GET /reports/:patientId — history
idRouter.get('/reports/:patientId', _handler(function (req, res) {
  var patientId = req.params && req.params.patientId;
  if (!patientId) return _err(res, 400, 'FIELD_REQUIRED', 'patientId is required');
  return driver.history({ tenantId: req.tenantId, patientId: patientId });
}));

// =========================================================================
// POST /api/v4/cardiology/report — create new structured report
// =========================================================================
const createRouter = RouteFactory.create({
  base: '/api/v4/cardiology/report',
  tenantScoped: true,
  auth: { roles: ['doctor', 'cardiologist', 'nurse', 'admin'] },
  methods: {
    POST: {
      handler: function (ctx) {
        var body = ctx.body || {};
        return driver.create({
          tenantId: ctx.tenantId,
          patientId: body.patientId,
          templateId: body.templateId,
          fields: body.fields || {},
          actorId: (ctx.user && (ctx.user.userId || ctx.user.id)) || (req && req.user && (req.user.userId || req.user.id)) || null,
          lang: body.lang || 'en'
        });
      }
    }
  }
});

module.exports = {
  router: express.Router({ mergeParams: true })
    .use('/', templatesRouter)
    .use('/', idRouter)
    .use('/', createRouter),
  templates: templatesRouter,
  id: idRouter,
  create: createRouter,
  _driver: driver,
  _storage: storage
};
