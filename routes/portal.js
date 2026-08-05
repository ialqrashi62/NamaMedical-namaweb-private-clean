// routes/portal.js
// ============================================================================
// P4 Patient Portal — Express router for the patient self-service portal.
//
// Wires:
//   lib/route-factory.create()  → Express router with input validation +
//                                 try/catch + JSON error envelopes
//   lib/route-guards            → requireTenant + requireTenantScope helpers
//
// Endpoints (all tenant-scoped, fail-closed on missing tenantId):
//   POST /api/v4/portal/register        → register new patient (PDPL gate)
//   POST /api/v4/portal/login           → patient self-login
//   GET  /api/v4/portal/appointments    → upcoming + past (auth required)
//   POST /api/v4/portal/appointments    → book appointment (auth required)
//   GET  /api/v4/portal/results         → lab + rad, last 90d (auth)
//   POST /api/v4/portal/pay             → mark invoice paid (auth)
//   GET  /api/v4/portal/profile         → view profile (auth)
//   POST /api/v4/portal/consent         → grant/revoke consent (auth)
//
// Portal auth is independent of staff auth. We use a portal-specific
// "patient" session model via the auth module. The router enforces
// presence of (tenantId, patientId) on every protected call. No PHI is
// logged anywhere here (RAIL-12).
// ============================================================================

'use strict';

const express = require('express');
const { create: createRouter } = require('../lib/route-factory');
const guards = require('../lib/route-guards');
const { newPortalAuth } = require('../lib/portal/auth');
const { newPatientPortal } = require('../lib/portal/portal');
const { newPortalNotifications } = require('../lib/portal/notifications');

function newPortalRouter(opts) {
  const options = opts || {};
  const auth = options.auth || newPortalAuth();
  const notifier = options.notifier || newPortalNotifications();
  const portal = options.portal || newPatientPortal({ auth: auth, notifier: notifier });

  // -------------------------------------------------------------------
  // Helper: extract auth token from Authorization header.
  // -------------------------------------------------------------------
  function authedPatient(req) {
    if (!req || !req.headers) return null;
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (typeof header !== 'string') return null;
    const parts = header.split(/\s+/);
    if (parts.length !== 2) return null;
    if (parts[0].toLowerCase() !== 'bearer') return null;
    try {
      return auth.verify(parts[1]);
    } catch (_e) {
      return null;
    }
  }

  function guardPortalAuth(req, res) {
    if (!guards.requireTenant(req, res)) return false;
    const sess = authedPatient(req);
    if (!sess) {
      if (res && typeof res.status === 'function') {
        res.status(401).json({ error: 'AUTH_REQUIRED', msg: 'Patient auth is required' });
      }
      return false;
    }
    // Tenant context for the protected call comes from the verified session,
    // NOT from request headers. This is the fail-closed tenant-scope rule.
    req.tenantId = sess.tenantId;
    req.tenantScope = { patientId: sess.patientId, mrn: sess.mrn };
    req.user = {
      id: sess.patientId,
      roles: sess.roles || ['patient'],
      tenantId: sess.tenantId
    };
    req.portalSession = sess;
    return true;
  }

  // -------------------------------------------------------------------
  // Wrap the portal-router factory to pass through tenantId + patientId.
  // Each method handler maps the input into the engine's args.
  // -------------------------------------------------------------------
  const router = express.Router();
  if (typeof router.use === 'function') {
    router.use(express.json({ limit: '256kb' }));
  }

  // -- POST /api/v4/portal/register (no auth — public) ----------------
  const registerRouter = createRouter({
    base: '/api/v4/portal/register',
    methods: {
      POST: {
        input: ['tenantId', 'mrn', 'email', 'password', 'name', 'dob', 'consent'],
        handler: function (ctx) {
          if (!guards.requireTenant(ctx.req)) {
            throw new Error('TENANT_REQUIRED');
          }
          const out = auth.register({
            tenantId: ctx.input.tenantId,
            mrn: ctx.input.mrn,
            email: ctx.input.email,
            password: ctx.input.password,
            name: ctx.input.name,
            dob: ctx.input.dob,
            consent: ctx.input.consent
          });
          notifier.send({
            tenantId: ctx.input.tenantId,
            patientId: out.patientId,
            channel: 'email',
            template: 'consent_granted',
            data: { kind: 'pdpl', registration: true }
          });
          return out;
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(registerRouter);

  // -- POST /api/v4/portal/login (no auth — public) -------------------
  const loginRouter = createRouter({
    base: '/api/v4/portal/login',
    methods: {
      POST: {
        input: ['tenantId', 'mrn', 'password'],
        handler: function (ctx) {
          if (!guards.requireTenant(ctx.req)) {
            throw new Error('TENANT_REQUIRED');
          }
          return auth.login({
            tenantId: ctx.input.tenantId,
            mrn: ctx.input.mrn,
            password: ctx.input.password
          });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(loginRouter);

  // -- GET /api/v4/portal/appointments (auth) -------------------------
  const apptsGetRouter = createRouter({
    base: '/api/v4/portal/appointments',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      GET: {
        input: [],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.appointments({ tenantId: tid, patientId: pid });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(apptsGetRouter);

  // -- POST /api/v4/portal/appointments (auth) ------------------------
  const apptsPostRouter = createRouter({
    base: '/api/v4/portal/appointments',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      POST: {
        input: ['slotId', 'specialty'],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.bookAppointment({
            tenantId: tid,
            patientId: pid,
            slotId: ctx.input.slotId,
            specialty: ctx.input.specialty
          });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(apptsPostRouter);

  // -- GET /api/v4/portal/results (auth) ------------------------------
  const resultsRouter = createRouter({
    base: '/api/v4/portal/results',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      GET: {
        input: [],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.results({ tenantId: tid, patientId: pid });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(resultsRouter);

  // -- POST /api/v4/portal/pay (auth) ---------------------------------
  const payRouter = createRouter({
    base: '/api/v4/portal/pay',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      POST: {
        input: ['invoiceId', 'method'],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.payInvoice({
            tenantId: tid,
            patientId: pid,
            invoiceId: ctx.input.invoiceId,
            method: ctx.input.method,
            reference: ctx.input.reference,
            amount: typeof ctx.input.amount === 'number' ? ctx.input.amount : undefined
          });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(payRouter);

  // -- GET /api/v4/portal/profile (auth) ------------------------------
  const profileRouter = createRouter({
    base: '/api/v4/portal/profile',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      GET: {
        input: [],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.profile({ tenantId: tid, patientId: pid });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(profileRouter);

  // -- POST /api/v4/portal/consent (auth) -----------------------------
  const consentRouter = createRouter({
    base: '/api/v4/portal/consent',
    auth: { roles: ['patient'] },
    tenantScoped: true,
    methods: {
      POST: {
        input: ['kind', 'granted'],
        handler: function (ctx) {
          if (!guardPortalAuth(ctx.req)) throw new Error('AUTH_REQUIRED');
          const tid = ctx.portalSession.tenantId;
          const pid = ctx.portalSession.patientId;
          return portal.consent({
            tenantId: tid,
            patientId: pid,
            kind: ctx.input.kind,
            granted: ctx.input.granted === true || ctx.input.granted === 'true'
          });
        }
      }
    }
  });
  if (typeof router.use === 'function') router.use(consentRouter);

  return {
    router: router,
    auth: auth,
    portal: portal,
    notifier: notifier,
    // Exposed for testing or external wiring.
    _guardPortalAuth: guardPortalAuth
  };
}

module.exports = { newPortalRouter };
