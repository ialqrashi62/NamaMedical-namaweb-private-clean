'use strict';
const express = require('express');

function newWadoRS(store) {
  const app = express.Router();
  app.get('/dicomweb/studies/:study/instances', (req, res) => {
    const t = req.headers['x-tenant'];
    if (!t) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    const list = (store.list(req.params.study) || []).filter(s => s.tenantId === t);
    res.json({ study: req.params.study, count: list.length, instances: list });
  });
  app.get('/dicomweb/studies/:study/instances/:sop/blob', (req, res) => {
    const t = req.headers['x-tenant'];
    if (!t) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    const blob = store.get(req.params.study, req.params.sop);
    if (!blob || blob.tenantId !== t) return res.status(404).json({ error: 'NOT_FOUND' });
    res.setHeader('Content-Type', 'application/dicom');
    res.send(blob.bytes);
  });
  return app;
}

module.exports = { newWadoRS };
