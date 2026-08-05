'use strict';
const express = require('express');
const { newDeidentify } = require('../lib/nlp/Deidentify');
const { newKnowledgeGraph } = require('../lib/nlp/KnowledgeGraph');

function newNlpQuery() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const deid = newDeidentify();
  const kg = newKnowledgeGraph();
  kg.addNode('paracetamol', { kind: 'drug' });
  kg.addNode('fever', { kind: 'symptom' });
  kg.addEdge('paracetamol', 'fever', 'treats');

  app.post('/api/v4/nlp/query', (req, res) => {
    const { tenantId, query } = req.body || {};
    if (!tenantId || !query) return res.status(400).json({ error: 'TENANT_AND_QUERY_REQUIRED' });
    const stripped = deid.strip(query);
    const related = kg.findRelated('paracetamol');
    res.json({ ok: true, query: stripped, redacted: stripped !== query, related });
  });

  return app;
}

module.exports = { newNlpQuery };
