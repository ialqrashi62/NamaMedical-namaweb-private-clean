// routes/billing_v2.js
// P7 — Multi-Currency Billing HTTP surface.
//
// Wires InvoiceEngine to:
//   POST /api/v4/billing/invoice          create (idempotent, RAIL-6)
//   GET  /api/v4/billing/invoice          list (tenant-scoped, optional ?currency=)
//   GET  /api/v4/billing/invoice/:id      get one
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13: billing/billing_admin),
// fail-closed (RAIL-11), no PHI in logs (RAIL-12).
//
// Idempotency on POST:
//   * Honour the `Idempotency-Key` request header when present.
//   * Otherwise derive a deterministic key from
//     (tenantId+patientId+items+ccy+fxDate) — see lib/billing/invoice.js.
//   * On replay, return the original invoice with `idem_replay: true`.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards  = require('../lib/route-guards');
const { InvoiceEngine } = require('../lib/billing/invoice');
const Currency = require('../lib/billing/currency');

// Single engine instance — it carries the in-process audit chain.
// Storage is module-scoped (see lib/billing/storage.js).
const _engine = new InvoiceEngine();

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
        const raw = (e && e.message) || 'INTERNAL';
        let code = raw;
        let status = 500;
        if (raw === 'TENANT_REQUIRED' ||
            raw === 'PATIENT_REQUIRED' ||
            raw === 'ITEMS_REQUIRED' ||
            raw === 'ITEM_INVALID' ||
            raw === 'INVOICE_ID_REQUIRED' ||
            raw.indexOf('CURRENCY_UNSUPPORTED') === 0) {
          status = 400;
          code = raw;
        } else if (raw === 'INVOICE_NOT_FOUND') {
          status = 404;
          code = raw;
        }
        _err(res, status, code, raw);
      });
  };
}

function _roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  // Owner/Admin always pass (Golden Access Rule, RAIL-13).
  const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
  const isOwner = roles.indexOf('owner') !== -1 || roles.indexOf('admin') !== -1;
  if (!isOwner && !RouteGuards.requireRole(req, res, ['billing', 'cashier', 'reception'])) return;
  if (typeof next === 'function') next();
}

function _tenantGuard(req, res, next) {
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

// --------------------------------------------------------------------
// POST /api/v4/billing/invoice
// --------------------------------------------------------------------
const createInvoice = RouteFactory.create({
  base: '/api/v4/billing/invoice',
  tenantScoped: true,
  auth: { roles: ['billing', 'cashier', 'reception'] },
  methods: {
    POST: {
      input: ['tenantId', 'patientId', 'items', 'currencyCode?', 'fxDate?', 'note?'],
      handler: async function (ctx) {
        const inp = ctx.input || {};
        const idemHeader = (ctx.req && ctx.req.headers)
          ? (ctx.req.headers['idempotency-key'] || ctx.req.headers['x-idempotency-key'] || null)
          : null;
        const items = Array.isArray(inp.items) ? inp.items : [];
        const created = _engine.create({
          tenantId: ctx.tenantId,
          patientId: inp.patientId,
          items: items,
          currencyCode: inp.currencyCode || 'SAR',
          fxDate: inp.fxDate ? new Date(inp.fxDate) : new Date(),
          idempotencyKey: idemHeader,
          actorId: (ctx.user && (ctx.user.userId || ctx.user.id)) || null,
          note: inp.note || null
        });
        return {
          ok: true,
          invoice: created
        };
      }
    }
  }
});

// --------------------------------------------------------------------
// GET /api/v4/billing/invoice          (list, ?currency=, ?q=, ?limit=)
// GET /api/v4/billing/invoice/:id      (one)
// --------------------------------------------------------------------
const paramRouter = express.Router();
paramRouter.use(express.json({ limit: '256kb' }));
paramRouter.use(_roleGuard);
paramRouter.use(_tenantGuard);

paramRouter.get('/', _handler(function (req, res) {
  const currency = req.query && req.query.currency ? String(req.query.currency).toUpperCase() : null;
  if (currency && !Currency.get(currency)) {
    return Promise.reject(new Error('CURRENCY_UNSUPPORTED:' + currency));
  }
  const q = req.query && req.query.q ? String(req.query.q) : null;
  const limit = req.query && req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const offset = req.query && req.query.offset ? parseInt(req.query.offset, 10) : 0;
  const items = _engine.list(req.tenantId, { currency: currency, q: q, limit: limit, offset: offset });
  return { ok: true, count: items.length, items: items };
}));

paramRouter.get('/:id', _handler(function (req, res) {
  const inv = _engine.get(req.tenantId, req.params.id);
  if (!inv) return Promise.reject(new Error('INVOICE_NOT_FOUND'));
  return { ok: true, invoice: inv };
}));

paramRouter.post('/:id/void', _handler(function (req, res) {
  const reason = (req.body && req.body.reason) ? String(req.body.reason) : null;
  const inv = _engine.voidInvoice(req.tenantId, req.params.id, reason);
  if (!inv) return Promise.reject(new Error('INVOICE_NOT_FOUND'));
  return { ok: true, invoice: inv };
}));

// --------------------------------------------------------------------
// Compose
// --------------------------------------------------------------------
const router = express.Router();
router.use(express.json({ limit: '256kb' }));
router.use(createInvoice);
router.use(paramRouter);

module.exports = router;
module.exports.newBillingV2Router = function () { return router; };
module.exports._engine = _engine;
