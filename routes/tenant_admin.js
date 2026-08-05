'use strict';
const express = require('express');

function newTenantAdmin(store) {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  app.post('/api/v4/tenant/create', (req, res) => {
    const { tenantId, adminEmail } = req.body || {};
    if (!tenantId || !adminEmail) return res.status(400).json({ error: 'TENANT_AND_EMAIL_REQUIRED' });
    if (!store.has(tenantId)) store.set(tenantId, { adminEmail, roles: ['tenant:admin'] });
    res.json(store.get(tenantId));
  });

  app.post('/api/v4/tenant/promote', (req, res) => {
    const { tenantId, userId, role } = req.body || {};
    if (!tenantId || !userId || !role) return res.status(400).json({ error: 'TENANT_USER_ROLE_REQUIRED' });
    const t = store.get(tenantId);
    if (!t) return res.status(404).json({ error: 'TENANT_UNKNOWN' });
    t.roles = (t.roles || []).concat([role]);
    res.json({ ok: true, tenantId, userId, roles: t.roles });
  });

  return app;
}

module.exports = { newTenantAdmin };
