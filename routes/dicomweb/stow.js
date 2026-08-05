'use strict';
const express = require('express');

function newStowRS(store) {
  const app = express.Router();
  app.use(express.json({ limit: '16mb' }));
  app.post('/dicomweb/studies', (req, res) => {
    const t = req.headers['x-tenant'];
    if (!t) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    const { study, instances } = req.body || {};
    if (!study || !Array.isArray(instances)) return res.status(400).json({ error: 'STUDY_AND_INSTANCES_REQUIRED' });
    const stored = [];
    for (const inst of instances) {
      const id = `${study}/${inst.sopUID}`;
      store.put(study, inst.sopUID, { tenantId: t, sopUID: inst.sopUID, bytes: Buffer.from(inst.bytes || '') });
      stored.push(id);
    }
    res.json({ ok: true, study, stored });
  });
  return app;
}

module.exports = { newStowRS };
