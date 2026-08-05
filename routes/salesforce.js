'use strict';
// Routes: Salesforce integration (v4 surface).
// Tenant-scoped, admin/integration role required.
'use strict';
const express = require('express');
const { newSalesforceClient } = require('../lib/integrations/salesforce');
const { newPatient360Sync } = require('../lib/integrations/patient360');
const { newSalesforceStorage } = require('../lib/integrations/storage');
const { newBAAManager } = require('../lib/compliance/baa');

function isAuthed(req) {
  return !!(req && req.user && Array.isArray(req.user.roles));
}
function hasRole(req, allowed) {
  if (!req || !req.user || !Array.isArray(req.user.roles)) return false;
  for (let i = 0; i < allowed.length; i++) {
    if (req.user.roles.indexOf(allowed[i]) !== -1) return true;
  }
  return false;
}

function newSalesforceRouter() {
  const baaMgr = newBAAManager();
  const sf = newSalesforceClient({ baa: baaMgr, mock: true });
  const store = newSalesforceStorage();
  const p360 = newPatient360Sync(sf);
  const allowed = ['admin', 'integration', 'compliance'];

  const app = express.Router();

  function guard(req, res, next) {
    if (!isAuthed(req)) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    if (!hasRole(req, allowed)) return res.status(403).json({ error: 'ROLE_REQUIRED' });
    if (!req.tenantId) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    next();
  }

  app.post('/api/v4/integrations/sf/connect', guard, function (req, res) {
    const out = sf.connect({ tenantId: req.tenantId, instanceUrl: (req.body || {}).instanceUrl, accessToken: (req.body || {}).accessToken });
    if (out.ok) {
      store.setConfig(req.tenantId, { instanceUrl: out.instanceUrl, tokenFingerprint: out.hash, connectedAt: new Date().toISOString(), mappingVersion: sf.FIELD_MAP_VERSION });
    }
    res.json(out);
  });

  app.post('/api/v4/integrations/sf/contact', guard, function (req, res) {
    const out = sf.upsertContact({ tenantId: req.tenantId, contact: (req.body || {}).contact });
    if (out.ok) store.appendSyncLog(req.tenantId, out);
    res.json(out);
  });

  app.post('/api/v4/integrations/sf/opportunity', guard, function (req, res) {
    const out = sf.createOpportunity({ tenantId: req.tenantId, opp: (req.body || {}).opp });
    if (out.ok) store.appendSyncLog(req.tenantId, out);
    res.json(out);
  });

  app.get('/api/v4/integrations/sf/query', guard, function (req, res) {
    const soql = req.query.soql ? String(req.query.soql) : '';
    res.json(sf.query({ tenantId: req.tenantId, soql: soql }));
  });

  app.post('/api/v4/integrations/sf/sync', guard, function (req, res) {
    const since = (req.body && req.body.since) ? req.body.since : null;
    const out = sf.sync({ tenantId: req.tenantId, since: since });
    if (out.ok) store.appendSyncLog(req.tenantId, out);
    res.json(out);
  });

  app.get('/api/v4/integrations/sf/patient360/:patientId', guard, function (req, res) {
    const patientStub = { id: req.params.patientId, name: [{ given: ['Patient'], family: String(req.params.patientId).toUpperCase() }] };
    const mapped = p360.mapPatientToContact(patientStub);
    if (!mapped.ok) return res.status(400).json(mapped);
    const out = sf.upsertContact({ tenantId: req.tenantId, contact: mapped.contact });
    res.json(Object.assign({}, out, { contact: mapped.contact, mappingVersion: sf.FIELD_MAP_VERSION }));
  });

  return app;
}

module.exports = { newSalesforceRouter };
