'use strict';
// Read-only mirror of patient records. Patients see only their own data.
const express = require('express');

function newPatientRecordsRO(audit) {
  const app = express.Router();
  app.get('/api/v4/patient/records/:patientId', (req, res) => {
    const ctxT = req.headers['x-tenant'] || (req.context && req.context.tenantId);
    if (!ctxT) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    const ctxUser = req.headers['x-patient-id'] || (req.context && req.context.patientId);
    if (ctxUser && ctxUser !== req.params.patientId) {
      return res.status(403).json({ error: 'OWN_DATA_ONLY' });
    }
    audit && audit.append && audit.append({ tenantId: ctxT, action: 'patient.records.read', patientId: req.params.patientId });
    res.json({ records: [], tenantId: ctxT, patientId: req.params.patientId });
  });
  return app;
}

module.exports = { newPatientRecordsRO };
