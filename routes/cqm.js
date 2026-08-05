// routes/cqm.js
// Clinical Quality Measure (CQM) auto-submission API (P14).
// Wires Measures + QRDA generator + storage into:
//   GET  /api/v4/cqm/measures
//   GET  /api/v4/cqm/measure/:id
//   POST /api/v4/cqm/report/:measureId
//   POST /api/v4/cqm/submit/:measureId
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// no PHI in logs (RAIL-12).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const Measures = require('../lib/cqm/measures');
const QRDAGenerator = require('../lib/cqm/qrda');
const CqmStorage = require('../lib/cqm/storage');

const generator = new QRDAGenerator();

// Compose middleware from the route-guards snippets library
function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'nurse', 'quality', 'admin'])) return;
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
          // Never echo raw field-required tokens as PHI
          if (/UNKNOWN_MEASURE|UNKNOWN/i.test(msg)) return _err(res, 400, 'BAD_REQUEST', msg);
          if (/TENANT|REQUIRED|FIELD/i.test(msg)) return _err(res, 400, 'BAD_REQUEST', msg);
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

// =========================================================================
// /api/v4/cqm/measures — list catalog (tenant-scoped, role-guarded)
// =========================================================================
const listMeasuresRouter = RouteFactory.create({
  base: '/api/v4/cqm/measures',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse', 'quality', 'admin'] },
  methods: {
    GET: {
      handler: function (ctx) {
        var domain = ctx.query && ctx.query.domain ? String(ctx.query.domain) : null;
        // tenantScope guards are enforced upstream; pass tenantId only
        return Measures.listMeasures({ tenantId: ctx.tenantId, domain: domain });
      }
    }
  }
});

// =========================================================================
// /api/v4/cqm/measure/:id — get single measure metadata
// =========================================================================
const measureRouter = express.Router({ mergeParams: true });
measureRouter.use(roleGuard, tenantGuard);
measureRouter.get('/:id', _handler(function (req, res) {
  var measureId = req.params && req.params.id;
  if (!measureId) return _err(res, 400, 'FIELD_REQUIRED', 'id is required');
  return Measures.getMeasure(measureId);
}));

// =========================================================================
// /api/v4/cqm/report/:measureId — build QRDA I measure report
// =========================================================================
const reportRouter = express.Router({ mergeParams: true });
reportRouter.use(roleGuard, tenantGuard);
reportRouter.post('/:measureId', _handler(function (req, res) {
  var measureId = req.params && req.params.measureId;
  if (!measureId) return _err(res, 400, 'FIELD_REQUIRED', 'measureId is required');
  var period = (req.body && req.body.period) || (req.query && req.query.period);
  if (!period || !period.start || !period.end) {
    return _err(res, 400, 'FIELD_REQUIRED', 'period.start and period.end are required');
  }
  var report = generator.buildMeasureReport({
    tenantId: req.tenantId,
    measureId: measureId,
    period: { start: period.start, end: period.end }
  });
  var validation = generator.validateXml(report.xml);
  return Object.assign({}, report, { validation: validation });
}));

// =========================================================================
// /api/v4/cqm/submit/:measureId — mock QRDA submission
// =========================================================================
const submitRouter = express.Router({ mergeParams: true });
submitRouter.use(roleGuard, tenantGuard);
submitRouter.post('/:measureId', _handler(function (req, res) {
  var measureId = req.params && req.params.measureId;
  if (!measureId) return _err(res, 400, 'FIELD_REQUIRED', 'measureId is required');
  var period = (req.body && req.body.period) || (req.query && req.query.period);
  if (!period || !period.start || !period.end) {
    return _err(res, 400, 'FIELD_REQUIRED', 'period.start and period.end are required');
  }
  var report = generator.buildMeasureReport({
    tenantId: req.tenantId,
    measureId: measureId,
    period: { start: period.start, end: period.end }
  });
  var validation = generator.validateXml(report.xml);
  var ok = validation.ok === true;
  var receipt = 'QRDA-' + measureId + '-' + Date.now().toString(36);
  return {
    ok: ok,
    accepted: ok,
    measureId: measureId,
    period: period,
    receiptId: receipt,
    submittedBy: (req.user && (req.user.userId || req.user.id)) || 'unknown',
    submittedAt: new Date().toISOString(),
    validation: validation,
    summary: {
      ipop: report.ipop,
      denom: report.denom,
      numer: report.numer,
      exclusions: report.exclusions,
      exceptions: report.exceptions
    },
    note: 'mock submission — wire to CMS QRDA Repository inbound for production.'
  };
}));

module.exports = {
  router: express.Router({ mergeParams: true })
    .use('/', listMeasuresRouter)
    .use('/', measureRouter)
    .use('/report', reportRouter)
    .use('/submit', submitRouter),
  listMeasures: listMeasuresRouter,
  measure: measureRouter,
  report: reportRouter,
  submit: submitRouter
};
