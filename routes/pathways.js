'use strict';
const express = require('express');
const { validatePathway } = require('../lib/pathways/DSL');
const { compile } = require('../lib/pathways/Compiler');
const { newRuntime } = require('../lib/pathways/Runtime');

function newPathwaysRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const store = new Map();
  const rt = newRuntime();

  app.post('/api/v4/pathways', (req, res) => {
    const v = validatePathway(req.body);
    if (!v.ok) return res.status(400).json({ error: 'INVALID_PATHWAY', errors: v.errors });
    const compiled = compile(req.body);
    store.set(compiled.id, compiled);
    res.json({ ok: true, id: compiled.id });
  });

  app.post('/api/v4/pathways/:id/run', (req, res) => {
    const p = store.get(req.params.id);
    if (!p) return res.status(404).json({ error: 'PATHWAY_UNKNOWN' });
    const r = rt.run({ compiled: p, facts: req.body.facts || {} });
    res.json(r);
  });

  return app;
}

module.exports = { newPathwaysRouter };
