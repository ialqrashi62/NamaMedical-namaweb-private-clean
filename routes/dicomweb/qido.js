'use strict';
const express = require('express');

function newQidoRS(store) {
  const app = express.Router();
  app.get('/dicomweb/studies', (req, res) => {
    const t = req.headers['x-tenant'];
    if (!t) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    const all = store.all().filter(s => s.tenantId === t);
    res.json({ count: all.length, studies: all.map(s => ({ studyUID: s.study, modal: s.modal || 'CT' })) });
  });
  return app;
}

module.exports = { newQidoRS };
