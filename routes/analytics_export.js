'use strict';
const express = require('express');

function newAnalyticsExport(cube) {
  const app = express.Router();
  app.get('/api/v4/analytics/export.csv', (req, res) => {
    const t = req.query.tenantId;
    if (!t) return res.status(400).end('TENANT_REQUIRED');
    const rows = cube.rollup({ tenantId: t });
    res.setHeader('Content-Type', 'text/csv');
    res.write('day,enc,los,rvu,denied\n');
    for (const r of rows) res.write(`${r.day},${r.enc},${r.los},${r.rvu},${r.denied}\n`);
    res.end();
  });
  return app;
}

module.exports = { newAnalyticsExport };
