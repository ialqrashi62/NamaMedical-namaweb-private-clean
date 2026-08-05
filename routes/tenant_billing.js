'use strict';
const express = require('express');

function _calc({ tenantId, encounters, rvu, denied }) {
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  const baseRate = 0.002;
  const rvuRate = 0.05;
  const deniedRate = 0.10;
  const encountersCost = (encounters || 0) * baseRate;
  const rvuCost = (rvu || 0) * rvuRate;
  const deniedCost = (denied || 0) * deniedRate;
  return {
    tenantId,
    encountersCost,
    rvuCost,
    deniedCost,
    total: encountersCost + rvuCost + deniedCost,
  };
}

function newTenantBilling() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  app.post('/api/v4/tenant/billing/calc', (req, res) => {
    try {
      const c = _calc(req.body || {});
      c.total = c.encountersCost + c.rvuCost + c.deniedCost;
      res.json(c);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  return app;
}

module.exports = { newTenantBilling, _calc };
