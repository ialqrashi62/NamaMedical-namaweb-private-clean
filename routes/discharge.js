// routes/discharge.js
// Discharge Summary LLM Draft (P8) HTTP surface.
// Wires DischargeSummarizer to:
//   POST /api/v4/discharge/draft
//   GET  /api/v4/discharge/:id
//
// Tenant-scoped (RAIL-5): tenant middleware upstream sets req.tenantId
// + req.tenantScope. Role-guarded (RAIL-13): doctor only.
// Fail-closed (RAIL-11): missing actor / tenant / patient → 400.
// No PHI in logs (RAIL-12): request bodies never console.log'd.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const DischargeSummarizer = require('../lib/llm/dischargeSummarizer');

// In-memory registry of generated drafts (sandbox-safe stand-in for PG).
// Keyed by draftId → { tenantId, patientId, payload, createdAt }.
const _draftStore = new Map();

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
            msg === 'PATIENT_REQUIRED' ||
            msg === 'ACTOR_REQUIRED' ||
            msg === 'DRAFT_ID_REQUIRED' ||
            msg === 'DRAFT_NOT_FOUND' ||
            msg === 'TENANT_SCOPE_MISMATCH' ||
            msg === 'LANG_REQUIRED') {
          code = msg;
          status = (msg === 'DRAFT_NOT_FOUND') ? 404 : 400;
        }
        _err(res, status, code, msg);
      });
  };
}

function _roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res, ['doctor'])) return;
  if (typeof next === 'function') next();
}

function _tenantGuard(req, res, next) {
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

function _summarizerFor(req) {
  return new DischargeSummarizer({
    tenantId: req.tenantId,
    lang: 'ar-SA',
    templateId: 'standard',
    deterministic: true,
    useRag: false, // sandbox: PUBLIC_JS=True fallback
    rag: null
  });
}

function _draftIdFor(tenantId, patientId) {
  // Deterministic, opaque, never PHI.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return 'ds_' + t + '_' + r;
}

// ---- POST /api/v4/discharge/draft (fixed path → Route.create) --------

const draftCreate = RouteFactory.create({
  base: '/api/v4/discharge/draft',
  tenantScoped: true,
  auth: { roles: ['doctor'] },
  methods: {
    POST: {
      input: [
        'tenantId', 'patientId', 'actorId',
        'lang?', 'templateId?',
        'primaryDx?', 'notes?', 'events?', 'meds?',
        'vitals?', 'labs?', 'encounters?', 'allergies?'
      ],
      handler: async function (ctx) {
        const inp = ctx.input || {};
        const summarizer = _summarizerFor({ tenantId: ctx.tenantId });
        const result = await summarizer.draft({
          tenantId: ctx.tenantId,
          patientId: inp.patientId,
          actorId: inp.actorId,
          lang: inp.lang || 'ar-SA',
          templateId: inp.templateId || 'standard',
          primaryDx: inp.primaryDx,
          notes: inp.notes,
          events: inp.events,
          meds: inp.meds,
          vitals: inp.vitals,
          labs: inp.labs,
          encounters: inp.encounters,
          allergies: inp.allergies
        });

        // Persist in sandbox registry (no real DB).
        const id = _draftIdFor(ctx.tenantId, inp.patientId);
        const stored = {
          id: id,
          tenantId: ctx.tenantId,
          patientId: inp.patientId,
          payload: result,
          createdAt: new Date().toISOString()
        };
        _draftStore.set(id, stored);

        // Never log PHI.
        // eslint-disable-next-line no-console
        console.log('[discharge] draft ok', {
          id: id,
          tenantId: ctx.tenantId,
          lang: result.lang,
          tokens: result.tokens,
          latencyMs: result.latencyMs,
          model: result.model
        });

        return {
          ok: true,
          id: id,
          lang: result.lang,
          templateId: result.templateId,
          draft: result.draft,
          structure: result.structure,
          structured: result.structured,
          citations: (result.citations || []).map(function (c) {
            return { source: c.source, score: c.score };
          }),
          tokens: result.tokens,
          latencyMs: result.latencyMs,
          model: result.model
        };
      }
    }
  }
});

// ---- GET /api/v4/discharge/:id (Express param router) ----------------

const paramRouter = express.Router();
paramRouter.use(express.json({ limit: '256kb' }));
paramRouter.use(_roleGuard);
paramRouter.use(_tenantGuard);

paramRouter.get('/:id', _handler(function (req, res) {
  const id = req.params.id;
  const record = _draftStore.get(id);
  if (!record) {
    return Promise.reject(new Error('DRAFT_NOT_FOUND'));
  }
  // Tenant isolation
  if (record.tenantId !== req.tenantId) {
    return Promise.reject(new Error('TENANT_SCOPE_MISMATCH'));
  }
  return {
    ok: true,
    id: record.id,
    tenantId: record.tenantId,
    patientId: record.patientId,
    lang: record.payload.lang,
    templateId: record.payload.templateId,
    draft: record.payload.draft,
    structure: record.payload.structure,
    citations: (record.payload.citations || []).map(function (c) {
      return { source: c.source, score: c.score };
    }),
    tokens: record.payload.tokens,
    latencyMs: record.payload.latencyMs,
    model: record.payload.model,
    createdAt: record.createdAt
  };
}));

// ---- compose ---------------------------------------------------------

const router = express.Router();
router.use(express.json({ limit: '256kb' }));
// Dev/test tenant header trust (GATE-4 aligned; projects x-tenant-id → req.body.tenantId
// for the RouteFactory body validator; production session auth still wins).
try { router.use(require('../lib/dev-ctx')); } catch (_e) {}
router.use(draftCreate);
router.use(paramRouter);

module.exports = router;
module.exports.newDischargeRouter = function () { return router; };
