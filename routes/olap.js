// routes/olap.js
// P6 OLAP + Reporting — HTTP surface.
// Wires the materialized-views catalog, queryRunner and refresh
// scheduler to a small Express router.
//
// Endpoints (all under /api/v4/olap):
//   GET  /views                  → list available views
//   GET  /query?view=...&from=...&to=...&...   → run a view
//   GET  /export?view=...&format=csv|json     → export rows
//   POST /refresh/:view          → refresh now
//   GET  /refresh/:view/history  → last N refreshes (cap 30d)
//
// Tenant-scoped (RAIL-5): middleware requires req.tenantId +
// req.tenantScope before any handler runs. Role-guarded: admin /
// doctor / analyst (RAIL-13). Fail-closed: missing tenant → 400
// (RAIL-11). Aggregates contain no PHI (RAIL-12).

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const MaterializedViews = require('../lib/olap/materializedViews');
const OlapQueryRunner = require('../lib/olap/queryRunner');
const ViewRefresh = require('../lib/olap/refresh');

const runner = new OlapQueryRunner();
const refreshSvc = new ViewRefresh();

// Pre-register default refresh schedules (idempotent on boot).
(function defaultSchedules() {
  var views = MaterializedViews.list();
  for (var i = 0; i < views.length; i++) {
    var v = MaterializedViews.get(views[i]);
    if (v && v.refresh) {
      try { refreshSvc.schedule({ view: views[i], cron: v.refresh }); } catch (_e) { /* ignore */ }
    }
  }
})();

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
        var msg = (e && e.message) || 'INTERNAL';
        var status = 500;
        if (msg === 'TENANT_REQUIRED' || msg === 'VIEW_REQUIRED' ||
            msg === 'CRON_REQUIRED' || msg === 'VIEW_NOT_FOUND' ||
            msg === 'FORMAT_UNSUPPORTED') {
          status = (msg === 'VIEW_NOT_FOUND' || msg === 'FORMAT_UNSUPPORTED') ? 404 : 400;
        }
        _err(res, status, msg, msg);
      });
  };
}

function _paramsFromQuery(q) {
  var p = {};
  if (q && typeof q.from === 'string') p.from = q.from;
  if (q && typeof q.to === 'string') p.to = q.to;
  return p;
}

function _filterFromQuery(q) {
  if (!q) return null;
  var keys = Object.keys(q).filter(function (k) {
    return k !== 'view' && k !== 'from' && k !== 'to' && k !== 'format' && k !== 'limit' && k !== 'tenantId';
  });
  if (keys.length === 0) return null;
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var raw = q[k];
    var num = Number(raw);
    if (raw !== '' && !isNaN(num) && String(num) === String(raw)) {
      out[k] = num;
    } else {
      out[k] = raw;
    }
  }
  return out;
}

// ---- parameterised middleware for /refresh/:view --------------------

function paramTenantGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'analyst'])) return;
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

// ---- fixed-path routes (via factory) --------------------------------

// GET /api/v4/olap/views
const viewsRouter = RouteFactory.create({
  base: '/api/v4/olap/views',
  tenantScoped: true,
  auth: { roles: ['admin', 'doctor', 'analyst'] },
  methods: {
    GET: {
      handler: function (ctx) {
        return runner.list({ tenantId: ctx.tenantId });
      }
    }
  }
});

// GET /api/v4/olap/query
const queryRouter = RouteFactory.create({
  base: '/api/v4/olap/query',
  tenantScoped: true,
  auth: { roles: ['admin', 'doctor', 'analyst'] },
  methods: {
    GET: {
      handler: function (ctx) {
        var q = ctx.query || {};
        var view = q.view;
        if (!view) throw new Error('VIEW_REQUIRED');
        return {
          tenantId: ctx.tenantId,
          view: view,
          explain: runner.explain({ tenantId: ctx.tenantId, view: view }),
          rows: runner.run({
            tenantId: ctx.tenantId,
            view: view,
            params: _paramsFromQuery(q),
            filter: _filterFromQuery(q)
          })
        };
      }
    }
  }
});

// GET /api/v4/olap/export
const exportRouter = RouteFactory.create({
  base: '/api/v4/olap/export',
  tenantScoped: true,
  auth: { roles: ['admin', 'doctor', 'analyst'] },
  methods: {
    GET: {
      handler: function (ctx) {
        var q = ctx.query || {};
        var view = q.view;
        if (!view) throw new Error('VIEW_REQUIRED');
        var format = (typeof q.format === 'string' && q.format) ? q.format : 'csv';
        var payload = runner.export({
          tenantId: ctx.tenantId,
          view: view,
          format: format,
          params: _paramsFromQuery(q),
          filter: _filterFromQuery(q)
        });
        if (format.toLowerCase() === 'csv') {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="' + view + '.csv"');
          res.status(200).send(payload);
          return undefined; // tell factory not to also json()
        }
        return { view: view, format: format, payload: payload };
      }
    }
  }
});

// ---- parameterised routes (/refresh/:view) --------------------------

const paramRouter = express.Router();

paramRouter.post('/api/v4/olap/refresh/:view',
  paramTenantGuard,
  _handler(function (req, res) {
    var view = req.params && req.params.view;
    if (!view) throw new Error('VIEW_REQUIRED');
    return refreshSvc.run({ view: view });
  })
);

paramRouter.get('/api/v4/olap/refresh/:view/history',
  paramTenantGuard,
  _handler(function (req, res) {
    var view = req.params && req.params.view;
    if (!view) throw new Error('VIEW_REQUIRED');
    var limit = 10;
    if (req.query && req.query.limit) {
      var n = Number(req.query.limit);
      if (!isNaN(n) && n > 0) limit = Math.floor(n);
    }
    return {
      view: view,
      tenantId: req.tenantId,
      count: refreshSvc.history({ view: view, limit: limit }).length,
      history: refreshSvc.history({ view: view, limit: limit })
    };
  })
);

// ---- compose into single mountable router ---------------------------

function olapRouter() {
  var r = express.Router();
  r.use(viewsRouter);
  r.use(queryRouter);
  r.use(exportRouter);
  r.use(paramRouter);
  return r;
}

// Default export: pre-built composed router (so autowire level 2 picks up .default).
var _composedRouter = olapRouter();

module.exports = {
  default: _composedRouter,
  router: _composedRouter,
  olapRouter: olapRouter,
  // Exposed for tests / direct mounting.
  viewsRouter: viewsRouter,
  queryRouter: queryRouter,
  exportRouter: exportRouter,
  paramRouter: paramRouter,
  // Singletons for ops scripts / tests.
  runner: runner,
  refreshSvc: refreshSvc
};
