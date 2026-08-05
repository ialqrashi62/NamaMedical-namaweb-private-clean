// routes/aiCoPilot.js
// AI Co-pilot HTTP surface (P24).
//   POST /api/v4/ai/copilot/convene
//   GET  /api/v4/ai/copilot/session/:id
//   GET  /api/v4/ai/copilot/agents
//
// Tenant-scoped (RAIL-5). Role-guarded (RAIL-13): doctor, oncologist,
// admin, nurse, specialist. Fail-closed (RAIL-11). No PHI in logs
// (RAIL-12). Hash-chained consensus (RAIL-10).
//
// Wires CoPilotOrchestrator into Express using lib/route-factory
// + lib/route-guards. Pure JS, no npm install.

'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const OC = require('../lib/aiCoPilot/orchestrator');

const orchestrator = OC.create();

function roleGuard(req, res, next) {
  if (!RouteGuards.requireAuth(req, res)) return;
  if (!RouteGuards.requireRole(req, res,
    ['doctor', 'oncologist', 'admin', 'nurse', 'specialist'])) return;
  if (typeof next === 'function') next();
}

function tenantGuard(req, res, next) {
  if (!RouteGuards.requireTenant(req, res)) return;
  if (!RouteGuards.requireTenantScope(req, res)) return;
  if (typeof next === 'function') next();
}

function _err(res, status, code, msg) {
  if (!res || typeof res.status !== 'function') return;
  res.status(status).json({ error: code, msg: msg });
}

function _wrap(fn) {
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
        if (msg === 'TENANT_REQUIRED' ||
            msg === 'PATIENT_REQUIRED' ||
            msg === 'CASE_ID_REQUIRED' ||
            msg === 'SESSION_ID_REQUIRED' ||
            msg === 'AGENT_ROLE_REQUIRED' ||
            msg === 'MODE_INVALID:' ||
            msg.indexOf('MODE_INVALID:') === 0) status = 400;
        _err(res, status, msg, msg);
      });
  };
}

// ---- fixed-path routes via factory -----------------------------------

const conveneRouter = RouteFactory.create({
  base: '/api/v4/ai/copilot/convene',
  tenantScoped: true,
  auth: { roles: ['doctor', 'oncologist', 'admin', 'nurse', 'specialist'] },
  methods: {
    POST: {
      input: ['tenantId?', 'patientId', 'caseId', 'mode?', 'actors?', 'context?'],
      handler: function (ctx) {
        return orchestrator.convene({
          tenantId: ctx.tenantId,
          patientId: ctx.input.patientId,
          caseId: ctx.input.caseId,
          mode: ctx.input.mode || 'tumor_board',
          actors: ctx.input.actors || [],
          context: ctx.input.context || {}
        });
      }
    }
  }
});

const agentsRouter = RouteFactory.create({
  base: '/api/v4/ai/copilot/agents',
  tenantScoped: true,
  auth: { roles: ['doctor', 'oncologist', 'admin', 'nurse', 'specialist'] },
  methods: {
    GET: {
      handler: function () {
        return { ok: true, agents: orchestrator.listAgents() };
      }
    }
  }
});

// ---- parameterised routes --------------------------------------------

const paramRouter = express.Router();
paramRouter.use(express.json({ limit: '256kb' }));
paramRouter.use(roleGuard);
paramRouter.use(tenantGuard);

// GET /api/v4/ai/copilot/session/:id
paramRouter.get('/session/:id', _wrap(function (req, res) {
  const id = req.params && req.params.id;
  if (!id) throw new Error('SESSION_ID_REQUIRED');
  return orchestrator.getSession({ tenantId: req.tenantId, sessionId: id });
}));

module.exports = {
  convene: conveneRouter,
  agents: agentsRouter,
  param: paramRouter
};
