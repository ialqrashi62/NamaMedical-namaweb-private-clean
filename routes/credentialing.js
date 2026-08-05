'use strict';
const express = require('express');
const { newCredentialingVerifier } = require('../lib/credentialing/Verifier');
const { newExpiryTracker } = require('../lib/credentialing/Expiry');

function newCredentialingRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const v = newCredentialingVerifier();
  const t = newExpiryTracker();

  app.post('/api/v4/credentialing/verify', (req, res) => {
    try {
      const r = v.verify(req.body || {});
      if (r.status === 'ACTIVE') t.upsert(req.body.providerId, r.expiry, r.regulator);
      res.json(r);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/v4/credentialing/alerts', (_req, res) => res.json({ alerts: t.alerts() }));

  return app;
}

module.exports = { newCredentialingRouter };
