'use strict';
const express = require('express');
const { newDeveloperPortal } = require('../lib/api/DeveloperPortal');
const { newRateLimiter } = require('../lib/api/RateLimiter');

function newDeveloperRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  const portal = newDeveloperPortal();
  const limit = newRateLimiter();

  app.post('/api/v4/developer/register', (req, res) => {
    const { partnerId, scopes } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: 'PARTNER_ID_REQUIRED' });
    const p = portal.registerPartner({ partnerId, scopes });
    limit.configure({ partnerId, capacity: 10, refillPerSec: 1 });
    res.json(p);
  });

  app.post('/api/v4/developer/token', (req, res) => {
    const { partnerId, scope } = req.body || {};
    if (!partnerId) return res.status(400).json({ error: 'PARTNER_ID_REQUIRED' });
    try {
      const t = portal.issueToken({ partnerId, scope });
      const r = limit.take({ partnerId, cost: 1 });
      if (!r.ok) return res.status(429).json({ error: 'RATE_LIMITED', partnerId });
      res.json({ token: t.token });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  return app;
}

module.exports = { newDeveloperRouter };
