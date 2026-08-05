'use strict';
// Audit chain search — paginated, supports filter by tenant/actor/action/date.
// Backed by AuditService (or any in-memory chain compatible with its API).

const express = require('express');

function newAuditChainSearch(audit) {
  if (!audit || typeof audit.entries !== 'function') throw new Error('AUDIT_REQUIRED');
  const app = express.Router();
  app.get('/api/v4/audit/search', (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    const actor = req.query.actor || null;
    const action = req.query.action || null;
    const from = req.query.from ? new Date(req.query.from).getTime() : null;
    const to = req.query.to ? new Date(req.query.to).getTime() : null;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const all = audit.entries({ tenantId });
    const filtered = all.filter(e => {
      if (actor && e.actor !== actor) return false;
      if (action && e.action !== action) return false;
      if (from && e.t < from) return false;
      if (to && e.t > to) return false;
      return true;
    });
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    res.json({ total: filtered.length, page, limit, items });
  });
  return app;
}

module.exports = { newAuditChainSearch };
