'use strict';
// routes/trials.js
// P20 — Clinical Trials E2E HTTP surface (extends F-17 eCRF/randomize).
// Legacy endpoints preserved verbatim below for shipper compatibility:
//   POST /api/v4/trials/ecrf/define
//   POST /api/v4/trials/ecrf/submit
//   POST /api/v4/trials/randomize     (legacy arm assigner)
//
// New P20 endpoints (all under /api/v4/trials/protocol*):
//   POST   /api/v4/trials/protocol                  → define
//   GET    /api/v4/trials/protocols                 → list
//   GET    /api/v4/trials/protocol/:id              → get
//   POST   /api/v4/trials/protocol/:id/amend        → versioned, hash-chained
//   POST   /api/v4/trials/protocol/:id/approve      → IRB gate
//   POST   /api/v4/trials/protocol/:id/close        → close
//   POST   /api/v4/trials/protocol/:id/consent      → ICF / assent
//   POST   /api/v4/trials/protocol/:id/withdraw     → consent withdrawal
//   POST   /api/v4/trials/protocol/:id/enroll       → eligibility + consent gate
//   POST   /api/v4/trials/protocol/:id/randomize    → block 4 randomization
//   POST   /api/v4/trials/protocol/:id/outcome      → CRF entry
//
// Tenant-scoped (RAIL-5) and auth-gated via RouteGuards.
// Fail-closed on missing tenant (RAIL-11). Audit-safe error codes only
// (RAIL-12). No external dependencies.

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const ClinicalTrialProtocol = require('../lib/trials/protocol');
const { newECRF } = require('../lib/trials/eCRF');
const { newRandomizer } = require('../lib/trials/Randomizer');

// Process-wide protocol manager so trials can be defined, amended,
// randomized, and audited across requests within a single deployment.
const _protocolManager = new ClinicalTrialProtocol();
const _consentManager = _protocolManager._consent;

function newTrialsRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  // ---- legacy F-17 surface (preserved) -----------------------------------

  const ecrf = newECRF();
  const rand = newRandomizer();

  app.post('/api/v4/trials/ecrf/define', (req, res) => {
    try { ecrf.define(req.body || {}); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/v4/trials/ecrf/submit', (req, res) => {
    try { res.json(ecrf.submit(req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/v4/trials/randomize', (req, res) => {
    try { res.json(rand.assign(req.body || {})); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- per-route guards (RAIL-5 / RAIL-11 / RAIL-13) ---------------------

  function _adminGuard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'researcher'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  function _clinicalGuard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'nurse', 'researcher'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  // ---- P20 endpoints ----------------------------------------------------

  // POST /api/v4/trials/protocol
  app.post('/api/v4/trials/protocol', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const out = _protocolManager.define(Object.assign({}, req.body, { tenantId }));
      res.json(Object.assign({ ok: true }, out));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/trials/protocols
  app.get('/api/v4/trials/protocols', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const filter = {};
      if (typeof req.query.status === 'string') filter.status = req.query.status;
      if (typeof req.query.phase === 'string') filter.phase = req.query.phase;
      const list = _protocolManager.list({ tenantId, filter });
      res.json({ ok: true, count: list.length, protocols: list });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/trials/protocol/:id
  app.get('/api/v4/trials/protocol/:id', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const out = _protocolManager.get({ tenantId, protocolId: req.params.id });
      if (!out) return res.status(404).json({ error: 'PROTOCOL_NOT_FOUND' });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/amend
  app.post('/api/v4/trials/protocol/:id/amend', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.amend({
        tenantId,
        protocolId: req.params.id,
        changes: body.changes || {},
        reason: body.reason || '',
        actorId
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/approve
  app.post('/api/v4/trials/protocol/:id/approve', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const approverId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.approve({
        tenantId,
        protocolId: req.params.id,
        irbApprovalCode: body.irbApprovalCode || '',
        irbExpiresAt: body.irbExpiresAt || '',
        approverId
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/close
  app.post('/api/v4/trials/protocol/:id/close', _adminGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.close({
        tenantId,
        protocolId: req.params.id,
        reason: body.reason || '',
        actorId
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/consent
  app.post('/api/v4/trials/protocol/:id/consent', _clinicalGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const proto = _protocolManager.get({ tenantId, protocolId: req.params.id });
      if (!proto) return res.status(404).json({ error: 'PROTOCOL_NOT_FOUND' });
      let out;
      if (body.minorId && body.guardianId) {
        out = _consentManager.recordAssent({
          tenantId,
          protocolId: req.params.id,
          minorId: body.minorId,
          guardianId: body.guardianId,
          version: body.version || ('v' + proto.protocol.version),
          actorId
        });
      } else {
        out = _consentManager.recordConsent({
          tenantId,
          protocolId: req.params.id,
          patientId: body.patientId,
          version: body.version || ('v' + proto.protocol.version),
          witnessId: body.witnessId,
          actorId
        });
      }
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/withdraw
  app.post('/api/v4/trials/protocol/:id/withdraw', _clinicalGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _consentManager.withdraw({
        tenantId,
        protocolId: req.params.id,
        patientId: body.patientId || '',
        reason: body.reason || '',
        actorId
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/enroll
  app.post('/api/v4/trials/protocol/:id/enroll', _clinicalGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.enroll({
        tenantId,
        protocolId: req.params.id,
        patientId: body.patientId,
        screeningId: body.screeningId,
        patient: body.patient,
        actorId
      });
      res.json({ ok: !!out.ok, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/randomize
  app.post('/api/v4/trials/protocol/:id/randomize', _clinicalGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.randomize({
        tenantId,
        protocolId: req.params.id,
        patientId: body.patientId,
        patient: body.patient,
        actorId
      });
      res.json({ ok: !!out.ok, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/trials/protocol/:id/outcome
  app.post('/api/v4/trials/protocol/:id/outcome', _clinicalGuard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const actorId = (req.user && req.user.id) || 'unknown';
      const body = req.body || {};
      const out = _protocolManager.recordOutcome({
        tenantId,
        protocolId: req.params.id,
        patientId: body.patientId,
        outcome: body.outcome,
        actorId
      });
      res.json({ ok: !!out.ok, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { newTrialsRouter };
