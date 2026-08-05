// routes/homeHealth.js
// Home Health Visit Scheduling API (P19).
// Wires HomeVisitScheduler + OfflineSync to:
//   POST /api/v4/home-health/slot
//   POST /api/v4/home-health/slot/:id/book
//   POST /api/v4/home-health/slot/:id/cancel
//   POST /api/v4/home-health/visit/:id/check-in      (GPS verified server-side)
//   POST /api/v4/home-health/visit/:id/complete
//   GET  /api/v4/home-health/nurse-route/:nurseId/:date
//   POST /api/v4/home-health/offline-sync
//   GET  /api/v4/home-health/visits
//   GET  /api/v4/home-health/slots
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), GPS within radius verified
// server-side (RAIL-9), no PHI (RAIL-12), fail-closed (RAIL-11).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const Storage = require('../lib/homeHealth/storage');
const SchedulerMod = require('../lib/homeHealth/scheduler');
const OfflineSyncMod = require('../lib/homeHealth/offlineSync').OfflineSync || require('../lib/homeHealth/offlineSync');

const storage = Storage.newHomeHealthStorage();
const scheduler = new SchedulerMod({ storage: storage, radiusMeters: 200 });
const offline = new OfflineSyncMod({ storage: storage });

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['nurse', 'doctor', 'admin', 'dispatcher', 'home_health_coordinator'])) return;
  if (typeof next === 'function') next();
}

function nurseOrAdmin(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['nurse', 'admin', 'home_health_coordinator', 'dispatcher'])) return;
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
          if (/TENANT|FIELD|TIME|DATE|NURSE|SERVICE|PATIENT|VISIT|SLOT|GPS|OUT_OF_RANGE|INVALID|REQUIRED/i.test(msg)) {
            return _err(res, 400, 'BAD_REQUEST', msg);
          }
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

// =========================================================================
// /api/v4/home-health/slot  — create available slot
// =========================================================================
const slotCreateRouter = RouteFactory.create({
  base: '/api/v4/home-health/slot',
  tenantScoped: true,
  auth: { roles: ['admin', 'dispatcher', 'home_health_coordinator', 'nurse'] },
  methods: {
    POST: {
      input: ['date', 'startTime', 'endTime', 'nurseId'],
      handler: function (ctx) {
        var input = ctx.input;
        return scheduler.createSlot({
          tenantId: ctx.tenantId,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          nurseId: input.nurseId,
          location: input.location,
          geo: input.geo
        });
      }
    }
  }
});

// =========================================================================
// /api/v4/home-health/slots  — list slots
// =========================================================================
const slotListRouter = RouteFactory.create({
  base: '/api/v4/home-health/slots',
  tenantScoped: true,
  auth: { roles: ['admin', 'dispatcher', 'home_health_coordinator', 'nurse', 'doctor'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return scheduler.listSlots({
          tenantId: ctx.tenantId,
          date: ctx.query && ctx.query.date,
          nurseId: ctx.query && ctx.query.nurseId,
          status: ctx.query && ctx.query.status
        });
      }
    }
  }
});

// =========================================================================
// /api/v4/home-health/visits  — list visits
// =========================================================================
const visitListRouter = RouteFactory.create({
  base: '/api/v4/home-health/visits',
  tenantScoped: true,
  auth: { roles: ['admin', 'dispatcher', 'home_health_coordinator', 'nurse', 'doctor'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return scheduler.list({
          tenantId: ctx.tenantId,
          dateFrom: ctx.query && ctx.query.dateFrom,
          dateTo: ctx.query && ctx.query.dateTo,
          nurseId: ctx.query && ctx.query.nurseId,
          patientId: ctx.query && ctx.query.patientId,
          status: ctx.query && ctx.query.status
        });
      }
    }
  }
});

// =========================================================================
// /api/v4/home-health/offline-sync  — batch sync from mobile
// =========================================================================
const offlineSyncRouter = RouteFactory.create({
  base: '/api/v4/home-health/offline-sync',
  tenantScoped: true,
  auth: { roles: ['nurse', 'admin', 'home_health_coordinator'] },
  methods: {
    POST: {
      input: [],
      handler: function (ctx) {
        var queue = (ctx.body && Array.isArray(ctx.body.queue)) ? ctx.body.queue : [];
        return offline.sync({ tenantId: ctx.tenantId, queue: queue });
      }
    }
  }
});

// =========================================================================
// /api/v4/home-health/slot/:id/book
// /api/v4/home-health/slot/:id/cancel
// /api/v4/home-health/visit/:id/check-in
// /api/v4/home-health/visit/:id/complete
// /api/v4/home-health/nurse-route/:nurseId/:date
// =========================================================================
const router = express.Router();

router.use(roleGuard);
router.use(tenantGuard);

router.post('/api/v4/home-health/slot/:id/book',
  _handler(function (req) {
    var body = req.body || {};
    return scheduler.bookSlot({
      slotId: req.params.id,
      patientId: body.patientId,
      serviceType: body.serviceType,
      requestedAt: body.requestedAt
    });
  })
);

router.post('/api/v4/home-health/slot/:id/cancel',
  _handler(function (req) {
    var body = req.body || {};
    return scheduler.cancelSlot({ slotId: req.params.id, reason: body.reason });
  })
);

router.post('/api/v4/home-health/visit/:id/check-in',
  _handler(function (req) {
    var body = req.body || {};
    var lat = Number(body.lat);
    var lng = Number(body.lng);
    if (!isFinite(lat) || !isFinite(lng)) throw new Error('GPS_INVALID');
    var radius = body.radiusMeters ? Number(body.radiusMeters) : 200;
    return scheduler.gpsCheckIn({
      visitId: req.params.id,
      lat: lat,
      lng: lng,
      radiusMeters: radius
    });
  })
);

router.post('/api/v4/home-health/visit/:id/complete',
  _handler(function (req) {
    var body = req.body || {};
    return scheduler.complete({
      visitId: req.params.id,
      notes: body.notes,
      signatureHash: body.signatureHash
    });
  })
);

router.get('/api/v4/home-health/nurse-route/:nurseId/:date',
  _handler(function (req) {
    return scheduler.nurseRoute({
      tenantId: req.tenantId,
      nurseId: req.params.nurseId,
      date: req.params.date
    });
  })
);

router.get('/api/v4/home-health/visit/:id',
  _handler(function (req) {
    var visit = scheduler.getVisit(req.params.id);
    if (!visit) throw new Error('VISIT_NOT_FOUND');
    return visit;
  })
);

module.exports = {
  router: router,
  slotCreateRouter: slotCreateRouter,
  slotListRouter: slotListRouter,
  visitListRouter: visitListRouter,
  offlineSyncRouter: offlineSyncRouter
};
