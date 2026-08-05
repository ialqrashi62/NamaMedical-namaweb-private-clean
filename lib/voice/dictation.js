// lib/voice/dictation.js
// Dictation session manager. Pure JS, no npm install. Tenant-scoped
// (RAIL-5). Fail-closed (RAIL-11). No PHI in logs (RAIL-12).
//
// A DictationSession is the lifecycle wrapper around an ASR stream.
// It accumulates chunks (real or text-seeded), runs NER on the
// finalized transcript, and emits a structured clinical note:
//   - SOAP (Subjective/Objective/Assessment/Plan)
//   - Progress (free-form with extracted entities)
//   - Procedure (pre-op / post-op / op-note sections)
//
// All transcripts are PHI-redacted before persistence (RAIL-12).
// Voice data (raw audio bytes) is NEVER stored — we only keep
// redacted text, NER entities, and the structured note.

'use strict';

const crypto = require('crypto');
const Asr = require('./asr');
const Ner = require('./ner');

const _KINDS = ['SOAP', 'Progress', 'Procedure'];
const _STATUS = ['started', 'streaming', 'finalized', 'cancelled'];

function _nowIso() { return new Date().toISOString(); }
function _newId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex') + '_' + Date.now().toString(36);
}

function DictationSession() {
  this._sessions = Object.create(null);
  this._byPatient = Object.create(null);
}

function _patientKey(tenantId, patientId) {
  return tenantId + '::' + patientId;
}

