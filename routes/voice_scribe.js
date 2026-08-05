'use strict';
const express = require('express');
const { newDeidentifier } = require('../lib/voice/Deidentifier');
const { newSOAPBuilder } = require('../lib/voice/SOAPBuilder');

function newVoiceScribe() {
  const app = express.Router();
  app.use(express.json({ limit: '2mb' }));
  const deid = newDeidentifier();
  const soap = newSOAPBuilder();

  app.post('/api/v4/voice/transcribe', (req, res) => {
    const { tenantId, transcript } = req.body || {};
    if (!tenantId || !transcript) return res.status(400).json({ error: 'TENANT_AND_TRANSCRIPT_REQUIRED' });
    const stripped = deid.strip(transcript);
    const note = soap.build({ transcript: stripped });
    res.json({ ok: true, note, redacted: stripped !== transcript });
  });

  return app;
}

module.exports = { newVoiceScribe };
