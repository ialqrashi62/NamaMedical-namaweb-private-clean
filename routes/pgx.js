// routes/pgx.js
// P22 — Pharmacogenomic (PGx) Dose Engine HTTP surface.
// Endpoints (all under /api/v4/pgx):
//   POST /api/v4/pgx/recommend     — single drug recommendation
//   GET  /api/v4/pgx/history/:patientId — prior recs for a patient
//   POST /api/v4/pgx/alerts        — CDSS hook (drug + optional patient)
//
// Tenant-scoped (RAIL-5), auth-gated (RAIL-13). Fail-closed on missing
// tenant (RAIL-11). Hash-chained audit (RAIL-10). No PHI in logs
// (RAIL-12). Uses lib/route-factory + lib/route-guards.

'use strict';

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const Pairings = require('../lib/pgxDosing/pairings');
const DoseEngine = require('../lib/pgxDosing/doseEngine');

// Process-wide dose engine.
const _engine = new DoseEngine();

function newPgxRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  function _guard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'pharmacist'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  // GET /api/v4/pgx/pairs — list supported drug-gene pairs (catalog)
  app.get('/api/v4/pgx/pairs', _guard, (req, res) => {
    try {
      const list = Object.keys(Pairings.PAIRINGS).map(function (drug) {
        const p = Pairings.PAIRINGS[drug];
        return {
          drug: drug,
          gene: p.gene,
          drugClass: p.drugClass,
          guideline: p.guideline,
          evidence: p.evidence,
          poorMetabolizer: p.poorMetabolizer
        };
      });
      res.json({ ok: true, count: list.length, pairs: list });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/pgx/recommend
  //   body: { drug, variant?: { gene, call }, phenotype?, haplotype?,
  //           patientId, actorId? }
  app.post('/api/v4/pgx/recommend', _guard, (req, res) => {
    try {
      const body = req.body || {};
      const actorId = body.actorId || (req.user && (req.user.id || req.user.userId)) || null;
      const out = _engine.recommend({
        tenantId: req.tenantId,
        patientId: body.patientId,
        drug: body.drug,
        variant: body.variant,
        phenotype: body.phenotype,
        haplotype: body.haplotype,
        actorId: actorId
      });
      if (!out.ok) {
        return res.status(400).json({ error: out.error });
      }
      res.json({ ok: true, recommendation: out.recommendation });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/pgx/history/:patientId
  app.get('/api/v4/pgx/history/:patientId', _guard, (req, res) => {
    try {
      const out = _engine.history({
        tenantId: req.tenantId,
        patientId: req.params.patientId
      });
      res.json({ ok: true, count: out.length, history: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/pgx/alerts
  //   body: { drug, patientId? } — if patientId omitted, returns a
  //   non-actionable info alert (genotype not on file).
  app.post('/api/v4/pgx/alerts', _guard, (req, res) => {
    try {
      const body = req.body || {};
      const out = _engine.alerts({
        tenantId: req.tenantId,
        drug: body.drug,
        patientId: body.patientId || null
      });
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true, alert: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { newPgxRouter };
