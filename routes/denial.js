// routes/denial.js
// Denial Worklist API (P18).
// Wires DenialClassifier + DenialWorklist + DenialAppeals to:
//   POST /api/v4/denial/worklist
//   POST /api/v4/denial/worklist/:id/classify
//   POST /api/v4/denial/worklist/:id/assign
//   POST /api/v4/denial/worklist/:id/appeal
//   POST /api/v4/denial/worklist/:id/resolve
//   GET  /api/v4/denial/worklist
//   GET  /api/v4/denial/metrics
//   GET  /api/v4/denial/codes
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), hash-chained appeals
// (RAIL-10), no PHI (RAIL-12), fail-closed (RAIL-11).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const Classifier = require('../lib/denial/classifier');
const WorklistMod = require('../lib/denial/worklist');

const worklist = new WorklistMod();

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor', 'nurse', 'admin', 'biller', 'claims_specialist'])) return;
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
          if (/TENANT|FIELD|CLAIM|PAYER|WORK|SUBMITTER|ASSIGNEE|RESOLUTION|NOT_APPEALABLE|UNKNOWN_DENIAL/i.test(msg)) {
            return _err(res, 400, 'BAD_REQUEST', msg);
          }
          _err(res, 500, 'INTERNAL', msg);
        }
      });
  };
}

function _actorFromReq(req) {
  const user = req && req.user;
  if (!user) return null;
  return user.userId || user.id || user.username || null;
}

// =========================================================================
// /api/v4/denial/codes  — list denial codes + categories (helper)
// =========================================================================
const codesRouter = RouteFactory.create({
  base: '/api/v4/denial/codes',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse', 'admin', 'biller', 'claims_specialist'] },
  methods: {
    GET: {
      handler: function () {
        return {
          ok: true,
          codes: Classifier.listCodes(),
          categories: Classifier.listCategories(),
          byCode: Classifier.DENIAL_CODES
        };
      }
    }
  }
});

// =========================================================================
// /api/v4/denial/metrics  — worklist metrics (uses query for period)
// =========================================================================
const metricsRouter = RouteFactory.create({
  base: '/api/v4/denial/metrics',
  tenantScoped: true,
  auth: { roles: ['admin', 'biller', 'claims_specialist', 'doctor'] },
  methods: {
    GET: {
      handler: function (ctx) {
        var period = (ctx.query && ctx.query.period) || 'all';
        return worklist.metrics({ tenantId: ctx.tenantId, period: period });
      }
    }
  }
});

// =========================================================================
// /api/v4/denial/worklist  — list (GET) + create (POST)
// =========================================================================
const worklistRouter = RouteFactory.create({
  base: '/api/v4/denial/worklist',
  tenantScoped: true,
  auth: { roles: ['doctor', 'nurse', 'admin', 'biller', 'claims_specialist'] },
  methods: {
    GET: {
      handler: function (ctx) {
        var status = ctx.query && ctx.query.status;
        var category = ctx.query && ctx.query.category;
        var assignedTo = ctx.query && ctx.query.assignedTo;
        return worklist.list({
          tenantId: ctx.tenantId,
          status: status,
          category: category,
          assignedTo: assignedTo
        });
      }
    },
    POST: {
      input: ['claimId', 'denialCode', 'amount', 'payerId', 'receivedAt?'],
      handler: function (ctx) {
        var input = ctx.input;
        return worklist.add({
          tenantId: ctx.tenantId,
          claimId: input.claimId,
          denialCode: input.denialCode,
          amount: input.amount,
          payerId: input.payerId,
          receivedAt: input.receivedAt ? new Date(input.receivedAt).toISOString() : undefined
        });
      }
    }
  }
});

// =========================================================================
// /api/v4/denial/worklist/:id/classify
// /api/v4/denial/worklist/:id/assign
// /api/v4/denial/worklist/:id/appeal
// /api/v4/denial/worklist/:id/resolve
// =========================================================================
const router = express.Router();

router.use(roleGuard);
router.use(tenantGuard);

router.post('/api/v4/denial/worklist/:id/classify',
  _handler(function (req) {
    return worklist.classify({ workId: req.params.id });
  })
);

router.post('/api/v4/denial/worklist/:id/assign',
  _handler(function (req) {
    var body = req.body || {};
    if (!body.assignedTo) {
      throw new Error('ASSIGNEE_REQUIRED');
    }
    return worklist.assign({ workId: req.params.id, assignedTo: body.assignedTo });
  })
);

router.post('/api/v4/denial/worklist/:id/appeal',
  _handler(function (req) {
    var body = req.body || {};
    var actor = _actorFromReq(req);
    if (!actor) {
      // Force submission to be attributable; fall back to a claims-specialist marker
      // only if the gateway stripped the user — we don't want silent unattributed letters.
      actor = body.submitterId || 'unknown';
    }
    return worklist.appeal({
      workId: req.params.id,
      template: body.template,
      customText: body.customText,
      submitterId: actor,
      clinicalRationale: body.clinicalRationale,
      payerName: body.payerName,
      patientRef: body.patientRef,
      submitterName: body.submitterName || (req.user && req.user.fullName) || '',
      submitterRole: body.submitterRole || 'Claims Specialist'
    });
  })
);

router.post('/api/v4/denial/worklist/:id/resolve',
  _handler(function (req) {
    var body = req.body || {};
    return worklist.resolve({
      workId: req.params.id,
      resolution: body.resolution,
      notes: body.notes
    });
  })
);

router.get('/api/v4/denial/worklist/:id/appeals',
  _handler(function (req) {
    return worklist.appealHistory({ workId: req.params.id });
  })
);

module.exports = {
  router: router,
  codesRouter: codesRouter,
  metricsRouter: metricsRouter,
  worklistRouter: worklistRouter
};
