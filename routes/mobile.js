// routes/mobile.js
// Mobile native API routes (P10). Public login/refresh; bootstrap/sync/logout/push require auth.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).

'use strict';
const express = require('express');
const Route = require('../lib/route-factory');
const Guard = require('../lib/route-guards');
const PushService = require('../lib/mobile/pushNotification');
const MobileAPI = require('../lib/mobile/mobileApi');

function newMobileApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const push = new PushService();
  const mobj = new MobileAPI();

  // --- Public: login (no auth middleware — issues the token) ---
  app.post('/api/mobile/login', (req, res) => {
    const body = req.body || {};
    if (!body.tenantId) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    if (!body.username) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'username is required' });
    if (!body.password) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'password is required' });
    const out = mobj.login({
      tenantId: body.tenantId,
      username: body.username,
      password: body.password,
      deviceToken: body.deviceToken,
      platform: body.platform,
      appVersion: body.appVersion,
    });
    if (!out.ok) {
      const code = out.error || 'AUTH_FAILED';
      const status = code === 'AUTH_FAILED' ? 401 : 400;
      return res.status(status).json({ error: code });
    }
    return res.json(out);
  });

  // --- Public: refresh ---
  app.post('/api/mobile/refresh', (req, res) => {
    const body = req.body || {};
    if (!body.refreshToken) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'refreshToken is required' });
    const out = mobj.refresh({ refreshToken: body.refreshToken });
    if (!out.ok) return res.status(401).json({ error: out.error || 'REFRESH_FAILED' });
    return res.json(out);
  });

  // --- Authenticated routes (use the shared factory) ---
  const authRouter = Route.create({
    base: '/api/mobile',
    tenantScoped: true,
    auth: { roles: ['doctor', 'nursing', 'admin', 'staff'] },
  });

  // GET /api/mobile/bootstrap
  authRouter.get('/bootstrap', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const out = mobj.bootstrap({
      tenantId: req.tenantId,
      userId: (req.user && req.user.id) || (req.user && req.user.userId),
      lang: (req.query && req.query.lang) || 'ar-SA',
    });
    res.json(out);
  });

  // GET /api/mobile/sync
  authRouter.get('/sync', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const out = mobj.sync({
      tenantId: req.tenantId,
      userId: (req.user && req.user.id) || (req.user && req.user.userId),
      since: (req.query && req.query.since) || null,
    });
    res.json(out);
  });

  // POST /api/mobile/logout
  authRouter.post('/logout', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    const body = req.body || {};
    if (!body.token) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'token is required' });
    const out = mobj.logout({ token: body.token });
    res.json(out);
  });

  // POST /api/mobile/push/register
  authRouter.post('/push/register', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    const out = push.registerDevice({
      tenantId: req.tenantId,
      userId: (req.user && req.user.id) || (req.user && req.user.userId),
      deviceToken: body.deviceToken,
      platform: body.platform,
      appVersion: body.appVersion,
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  // POST /api/mobile/push/unregister
  authRouter.post('/push/unregister', (req, res, next) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    const out = push.unregisterDevice({
      tenantId: req.tenantId,
      deviceToken: body.deviceToken,
    });
    res.json(out);
  });

  app.use(authRouter);
  return app;
}

module.exports = { newMobileApi };
