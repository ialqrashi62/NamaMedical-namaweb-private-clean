// routes/anesthesia.js
// Anesthesia Monitor Integration API (P15).
// Wires AnesthesiaCase + HL7 ORU parser + storage into:
//   POST /api/v4/anesthesia/case
//   POST /api/v4/anesthesia/case/:id/vital
//   POST /api/v4/anesthesia/case/:id/event
//   POST /api/v4/anesthesia/case/:id/finalize
//   GET  /api/v4/anesthesia/case/:id
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// no PHI in logs (RAIL-12), hash-chained audit (RAIL-10), 5R enforced
// before finalize.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const AnesthesiaCase = require('../lib/anesthesia/case');
const AnesthesiaStorage = require('../lib/anesthesia/storage');
const Oru = require('../lib/anesthesia/oru');

const storage = AnesthesiaStorage.newAnesthesiaStorage();
const driver = new AnesthesiaCase({ storage: storage });

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'nurse', 'anesthesiologist', 'admin'])) return;
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
          if (/FIELD_REQUIRED|UNSAFE|TENANT|INVALID/i.test(msg)) return _err(res, 400, 'BAD_REQUEST', msg);
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

// =========================================================================
// POST /api/v4/anesthesia/case — start case
// =========================================================================
const caseStartRouter = RouteFactory.create({
  base: '/api/v4/anesthesia/case',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse', 'anesthesiologist', 'admin'] },
  methods: {
    POST: {
      handler: function (ctx) {
        var body = ctx.body || {};
        var input = ctx.input || {};
        var patientId = input.patientId || body.patientId;
        var surgeonId = input.surgeonId || body.surgeonId;
        var type = input.anesthesiaType || body.anesthesiaType;
        var preop = input.preop || body.preop || null;
        if (!patientId) throw new Error('FIELD_REQUIRED:patientId');
        if (!surgeonId) throw new Error('FIELD_REQUIRED:surgeonId');
        if (!type) throw new Error('FIELD_REQUIRED:anesthesiaType');
        var r = driver.start({
          tenantId: ctx.tenantId,
          patientId: patientId,
          surgeonId: surgeonId,
          anesthesiaType: type,
          preop: preop
        });
        if (!r.ok) throw new Error(r.error || 'START_FAILED');
        return { ok: true, caseId: r.caseId, startTs: r.startTs, agent: r.agent, type: r.type, auditHash: r.auditHash };
      }
    }
  }
});

// =========================================================================
// Parameter-routed :id endpoints
// =========================================================================
const idRouter = express.Router({ mergeParams: true });
idRouter.use(roleGuard, tenantGuard);

// POST /:id/vital  — accepts single vital OR an HL7 ORU^R01 message via { hl7: "..." }
idRouter.post('/:id/vital', _handler(function (req, res) {
  var caseId = req.params && req.params.id;
  if (!caseId) return _err(res, 400, 'FIELD_REQUIRED', 'case id is required');

  // Accept either an HL7 ORU^R01 payload or a flat single vital
  var body = req.body || {};
  var recorded = [];
  var skipped = 0;

  if (body.hl7 && typeof body.hl7 === 'string') {
    var parsed = Oru.parseOru(body.hl7);
    if (!parsed.ok) return _err(res, 400, 'BAD_HL7', parsed.error || 'parse failed');
    for (var i = 0; i < parsed.vitals.length; i++) {
      var v = parsed.vitals[i];
      var r = driver.recordVital({ caseId: caseId, ts: v.ts, code: v.code, value: v.value, unit: v.unit });
      if (r.ok) recorded.push(r.entry);
      else skipped++;
    }
    return {
      ok: true,
      caseId: caseId,
      recorded: recorded.length,
      skipped: skipped,
      sendingApp: parsed.sendingApp,
      vitals: recorded
    };
  }

  // Flat single vital
  var ts = body.ts;
  var code = body.code;
  var value = body.value;
  var unit = body.unit;
  if (!ts || !code || value === undefined || !unit) {
    return _err(res, 400, 'FIELD_REQUIRED', 'ts, code, value, unit are required');
  }
  var r2 = driver.recordVital({ caseId: caseId, ts: ts, code: code, value: value, unit: unit });
  if (!r2.ok) return _err(res, 400, 'BAD_REQUEST', r2.error);
  return { ok: true, caseId: caseId, entry: r2.entry, auditHash: r2.auditHash };
}));

// POST /:id/event
idRouter.post('/:id/event', _handler(function (req, res) {
  var caseId = req.params && req.params.id;
  if (!caseId) return _err(res, 400, 'FIELD_REQUIRED', 'case id is required');
  var body = req.body || {};
  if (!body.type) return _err(res, 400, 'FIELD_REQUIRED', 'type is required');
  var r = driver.addEvent({ caseId: caseId, type: body.type, note: body.note, ts: body.ts });
  if (!r.ok) return _err(res, 400, 'BAD_REQUEST', r.error);
  return { ok: true, caseId: caseId, entry: r.entry, auditHash: r.auditHash };
}));

// POST /:id/finalize — enforces 5R
idRouter.post('/:id/finalize', _handler(function (req, res) {
  var caseId = req.params && req.params.id;
  if (!caseId) return _err(res, 400, 'FIELD_REQUIRED', 'case id is required');
  var body = req.body || {};
  var r = driver.finalize({
    caseId: caseId,
    endTs: body.endTs,
    outcome: body.outcome,
    preopFinalize: body.preopFinalize
  });
  if (!r.ok) {
    var status = r.error === '5R_FAILED' ? 409 : 400;
    return _err(res, status, r.error, JSON.stringify(r));
  }
  return { ok: true, caseId: caseId, endTs: r.endTs, outcome: r.outcome, auditHash: r.auditHash, fiveR: r.fiveR };
}));

// GET /:id
idRouter.get('/:id', _handler(function (req, res) {
  var caseId = req.params && req.params.id;
  if (!caseId) return _err(res, 400, 'FIELD_REQUIRED', 'case id is required');
  var r = driver.get({ caseId: caseId });
  if (!r.ok) return _err(res, 404, 'NOT_FOUND', r.error);
  return r;
}));

module.exports = {
  router: express.Router({ mergeParams: true })
    .use('/', caseStartRouter)
    .use('/case', idRouter),
  caseStart: caseStartRouter,
  id: idRouter,
  _driver: driver,
  _storage: storage
};
