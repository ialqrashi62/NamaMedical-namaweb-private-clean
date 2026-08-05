'use strict';
// routes/populationHealth.js
// P21 — Population Health HTTP surface.
// Endpoints (all under /api/v4/population*):
//   GET   /api/v4/population/registries
//   POST  /api/v4/population/cohort
//   POST  /api/v4/population/cohort/:id/patients
//   GET   /api/v4/population/cohort/:id/metrics
//   POST  /api/v4/population/cohort/:id/outreach
//   GET   /api/v4/population/cohort/:id/export
//
// Tenant-scoped (RAIL-5), auth-gated (RAIL-13). Fail-closed on missing
// tenant (RAIL-11). Outreach audit emits only count + recipient IDs
// (RAIL-12). Export strips the HIPAA 18 identifiers via lib/populationHealth/cohort.

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const CohortBuilder = require('../lib/populationHealth/cohort');
const Registry = require('../lib/populationHealth/registry');
const Outreach = require('../lib/populationHealth/outreach');

// Process-wide cohort manager.
const _cohorts = new CohortBuilder();

function newPopulationHealthRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  function _guard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'analyst', 'nurse'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  // GET /api/v4/population/registries
  app.get('/api/v4/population/registries', _guard, (req, res) => {
    try {
      const list = Object.keys(Registry.REGISTRIES).map(function (id) {
        const r = Registry.REGISTRIES[id];
        return {
          id: id,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          inclusion: r.inclusion.slice(),
          exclusions: r.exclusions.slice(),
          metrics: r.metrics.slice()
        };
      });
      res.json({ ok: true, count: list.length, registries: list });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/population/cohort
  app.post('/api/v4/population/cohort', _guard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const body = req.body || {};
      const cohort = _cohorts.define({
        tenantId,
        name: body.name,
        registry: body.registry,
        criteria: body.criteria,
        followUpDays: body.followUpDays
      });
      res.json({ ok: true, data: cohort });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/population/cohort/:id/patients
  app.post('/api/v4/population/cohort/:id/patients', _guard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const body = req.body || {};
      const out = _cohorts.addPatients({
        tenantId,
        cohortId: req.params.id,
        patientIds: body.patientIds || [],
        patientData: body.patientData || {}
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/population/cohort/:id/metrics
  app.get('/api/v4/population/cohort/:id/metrics', _guard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const out = _cohorts.metrics({
        tenantId,
        cohortId: req.params.id
      });
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/population/cohort/:id/outreach
  app.post('/api/v4/population/cohort/:id/outreach', _guard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const body = req.body || {};
      const out = _cohorts.outreach({
        tenantId,
        cohortId: req.params.id,
        channel: body.channel,
        template: body.template
      });
      // Validate template against the static template catalog (so audit can
      // reference a known template ID without leaking message body).
      try {
        const tpl = Outreach.getTemplate(out.registryId, out.channel, body.lang || 'en');
        out.resolvedSubject = (tpl && tpl.subject) || null;
      } catch (_e) { /* unknown template — defer to caller */ }
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/population/cohort/:id/export
  app.get('/api/v4/population/cohort/:id/export', _guard, (req, res) => {
    try {
      const tenantId = req.tenantId;
      const format = (typeof req.query.format === 'string' && req.query.format) ? req.query.format : 'json';
      const out = _cohorts.export({
        tenantId,
        cohortId: req.params.id,
        format: format
      });
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="cohort.csv"');
        return res.status(200).send(out.csv);
      }
      res.json({ ok: true, data: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { newPopulationHealthRouter };
