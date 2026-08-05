'use strict';
// Routes: ISO 27001, HIPAA, BAA. v4 surface.
// Tenant-scoped (RAIL-5), role-gated (admin/compliance).

const RF = require('../lib/route-factory');
const ISO = require('../lib/compliance/iso27001');
const HIPAA = require('../lib/compliance/hipaa');
const { newBAAManager } = require('../lib/compliance/baa');

function newComplianceRouter() {
  const baaMgr = newBAAManager();
  const adminAuth = { roles: ['admin', 'compliance', 'ciso'] };

  // ISO 27001
  const isoRouter = RF.create({
    base: '/api/v4/compliance/iso27001',
    tenantScoped: true,
    auth: adminAuth,
    methods: {
      GET: {
        handler: function (ctx) {
          const base = ctx.params && ctx.params[0] ? ctx.params[0] : 'controls';
          if (base === 'controls') {
            return ISO.listControls(ctx.tenantId);
          }
          if (base === 'audit-readiness') {
            return ISO.auditReadiness(ctx.tenantId);
          }
          return { ok: false, error: 'NOT_FOUND' };
        }
      }
    }
  });

  // HIPAA
  const hipaaRouter = RF.create({
    base: '/api/v4/compliance/hipaa',
    tenantScoped: true,
    auth: adminAuth,
    methods: {
      GET: {
        handler: function (ctx) {
          return HIPAA.listSafeguards(ctx.tenantId);
        }
      }
    }
  });

  // BAA
  const baaRouter = RF.create({
    base: '/api/v4/compliance/baa',
    tenantScoped: true,
    auth: adminAuth,
    methods: {
      GET: {
        handler: function (ctx) {
          const path = (ctx.req && ctx.req.path) ? ctx.req.path : '';
          if (path.indexOf('/expiring') !== -1) {
            const d = parseInt(ctx.query.days, 10);
            return baaMgr.expiring(ctx.tenantId, isNaN(d) ? 30 : d);
          }
          return baaMgr.active(ctx.tenantId);
        }
      },
      POST: {
        input: ['vendor', 'scope', 'signedBy', 'signedAt', 'expiresAt'],
        handler: function (ctx) {
          return baaMgr.register(Object.assign({ tenantId: ctx.tenantId }, ctx.input));
        }
      },
      DELETE: {
        input: ['baaId', 'reason'],
        handler: function (ctx) {
          return baaMgr.revoke(ctx.input);
        }
      }
    }
  });

  return {
    isoRouter: isoRouter,
    hipaaRouter: hipaaRouter,
    baaRouter: baaRouter,
    mount: function (app) {
      if (!app || typeof app.use !== 'function') return;
      app.use(isoRouter);
      app.use(hipaaRouter);
      // Mount BAA router on /api/v4/compliance/baa explicitly (support /expiring)
      const expressLib = (function () {
        try { return require('express'); } catch (_e) { return null; }
      })();
      if (expressLib && typeof expressLib.Router === 'function') {
        const r = expressLib.Router();
        r.get('/api/v4/compliance/baa', function (req, res, next) {
          req.path = '/api/v4/compliance/baa';
          baaRouter.stack && baaRouter.stack.forEach(function (s) { /* noop */ });
          // delegate by re-invoking handler context
          const ctx = { tenantId: req.tenantId, tenantScope: req.tenantScope, user: req.user, query: req.query, input: req.query, body: req.body, params: req.params, req: req };
          const out = baaMgr.active(ctx.tenantId);
          res.json(out);
        });
        r.get('/api/v4/compliance/baa/expiring', function (req, res) {
          const d = parseInt(req.query.days, 10);
          res.json(baaMgr.expiring(req.tenantId, isNaN(d) ? 30 : d));
        });
        r.post('/api/v4/compliance/baa', function (req, res) {
          const b = req.body || {};
          for (const f of ['vendor', 'scope', 'signedBy', 'signedAt', 'expiresAt']) {
            if (!b[f]) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'Field ' + f + ' is required' });
          }
          res.json(baaMgr.register(Object.assign({ tenantId: req.tenantId }, b)));
        });
        app.use(r);
      } else {
        app.use(baaRouter);
      }
    }
  };
}

module.exports = { newComplianceRouter };