DictationSession.prototype.start = function (req) {
  if (!req || typeof req !== 'object') return { ok: false, error: 'BAD_REQUEST' };
  if (!req.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
  if (!req.patientId) return { ok: false, error: 'PATIENT_REQUIRED' };
  if (!req.actorId) return { ok: false, error: 'ACTOR_REQUIRED' };

  const kind = (typeof req.kind === 'string' && _KINDS.indexOf(req.kind) !== -1) ? req.kind : 'SOAP';
  const lang = (typeof req.lang === 'string') ? req.lang : 'en-US';

  const sessionId = _newId('dict');
  const session = {
    sessionId: sessionId,
    tenantId: req.tenantId,
    patientId: req.patientId,
    actorId: req.actorId,
    kind: kind,
    lang: lang,
    status: 'started',
    chunks: [],
    transcript: '',
    transcriptRedacted: '',
    entities: [],
    structured: null,
    createdAt: _nowIso(),
    updatedAt: _nowIso(),
    finalizedAt: null,
    cancelledAt: null,
    durationMs: 0
  };
  this._sessions[sessionId] = session;
  const pk = _patientKey(req.tenantId, req.patientId);
  if (!this._byPatient[pk]) this._byPatient[pk] = [];
  this._byPatient[pk].push(sessionId);

  return { ok: true, sessionId: sessionId, session: _summary(session) };
};

DictationSession.prototype.appendChunk = function (req) {
  if (!req || !req.sessionId) return { ok: false, error: 'SESSION_REQUIRED' };
  const s = this._sessions[req.sessionId];
  if (!s) return { ok: false, error: 'SESSION_NOT_FOUND' };
  if (s.status === 'finalized' || s.status === 'cancelled') {
    return { ok: false, error: 'SESSION_CLOSED' };
  }
  if (!req.audio) return { ok: false, error: 'AUDIO_REQUIRED' };

  const model = (typeof req.model === 'string') ? req.model : 'whisper-large-v3';
  const result = Asr.transcribe({ model: model, audio: req.audio, lang: s.lang });
  s.chunks.push({
    ts: _nowIso(),
    text: result.text,
    lang: result.lang,
    durationMs: result.durationMs || 0,
    confidence: result.confidence
  });
  // Concat redacted transcripts. The ASR already redacts each chunk.
  s.transcript = (s.transcript ? s.transcript + ' ' : '') + result.text;
  s.transcriptRedacted = s.transcript; // already redacted by ASR
  if (typeof result.durationMs === 'number') s.durationMs += result.durationMs;
  s.status = 'streaming';
  s.updatedAt = _nowIso();

  return { ok: true, sessionId: s.sessionId, chunkCount: s.chunks.length, lastText: result.text };
};

DictationSession.prototype.finalize = function (req) {
  if (!req || !req.sessionId) return { ok: false, error: 'SESSION_REQUIRED' };
  const s = this._sessions[req.sessionId];
  if (!s) return { ok: false, error: 'SESSION_NOT_FOUND' };
  if (s.status === 'finalized') return { ok: false, error: 'ALREADY_FINALIZED' };
  if (s.status === 'cancelled') return { ok: false, error: 'SESSION_CANCELLED' };

  // If the caller provides a correctedText, use that (already a clinical
  // manual correction). We still re-redact PHI per RAIL-12.
  if (req.correctedText && typeof req.correctedText === 'string') {
    const r = Asr.redactPHI(req.correctedText);
    s.transcript = req.correctedText;
    s.transcriptRedacted = r.redacted;
  } else if (!s.transcriptRedacted) {
    return { ok: false, error: 'NO_TRANSCRIPT' };
  }

  // NER pass on the redacted transcript.
  const ner = Ner.extract(s.transcriptRedacted);
  s.entities = ner.entities;

  // Build the structured note.
  s.structured = _buildStructured(s.kind, s.transcriptRedacted, ner.entities, s.lang);
  s.status = 'finalized';
  s.finalizedAt = _nowIso();
  s.updatedAt = s.finalizedAt;

  // Finalize always returns the full session payload (transcript, NER,
  // structured note) since that is the point of calling finalize.
  return { ok: true, sessionId: s.sessionId, session: _summary(s, true) };
};

DictationSession.prototype.cancel = function (req) {
  if (!req || !req.sessionId) return { ok: false, error: 'SESSION_REQUIRED' };
  const s = this._sessions[req.sessionId];
  if (!s) return { ok: false, error: 'SESSION_NOT_FOUND' };
  if (s.status === 'finalized') return { ok: false, error: 'ALREADY_FINALIZED' };
  s.status = 'cancelled';
  s.cancelledAt = _nowIso();
  s.updatedAt = s.cancelledAt;
  // Drop audio chunks to keep nothing in memory past cancel.
  s.chunks = [];
  s.transcript = '';
  s.transcriptRedacted = '';
  return { ok: true, sessionId: s.sessionId, status: s.status };
};

DictationSession.prototype.get = function (req) {
  if (!req || !req.sessionId) return { ok: false, error: 'SESSION_REQUIRED' };
  const s = this._sessions[req.sessionId];
  if (!s) return { ok: false, error: 'SESSION_NOT_FOUND' };
  return { ok: true, session: _summary(s, true) };
};

DictationSession.prototype.listForPatient = function (req) {
  if (!req || !req.tenantId || !req.patientId) return [];
  const pk = _patientKey(req.tenantId, req.patientId);
  const ids = this._byPatient[pk] || [];
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const s = this._sessions[ids[i]];
    if (s) out.push(_summary(s));
  }
  return out;
};

// ---- helpers -----------------------------------------------------------

function _summary(s, full) {
  const base = {
    sessionId: s.sessionId,
    tenantId: s.tenantId,
    patientId: s.patientId,
    actorId: s.actorId,
    kind: s.kind,
    lang: s.lang,
    status: s.status,
    durationMs: s.durationMs,
    chunkCount: s.chunks.length,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    finalizedAt: s.finalizedAt
  };
  if (full) {
    base.transcript = s.transcriptRedacted; // never expose unredacted
    base.entities = s.entities;
    base.structured = s.structured;
  }
  return base;
}

function _buildStructured(kind, transcript, entities, lang) {
  if (kind === 'SOAP') return _buildSOAP(transcript, entities, lang);
  if (kind === 'Progress') return _buildProgress(transcript, entities);
  if (kind === 'Procedure') return _buildProcedure(transcript, entities, lang);
  return _buildProgress(transcript, entities);
}

