// routes/voice.js
// P23 — Voice / ASR Clinical Dictation HTTP surface.
// Endpoints (all under /api/v4/voice):
//   POST /api/v4/voice/session                  → start
//   POST /api/v4/voice/session/:id/chunk        → append ASR chunk
//   POST /api/v4/voice/session/:id/finalize     → emit structured note
//   GET  /api/v4/voice/session/:id              → get transcript + note
//   GET  /api/v4/voice/patient/:patientId       → list sessions
//   GET  /api/v4/voice/models                   → list ASR models
//
// Tenant-scoped (RAIL-5), auth-gated (RAIL-13). Fail-closed on missing
// tenant (RAIL-11). PHI is redacted before persistence (RAIL-12). No
// audio bytes are ever stored; only redacted text, NER entities, and
// the structured note.

'use strict';

const express = require('express');
const RouteGuards = require('../lib/route-guards');
const Asr = require('../lib/voice/asr');
const Dictation = require('../lib/voice/dictation');

// Process-wide dictation manager.
const _sessions = new Dictation();

function newVoiceRouter() {
  const app = express.Router();
  app.use(express.json({ limit: '2mb' }));

  function _guard(req, res, next) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'nurse'])) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (typeof next === 'function') next();
  }

  // GET /api/v4/voice/models
  app.get('/api/v4/voice/models', _guard, (req, res) => {
    try {
      const list = Object.keys(Asr.VOICE_MODELS).map(function (id) {
        const m = Asr.VOICE_MODELS[id];
        return {
          model: id,
          vendor: m.vendor,
          sampleRate: m.sampleRate,
          lang: m.lang.slice(),
          defaultLang: m.defaultLang,
          notes: m.notes
        };
      });
      res.json({ ok: true, count: list.length, models: list });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/voice/session
  //   body: { patientId, kind?, lang?, actorId? }
  app.post('/api/v4/voice/session', _guard, (req, res) => {
    try {
      const body = req.body || {};
      const actorId = body.actorId || (req.user && (req.user.id || req.user.userId)) || null;
      const out = _sessions.start({
        tenantId: req.tenantId,
        patientId: body.patientId,
        kind: body.kind,
        lang: body.lang,
        actorId: actorId
      });
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true, session: out.session });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/voice/session/:id/chunk
  //   body: { audio (string b64 | { text?, lang?, durationMs? }), model? }
  app.post('/api/v4/voice/session/:id/chunk', _guard, (req, res) => {
    try {
      const body = req.body || {};
      const out = _sessions.appendChunk({
        sessionId: req.params.id,
        audio: body.audio,
        model: body.model
      });
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true, sessionId: out.sessionId, chunkCount: out.chunkCount, lastText: out.lastText });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/voice/session/:id/finalize
  //   body: { correctedText? }
  app.post('/api/v4/voice/session/:id/finalize', _guard, (req, res) => {
    try {
      const body = req.body || {};
      const out = _sessions.finalize({
        sessionId: req.params.id,
        correctedText: body.correctedText
      });
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true, session: out.session });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/v4/voice/session/:id/cancel
  app.post('/api/v4/voice/session/:id/cancel', _guard, (req, res) => {
    try {
      const out = _sessions.cancel({ sessionId: req.params.id });
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true, sessionId: out.sessionId, status: out.status });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/voice/session/:id
  app.get('/api/v4/voice/session/:id', _guard, (req, res) => {
    try {
      const out = _sessions.get({ sessionId: req.params.id });
      if (!out.ok) return res.status(404).json({ error: out.error });
      res.json({ ok: true, session: out.session });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // GET /api/v4/voice/patient/:patientId
  app.get('/api/v4/voice/patient/:patientId', _guard, (req, res) => {
    try {
      const out = _sessions.listForPatient({
        tenantId: req.tenantId,
        patientId: req.params.patientId
      });
      res.json({ ok: true, count: out.length, sessions: out });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

module.exports = { newVoiceRouter };
