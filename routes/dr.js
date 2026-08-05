'use strict';
// routes/dr.js
// P26 — Multi-region disaster-recovery HTTP surface.
// Wires regions.js + replication.js + failover.js into:
//   GET  /api/v4/dr/regions
//   POST /api/v4/dr/replication/start
//   GET  /api/v4/dr/replication/status/:region
//   POST /api/v4/dr/failover/plan
//   POST /api/v4/dr/failover/execute/:planId
//   POST /api/v4/dr/failover/rollback/:planId
//   GET  /api/v4/dr/failover/history
//
// Tenant-scoped (RAIL-5), role-guarded (RAIL-13), fail-closed (RAIL-11),
// audit-on-execute (RAIL-10), no PHI in logs (RAIL-12).

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const DR = require('../lib/dr/regions');
const ReplicationManager = require('../lib/dr/replication');
const failoverModule = require('../lib/dr/failover');
// failover.js's IIFE returns a factory; class is on .FailoverController.
const FailoverController = failoverModule.FailoverController || failoverModule;

function newDrApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  const replication = new ReplicationManager();
  const failover = new FailoverController({ replication: replication });

  function _adminGuard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'platform', 'sre'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  function _doctorGuard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'platform', 'sre', 'doctor'])) return;
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

  // ---- regions --------------------------------------------------------
  app.get('/api/v4/dr/regions', _adminGuard, (req, res) => {
    const out = DR.activeActive({ tenantId: req.tenantId, primary: 'sa-central-1' });
    _send(res, out);
  });

  // ---- replication ----------------------------------------------------
  app.post('/api/v4/dr/replication/start', _adminGuard, (req, res) => {
    const body = req.body || {};
    const out = replication.startReplication({
      sourceRegion: body.sourceRegion,
      targetRegion: body.targetRegion,
      tables: body.tables,
    });
    _send(res, out);
  });

  app.get('/api/v4/dr/replication/status/:region', _adminGuard, (req, res) => {
    const out = replication.status({ region: req.params.region });
    _send(res, out);
  });

  // ---- failover -------------------------------------------------------
  app.post('/api/v4/dr/failover/plan', _adminGuard, (req, res) => {
    const body = req.body || {};
    const out = failover.plan({
      fromRegion: body.fromRegion,
      toRegion: body.toRegion,
    });
    _send(res, out);
  });

  app.post('/api/v4/dr/failover/execute/:planId', _adminGuard, (req, res) => {
    const body = req.body || {};
    const out = failover.execute({
      planId: req.params.planId,
      approvedBy: body.approvedBy,
      approvalToken: body.approvalToken,
      tenantId: req.tenantId,
    });
    _send(res, out);
  });

  app.post('/api/v4/dr/failover/rollback/:planId', _adminGuard, (req, res) => {
    const body = req.body || {};
    const out = failover.rollback({
      planId: req.params.planId,
      reason: body.reason,
    });
    _send(res, out);
  });

  app.get('/api/v4/dr/failover/history', _doctorGuard, (req, res) => {
    const out = failover.history({ tenantId: req.tenantId });
    _send(res, out);
  });

  return app;
}

module.exports = { newDrApi };
