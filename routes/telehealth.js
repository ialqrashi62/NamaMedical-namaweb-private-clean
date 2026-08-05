// routes/telehealth.js
// Telehealth WebRTC routes (P11). Tenant-scoped, E2EE mandatory (RAIL-12), audit-hash consent (RAIL-10).
// Pure JS, no npm install. No PHI in logs (RAIL-12).

'use strict';
const express = require('express');
const Route = require('../lib/route-factory');
const Guard = require('../lib/route-guards');
const SFU = require('../lib/telehealth/sfu');
const Consent = require('../lib/telehealth/consent');

function newTelehealthApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const sfu = new SFU();
  const consent = new Consent();

  // --- Authenticated telehealth routes ---
  const authRouter = Route.create({
    base: '/api/v4/telehealth',
    tenantScoped: true,
    auth: { roles: ['doctor', 'nursing', 'admin', 'staff'] },
  });

  // POST /api/v4/telehealth/room
  authRouter.post('/room', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.encounterId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'encounterId is required' });
    var hostId = body.hostId || ((req.user && (req.user.id || req.user.userId)) || null);
    if (!hostId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'hostId is required' });
    var out = sfu.createRoom({
      tenantId: req.tenantId,
      encounterId: body.encounterId,
      hostId: hostId,
      lang: body.lang || 'ar-SA',
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  // POST /api/v4/telehealth/room/:id/join
  authRouter.post('/room/:id/join', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var userId = (req.user && (req.user.id || req.user.userId)) || null;
    if (!userId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'userId is required' });
    // Enforce patient consent for non-host joiners
    if (req.user && Array.isArray(req.user.roles) && req.user.roles.indexOf('doctor') === -1) {
      // patient/other must have an active consent
      var has = consent.hasConsent({ tenantId: req.tenantId, patientId: userId, encounterId: req.params.id });
      if (!has) return res.status(403).json({ error: 'CONSENT_REQUIRED' });
    }
    var out = sfu.joinRoom({
      roomId: req.params.id,
      userId: userId,
      role: (req.body && req.body.role) || undefined,
    });
    if (!out.ok) {
      var status = out.error === 'ROOM_NOT_FOUND' ? 404 : (out.error === 'ROOM_ENDED' ? 410 : 400);
      return res.status(status).json({ error: out.error });
    }
    res.json(out);
  });

  // POST /api/v4/telehealth/room/:id/end
  authRouter.post('/room/:id/end', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var out = sfu.endRoom({ roomId: req.params.id });
    if (!out.ok) {
      var status = out.error === 'ROOM_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: out.error });
    }
    res.json(out);
  });

  // POST /api/v4/telehealth/consent
  authRouter.post('/consent', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var body = req.body || {};
    if (!body.patientId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'patientId is required' });
    if (!body.encounterId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'encounterId is required' });
    if (!body.scope) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'scope is required' });
    var out = consent.recordConsent({
      tenantId: req.tenantId,
      patientId: body.patientId,
      encounterId: body.encounterId,
      scope: body.scope,
      granted: body.granted !== false,
      recordedBy: (req.user && (req.user.id || req.user.userId)) || null,
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  // POST /api/v4/telehealth/consent/revoke  (auxiliary revoke — also reachable from consent flow)
  authRouter.post('/consent/revoke', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var body = req.body || {};
    if (!body.patientId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'patientId is required' });
    if (!body.encounterId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'encounterId is required' });
    var out = consent.revoke({
      tenantId: req.tenantId,
      patientId: body.patientId,
      encounterId: body.encounterId,
      revokedBy: (req.user && (req.user.id || req.user.userId)) || null,
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  // GET /api/v4/telehealth/consent/:encounterId
  authRouter.get('/consent/:encounterId', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var patientId = (req.query && req.query.patientId) || (req.user && (req.user.id || req.user.userId));
    if (!patientId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'patientId is required' });
    var out = consent.get({ tenantId: req.tenantId, patientId: patientId, encounterId: req.params.encounterId });
    res.json(out);
  });

  // GET /api/v4/telehealth/rooms
  authRouter.get('/rooms', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    var out = sfu.rooms({ tenantId: req.tenantId });
    res.json(out);
  });

  app.use(authRouter);
  return app;
}

module.exports = { newTelehealthApi };