function _buildSOAP(transcript, entities, lang) {
  // Heuristic splitter: route each sentence to the section whose
  // keyword it most matches. Unmatched sentences land in Subjective.
  const subjective = [];
  const objective  = [];
  const assessment = [];
  const plan       = [];

  const objKeys  = ['bp ', 'hr ', 'temp', 'rr ', 'o2 sat', 'spo2', 'exam', 'auscultation', 'palpation', 'labs', 'ecg', 'ct ', 'mri'];
  const asmtKeys = ['assessment:', 'a:', 'impression:', 'diagnosis', 'likely', 'probable', 'consistent with'];
  const planKeys = ['plan:', 'p:', 'will ', 'recommend', 'prescribe', 'follow up', 'follow-up', 'refer to', 'order ', 'continue ', 'start ', 'discontinue '];

  const sentences = transcript.split(/(?<=[.!?؟۔])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    const lo = s.toLowerCase();
    let bucket = 'subjective';
    if (asmtKeys.some(function (k) { return lo.indexOf(k) !== -1; })) bucket = 'assessment';
    else if (planKeys.some(function (k) { return lo.indexOf(k) !== -1; })) bucket = 'plan';
    else if (objKeys.some(function (k) { return lo.indexOf(k) !== -1; })) bucket = 'objective';
    if (bucket === 'subjective') subjective.push(s);
    else if (bucket === 'objective') objective.push(s);
    else if (bucket === 'assessment') assessment.push(s);
    else plan.push(s);
  }

  // Surface the key entities into the Assessment block so a clinician
  // can verify the auto-extraction at a glance.
  const dx = entities.filter(function (e) { return e.type === 'DIAGNOSIS'; });
  const drugs = entities.filter(function (e) { return e.type === 'DRUG'; });
  const neg = entities.filter(function (e) { return e.negated; }).length;

  return {
    kind: 'SOAP',
    lang: lang || 'en-US',
    sections: {
      subjective: subjective,
      objective: objective,
      assessment: assessment,
      plan: plan
    },
    extracted: {
      diagnoses: dx.map(function (d) { return { text: d.text, code: d.code, negated: !!d.negated }; }),
      drugs: drugs.map(function (d) { return { text: d.text, dose: d.dose, route: d.route, frequency: d.frequency, negated: !!d.negated }; })
    },
    summary: {
      sentences: sentences.length,
      entities: entities.length,
      negated: neg
    }
  };
}

function _buildProgress(transcript, entities) {
  return {
    kind: 'Progress',
    body: transcript,
    extracted: {
      diagnoses: entities.filter(function (e) { return e.type === 'DIAGNOSIS'; })
        .map(function (d) { return { text: d.text, code: d.code, negated: !!d.negated }; }),
      drugs: entities.filter(function (e) { return e.type === 'DRUG'; })
        .map(function (d) { return { text: d.text, dose: d.dose, route: d.route, frequency: d.frequency, negated: !!d.negated }; }),
      procedures: entities.filter(function (e) { return e.type === 'PROCEDURE'; })
        .map(function (p) { return { text: p.text, negated: !!p.negated }; })
    },
    summary: { entities: entities.length, negated: entities.filter(function (e) { return e.negated; }).length }
  };
}

function _buildProcedure(transcript, entities, lang) {
  // Procedure notes typically have: indication, op-note, post-op.
  const sections = { indication: [], opNote: [], postOp: [] };
  const opKeys = ['incision', 'dissection', 'closure', 'anastomosis', 'sutures', 'suture', 'drain', 'estimated blood loss', 'ebl'];
  const postKeys = ['post-op', 'postop', 'post op', 'recovered', 'stable', 'tolerated', 'to pacu', 'to icu', 'to ward'];

  const sentences = transcript.split(/(?<=[.!?؟۔])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    const lo = s.toLowerCase();
    if (postKeys.some(function (k) { return lo.indexOf(k) !== -1; })) sections.postOp.push(s);
    else if (opKeys.some(function (k) { return lo.indexOf(k) !== -1; })) sections.opNote.push(s);
    else sections.indication.push(s);
  }

  return {
    kind: 'Procedure',
    lang: lang || 'en-US',
    sections: sections,
    extracted: {
      procedures: entities.filter(function (e) { return e.type === 'PROCEDURE'; })
        .map(function (p) { return { text: p.text, negated: !!p.negated }; }),
      bodyParts: entities.filter(function (e) { return e.type === 'BODY_PART'; })
        .map(function (b) { return { text: b.text, negated: !!b.negated }; })
    },
    summary: { entities: entities.length }
  };
}

module.exports = DictationSession;
module.exports.KINDS = _KINDS;
module.exports.STATUS = _STATUS;
