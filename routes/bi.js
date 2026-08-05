'use strict';
// routes/bi.js
// P27 — Power BI Embedded HTTP surface.
// Wires powerbi.js + storage.js + dashboards.js into:
//   GET  /api/v4/bi/workspaces
//   GET  /api/v4/bi/workspace/:id/reports
//   POST /api/v4/bi/embed/token
//   GET  /api/v4/bi/dashboards
//   GET  /api/v4/bi/dashboard/:id/embed
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// HTTPS-only embed URLs, RLS via roles filter, no PHI in logs (RAIL-12).

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const PowerBIEmbed = require('../lib/bi/powerbi');
const Dashboards = require('../lib/bi/dashboards');
const { newBIStorage } = require('../lib/bi/storage');

function newBiApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  const pbi = new PowerBIEmbed({ ttlSec: 60 * 60 });
  const storage = newBIStorage();

  function _biGuard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'nurse', 'finance', 'analyst', 'cmo', 'cfo'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  function _send(res, payload, status) {
    if (!payload || payload.ok !== true) {
      const code = (payload && payload.error) ? payload.error : 'INTERNAL';
      const msg = (payload && payload.msg) ? payload.msg : 'Internal error';
      const s = status || (code === 'INTERNAL' ? 500 : 400);
      return res.status(s).json({ error: code, msg: msg });
    }
    res.json(payload);
  }

  // ---- workspaces -----------------------------------------------------
  app.get('/api/v4/bi/workspaces', _biGuard, (req, res) => {
    const out = pbi.listWorkspaces({ tenantId: req.tenantId });
    _send(res, out);
  });

  // Reports visible in a workspace, but only if the tenant has it attached.
  app.get('/api/v4/bi/workspace/:id/reports', _biGuard, (req, res) => {
    const workspaceId = req.params.id;
    const allowed = storage.hasWorkspace({ tenantId: req.tenantId, workspaceId: workspaceId });
    if (!allowed) {
      return res.status(403).json({ error: 'WORKSPACE_NOT_ATTACHED', msg: 'Workspace is not attached to tenant' });
    }
    const out = pbi.listReports({ workspaceId: workspaceId, tenantId: req.tenantId });
    _send(res, out);
  });

  // ---- embed token ----------------------------------------------------
  app.post('/api/v4/bi/embed/token', _biGuard, (req, res) => {
    const body = req.body || {};
    const userId = (req.user && (req.user.id || req.user.userId)) || body.userId;
    if (!userId) {
      return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'userId is required' });
    }
    // Workspace must be attached to the calling tenant.
    if (body.workspaceId && !storage.hasWorkspace({ tenantId: req.tenantId, workspaceId: body.workspaceId })) {
      return res.status(403).json({ error: 'WORKSPACE_NOT_ATTACHED' });
    }
    const out = pbi.getToken({
      workspaceId: body.workspaceId,
      reportId: body.reportId,
      tenantId: req.tenantId,
      userId: userId,
      roles: body.roles,
      ttlSec: body.ttlSec,
    });
    _send(res, out);
  });

  // ---- dashboards -----------------------------------------------------
  app.get('/api/v4/bi/dashboards', _biGuard, (req, res) => {
    const out = Dashboards.list({ tenantId: req.tenantId });
    _send(res, out);
  });

  // ---- dashboard embed (combo: dashboard metadata + token) ------------
  app.get('/api/v4/bi/dashboard/:id/embed', _biGuard, (req, res) => {
    const found = Dashboards.get({ id: req.params.id, tenantId: req.tenantId });
    if (!found.ok) return _send(res, found);

    const userId = (req.user && (req.user.id || req.user.userId)) || null;
    if (!userId) {
      return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'userId is required' });
    }
    const workspaceId = 'ws-clinical-' + req.tenantId;
    if (!storage.hasWorkspace({ tenantId: req.tenantId, workspaceId: workspaceId })) {
      // Auto-attach the standard clinical workspace so the embed URL is
      // usable on first visit. Still tenant-scoped (req.tenantId derived
      // from session — never from caller input).
      storage.attach({
        tenantId: req.tenantId,
        workspaceId: workspaceId,
        name: 'Clinical',
        role: 'Member',
      });
    }
    const tok = pbi.getToken({
      workspaceId: workspaceId,
      reportId: found.dashboard.reportId,
      tenantId: req.tenantId,
      userId: userId,
      roles: found.dashboard.rlsRoles,
    });
    if (!tok.ok) return _send(res, tok);
    res.json({
      ok: true,
      tenantId: req.tenantId,
      dashboard: found.dashboard,
      embed: {
        token: tok.token,
        embedUrl: tok.embedUrl,
        tokenType: tok.tokenType,
        expiration: tok.expiration,
        rls: tok.rls,
      },
    });
  });

  return app;
}

module.exports = { newBiApi };
