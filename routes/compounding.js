// routes/compounding.js
// Pharmacy compounding routes (P13). USP <797>/<800> compliance.
// Pure JS, no npm install. Tenant-scoped (RAIL-5), role-guarded,
// no PHI in logs (RAIL-12), hash-chained audit (RAIL-10).
//
// Endpoints:
//   POST /api/v4/compounding/formula
//   GET  /api/v4/compounding/formulas
//   POST /api/v4/compounding/batch
//   POST /api/v4/compounding/batch/:id/dispense
//   POST /api/v4/compounding/batch/:id/recall

'use strict';

const express = require('express');
const Route = require('../lib/route-factory');
const Guard = require('../lib/route-guards');
const Usp = require('../lib/pharmacy/usp');
const Storage = require('../lib/pharmacy/storage');
const Compounder = require('../lib/pharmacy/compounder');

function newCompoundingApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const store = Storage.newPharmacyStorage();
  const compounder = new Compounder({ store: store });

  const authRouter = Route.create({
    base: '/api/v4/compounding',
    tenantScoped: true,
    auth: { roles: ['pharmacist', 'doctor', 'nursing', 'admin'] }
  });

  // POST /api/v4/compounding/formula
  //   body: { name, components, category, instructions, storage, riskLevel? }
  authRouter.post('/formula', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'name is required' });
    if (!Array.isArray(body.components) || body.components.length === 0) {
      return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'components[] is required' });
    }
    if (!body.category) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'category is required' });
    let formula;
    try {
      formula = Usp.masterFormula({
        name: body.name,
        components: body.components,
        category: body.category,
        instructions: body.instructions,
        storage: body.storage,
        riskLevel: body.riskLevel
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || 'FORMULA_INVALID' });
    }
    const put = store.putFormula(req.tenantId, formula);
    if (!put.ok) return res.status(400).json({ error: put.error });
    res.json({ ok: true, formula: formula });
  });

  // GET /api/v4/compounding/formulas
  authRouter.get('/formulas', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    res.json({ ok: true, formulas: store.listFormulas(req.tenantId) });
  });

  // POST /api/v4/compounding/batch
  //   body: { patientId?, formulaId, batchSize, witnessId? }
  authRouter.post('/batch', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.formulaId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'formulaId is required' });
    const out = compounder.create({
      tenantId: req.tenantId,
      patientId: body.patientId,
      formulaId: body.formulaId,
      batchSize: body.batchSize,
      operatorId: (req.user && (req.user.id || req.user.userId)) || null,
      witnessId: body.witnessId
    });
    if (!out.ok) {
      const status = out.error === 'FORMULA_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: out.error, msg: out.msg });
    }
    res.json(out);
  });

  // POST /api/v4/compounding/batch/:id/dispense
  //   body: { dispensedTo, witnessId?, dispensedBy? }
  authRouter.post('/batch/:id/dispense', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.dispensedTo) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'dispensedTo is required' });
    const out = compounder.dispense({
      batchId: req.params.id,
      dispensedTo: body.dispensedTo,
      witnessId: body.witnessId,
      dispensedBy: (req.user && (req.user.id || req.user.userId)) || null
    });
    if (!out.ok) {
      const status = out.error === 'BATCH_NOT_FOUND' ? 404
        : out.error === 'BATCH_EXPIRED' ? 410
        : 400;
      return res.status(status).json({ error: out.error, currentStatus: out.currentStatus });
    }
    res.json(out);
  });

  // POST /api/v4/compounding/batch/:id/recall
  //   body: { reason }
  authRouter.post('/batch/:id/recall', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.reason) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'reason is required' });
    const out = compounder.recall({
      batchId: req.params.id,
      reason: body.reason,
      recalledBy: (req.user && (req.user.id || req.user.userId)) || null
    });
    if (!out.ok) {
      const status = out.error === 'BATCH_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: out.error });
    }
    res.json(out);
  });

  // GET /api/v4/compounding/batches (bonus list endpoint, not in spec but
  // used by the UI; tenant-scoped + role-guarded like the rest)
  authRouter.get('/batches', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const status = (req.query && req.query.status) || null;
    res.json(compounder.list({ tenantId: req.tenantId, status: status }));
  });

  app.use(authRouter);
  return app;
}

module.exports = { newCompoundingApi };
