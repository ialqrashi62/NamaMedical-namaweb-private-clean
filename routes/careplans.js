// routes/careplans.js
// Care Plans + Order Sets (P5) HTTP surface.
// Wires CarePlanEngine to:
//   POST /api/v4/careplans/apply
//   POST /api/v4/careplans/:id/progress
//   GET  /api/v4/careplans/:id/adherence
//   GET  /api/v4/careplans/active
//
// Tenant-scoped (RAIL-5): tenant middleware upstream sets req.tenantId
// + req.tenantScope. Role-guarded (RAIL-13): doctor / nurse only.
// Fail-closed (RAIL-11): missing actor / tenant / plan → 400.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const CarePlanEngine = require('../lib/careplans/engine');
const ORDER_SETS = require('../lib/careplans/orderSets');

const engine = new CarePlanEngine();

// Reusable role guard middleware (doctor/nurse), mounted on routes that
// use :id params (Route.create can't bind to a single dynamic path).
function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'nurse'])) return;
  if (typeof next === 'function') next();
}

function tenantGuard(req, res, next) {
  // Route.create auto-enforces tenantId + tenantScope via its own
  // tenantScopeMiddleware, but we expose a stand-alone check here too
  // for the parameterised routes that don't go through the factory.
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

function _actorFromReq(req) {
  const user = req && req.user;
  if (!user) return { actorId: null, actorRoles: [] };
  return {
    actorId: user.userId || user.id || user.username || null,
    actorRoles: Array.isArray(user.roles) ? user.roles : []
  };
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
      .catch(function (e) {
        const msg = (e && e.message) || 'INTERNAL';
        let code = msg;
        let status = 500;
        if (msg === 'TENANT_REQUIRED' ||
            msg === 'PLAN_ID_REQUIRED' ||
            msg === 'PATIENT_REQUIRED' ||
            msg === 'SET_ID_REQUIRED' ||
            msg === 'ITEM_CODE_REQUIRED' ||
            msg === 'STATUS_REQUIRED' ||
            msg === 'STATUS_INVALID' ||
            msg === 'ACTOR_REQUIRED' ||
            msg === 'ORDER_SET_UNKNOWN' ||
            msg === 'PLAN_NOT_FOUND' ||
            msg === 'TENANT_SCOPE_MISMATCH' ||
            msg === 'PLAN_INACTIVE' ||
            msg === 'ITEM_NOT_FOUND') {
          code = msg;
          status = (msg === 'PLAN_NOT_FOUND' || msg === 'ORDER_SET_UNKNOWN') ? 404 : 400;
        }
        _err(res, status, code, msg);
      });
  };
}

// ---- endpoints that fit Route.create (fixed paths) --------------------

const applyCreate = RouteFactory.create({
  base: '/api/v4/careplans/apply',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse'] },
  methods: {
    POST: {
      input: ['tenantId?', 'patientId', 'setId', 'actorId?'],
      handler: function (ctx) {
        const user = ctx.user || {};
        const actorId = (ctx.input && ctx.input.actorId)
          || user.userId || user.id || user.username;
        const actorRoles = Array.isArray(user.roles) ? user.roles : [];
        return engine.apply({
          tenantId: ctx.tenantId,
          patientId: ctx.input.patientId,
          setId: ctx.input.setId,
          actorId: actorId,
          actorRoles: actorRoles
        });
      }
    }
  }
});

// Active list — also a fixed path, gets its own router via Route.create.
const activeCreate = RouteFactory.create({
  base: '/api/v4/careplans/active',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return engine.list({ tenantId: ctx.tenantId });
      }
    }
  }
});

// ---- endpoints with :id param (Express router, same role/tenant guard)

// Progress: POST /api/v4/careplans/:id/progress
// Adherence: GET /api/v4/careplans/:id/adherence
const paramRouter = express.Router();
paramRouter.use(express.json({ limit: '256kb' }));
paramRouter.use(roleGuard);
paramRouter.use(tenantGuard);

paramRouter.post('/:id/progress', _handler(function (req, res) {
  const actor = _actorFromReq(req);
  const body = req.body || {};
  return engine.progress({
    tenantId: req.tenantId,
    planId: req.params.id,
    itemCode: body.itemCode,
    status: body.status,
    note: body.note || null,
    actorId: actor.actorId,
    actorRoles: actor.actorRoles
  });
}));

paramRouter.get('/:id/adherence', _handler(function (req, res) {
  return engine.adherence({
    tenantId: req.tenantId,
    planId: req.params.id
  });
}));

// ---- bundle catalogue (read-only metadata; tenant-agnostic) ----------
// Exposed under /api/v4/careplans/bundles so a UI can list available
// order sets without needing tenant context.

const bundlesRouter = express.Router();
bundlesRouter.get('/bundles', (req, res) => {
  res.json({ bundles: ORDER_SETS.ORDER_SETS, count: ORDER_SETS.listIds().length });
});
bundlesRouter.get('/bundles/:setId', (req, res) => {
  const s = ORDER_SETS.get(req.params.setId);
  if (!s) return res.status(404).json({ error: 'ORDER_SET_UNKNOWN', msg: req.params.setId });
  res.json(s);
});

// ---- compose ------------------------------------------------------------

const router = express.Router();
router.use(express.json({ limit: '256kb' }));
router.use(applyCreate);
router.use(activeCreate);
router.use(paramRouter);
router.use(bundlesRouter);

module.exports = router;
module.exports.newCarePlansRouter = function () { return router; };
