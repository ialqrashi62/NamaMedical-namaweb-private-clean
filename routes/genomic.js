// routes/genomic.js
// Genomic / PGx routes (P12). Tenant-scoped, role-guarded, no PHI in logs.
// Pure JS, no npm install. Uses lib/route-factory + lib/route-guards.
//
// Endpoints:
//   GET  /api/v4/genomic/genes
//   POST /api/v4/genomic/report
//   GET  /api/v4/genomic/report/:patientId
//   GET  /api/v4/genomic/drug-gene-pairs

'use strict';

const express = require('express');
const Route = require('../lib/route-factory');
const Guard = require('../lib/route-guards');
const Variants = require('../lib/genomic/variants');
const Storage = require('../lib/genomic/storage');
const PgxReport = require('../lib/genomic/report');

function newGenomicApi() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const store = Storage.newGenomicStore();
  const report = new PgxReport({ store: store });

  const authRouter = Route.create({
    base: '/api/v4/genomic',
    tenantScoped: true,
    auth: { roles: ['doctor', 'nursing', 'pharmacist', 'admin'] }
  });

  // GET /api/v4/genomic/genes — list catalog
  authRouter.get('/genes', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const genes = Object.keys(Variants.GENES_CATALOG).map(function (g) {
      const e = Variants.GENES_CATALOG[g];
      return { gene: g, drug: e.drug, guideline: e.guideline, phenotypes: e.phenotypes };
    });
    res.json({ ok: true, count: genes.length, genes: genes });
  });

  // GET /api/v4/genomic/drug-gene-pairs
  authRouter.get('/drug-gene-pairs', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    res.json({ ok: true, pairs: Variants.drugGenePairs() });
  });

  // POST /api/v4/genomic/report
  //   body: { patientId, genes?, variants? (optional upsert) }
  //   - If `variants` is present, we upsert them into the store first,
  //     then generate the report. This keeps the route self-contained
  //     for sandbox demos while still routing through the store.
  authRouter.post('/report', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    const body = req.body || {};
    if (!body.patientId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'patientId is required' });
    // Optional upsert
    if (Array.isArray(body.variants)) {
      for (const v of body.variants) {
        store.add({
          tenantId: req.tenantId,
          patientId: body.patientId,
          gene: v.gene,
          variantType: v.variantType,
          rsId: v.rsId,
          phenotype: v.phenotype,
          zygosity: v.zygosity,
          source: v.source,
          recordedBy: (req.user && (req.user.id || req.user.userId)) || null
        });
      }
    }
    const out = report.generate({
      tenantId: req.tenantId,
      patientId: body.patientId,
      actorId: (req.user && (req.user.id || req.user.userId)) || null,
      genes: Array.isArray(body.genes) ? body.genes : null
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  // GET /api/v4/genomic/report/:patientId
  authRouter.get('/report/:patientId', (req, res) => {
    if (!Guard.requireAuth(req, res)) return;
    if (!Guard.requireTenant(req, res)) return;
    if (!req.params.patientId) return res.status(400).json({ error: 'FIELD_REQUIRED', msg: 'patientId is required' });
    const out = report.generate({
      tenantId: req.tenantId,
      patientId: req.params.patientId,
      actorId: (req.user && (req.user.id || req.user.userId)) || null,
      genes: null
    });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  });

  app.use(authRouter);
  return app;
}

module.exports = { newGenomicApi };
