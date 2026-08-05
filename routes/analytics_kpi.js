'use strict';
const express = require('express');

function newAnalyticsKPI(cube) {
  const app = express.Router();
  app.get('/api/v4/analytics/kpi', (req, res) => {
    const t = req.query.tenantId;
    if (!t) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    res.json(cube.kpi({ tenantId: t }));
  });
  app.get('/api/v4/analytics/rollup', (req, res) => {
    const t = req.query.tenantId;
    if (!t) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    res.json({ days: cube.rollup({ tenantId: t, from: req.query.from, to: req.query.to }) });
  });
  return app;
}

module.exports = { newAnalyticsKPI };
