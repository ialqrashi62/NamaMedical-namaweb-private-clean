// routes/tumorBoard.js
// Tumor Board / MDT scheduling + presentation API (P17).
// Wires MDTScheduler + MDTSlides + TumorBoardStorage into:
//   POST /api/v4/mdt/meeting
//   POST /api/v4/mdt/meeting/:id/case
//   POST /api/v4/mdt/case/:id/decision
//   GET  /api/v4/mdt/meeting/:id
//   GET  /api/v4/mdt/upcoming
//   GET  /api/v4/mdt/meeting/:id/minutes
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// no PHI in logs (RAIL-12), hash-chained MDT decisions (RAIL-10).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const TBStorage = require('../lib/tumorBoard/storage');
const MDTScheduler = require('../lib/tumorBoard/scheduler');
const MDTSlides = require('../lib/tumorBoard/presentation');

const storage = TBStorage.newTumorBoardStorage();
const scheduler = new MDTScheduler({ storage: storage });
const slides = new MDTSlides({ storage: storage });

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'oncologist', 'admin', 'nurse', 'specialist'])) return;
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
          if (/FIELD_REQUIRED|TENANT|VALIDATION|BAD_|CASE_MEETING|UNKNOWN/i.test(msg)) {
            return _err(res, 400, 'BAD_REQUEST', msg);
          }
          if (/NOT_FOUND|MEETING_CANCELLED/i.test(msg)) {
            return _err(res, 404, 'NOT_FOUND', msg);
          }
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

// =========================================================================
// POST /api/v4/mdt/meeting — schedule a meeting (optionally with seed cases)
// =========================================================================
const scheduleRouter = RouteFactory.create({
  base: '/api/v4/mdt/meeting',
  tenantScoped: true,
  auth: { roles: ['doctor', 'oncologist', 'admin', 'specialist'] },
  methods: {
    POST: {
      handler: function (ctx) {
        var body = ctx.body || {};
        return scheduler.schedule({
          tenantId: ctx.tenantId,
          date: body.date,
          time: body.time,
          location: body.location,
          chairId: body.chairId,
          attendees: body.attendees || [],
          cases: body.cases || []
        });
      }
    }
  }
});

// =========================================================================
// Parameter-routed :id endpoints
// =========================================================================
const idRouter = express.Router({ mergeParams: true });
idRouter.use(roleGuard, tenantGuard);

// POST /meeting/:id/case
idRouter.post('/meeting/:id/case', _handler(function (req, res) {
  var meetingId = req.params && req.params.id;
  if (!meetingId) return _err(res, 400, 'FIELD_REQUIRED', 'meetingId is required');
  var body = req.body || {};
  return scheduler.addCase({
    tenantId: req.tenantId,
    meetingId: meetingId,
    patientId: body.patientId,
    diagnosis: body.diagnosis,
    stage: body.stage,
    imaging: body.imaging,
    pathology: body.pathology,
    presenterId: body.presenterId
  });
}));

// GET /meeting/:id
idRouter.get('/meeting/:id', _handler(function (req, res) {
  var meetingId = req.params && req.params.id;
  if (!meetingId) return _err(res, 400, 'FIELD_REQUIRED', 'meetingId is required');
  return scheduler.get({ tenantId: req.tenantId, meetingId: meetingId });
}));

// GET /meeting/:id/minutes
idRouter.get('/meeting/:id/minutes', _handler(function (req, res) {
  var meetingId = req.params && req.params.id;
  if (!meetingId) return _err(res, 400, 'FIELD_REQUIRED', 'meetingId is required');
  return scheduler.minutes({ tenantId: req.tenantId, meetingId: meetingId });
}));

// =========================================================================
// POST /api/v4/mdt/case/:id/decision — hash-chained MDT decision
// =========================================================================
const decisionRouter = RouteFactory.create({
  base: '/api/v4/mdt/case',
  tenantScoped: true,
  auth: { roles: ['doctor', 'oncologist', 'admin', 'specialist'] },
  methods: {
    POST: {
      handler: function (ctx) {
        var body = ctx.body || {};
        var caseId = ctx.params && ctx.params.id;
        if (!caseId) throw new Error('FIELD_REQUIRED:caseId');
        return scheduler.decision({
          tenantId: ctx.tenantId,
          caseId: caseId,
          meetingId: body.meetingId,
          decision: body.decision,
          rationale: body.rationale,
          actorId: (ctx.user && (ctx.user.userId || ctx.user.id)) || null
        });
      }
    }
  }
});

// =========================================================================
// GET /api/v4/mdt/upcoming
// =========================================================================
const upcomingRouter = RouteFactory.create({
  base: '/api/v4/mdt/upcoming',
  tenantScoped: true,
  auth: { roles: ['doctor', 'oncologist', 'admin', 'nurse', 'specialist'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return scheduler.upcoming({
          tenantId: ctx.tenantId,
          today: (ctx.query && ctx.query.today) || undefined
        });
      }
    }
  }
});

module.exports = {
  router: express.Router({ mergeParams: true })
    .use('/', scheduleRouter)
    .use('/', idRouter)
    .use('/', decisionRouter)
    .use('/', upcomingRouter),
  schedule: scheduleRouter,
  id: idRouter,
  decision: decisionRouter,
  upcoming: upcomingRouter,
  _scheduler: scheduler,
  _slides: slides,
  _storage: storage
};
