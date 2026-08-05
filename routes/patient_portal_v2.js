'use strict';
const express = require('express');

function newPatientPortalV2() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));
  // Dev/test tenant header trust (GATE-4 aligned).
  try { app.use(require('../lib/dev-ctx')); } catch (_e) {}
  const appts = new Map();
  const telehealth = new Map();

  app.post('/appointment', (req, res) => {
    const tenantId = req.tenantId || (req.body && req.body.tenantId);
    const patientId = req.user && req.user.id;
    const { slot, provider } = req.body || {};
    if (!tenantId || !patientId || !slot) return res.status(400).json({ error: 'TENANT_PATIENT_SLOT_REQUIRED' });
    const id = 'a-' + Date.now();
    appts.set(id, { id, tenantId, patientId, slot, provider, booked: true });
    res.json({ ok: true, id });
  });

  app.get('/me', (req, res) => {
    res.json({
      ok: true,
      tenantId: req.tenantId || null,
      user: req.user || null,
      version: 'patient-portal-v2'
    });
  });

  app.post('/telehealth/start', (req, res) => {
    const tenantId = req.tenantId || (req.body && req.body.tenantId);
    const patientId = req.user && req.user.id;
    if (!tenantId || !patientId) return res.status(400).json({ error: 'TENANT_PATIENT_REQUIRED' });
    const room = 'room-' + Math.random().toString(36).slice(2, 10);
    telehealth.set(room, { tenantId, patientId, joinedAt: Date.now() });
    res.json({ ok: true, room });
  });

  return app;
}

module.exports = { newPatientPortalV2 };
