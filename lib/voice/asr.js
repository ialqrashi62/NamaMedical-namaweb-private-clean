// lib/voice/asr.js
// Mock Whisper-style ASR (Automatic Speech Recognition) for clinical
// dictation. Pure JS, no npm install. No real audio processing.
//
// Models are declarative: each VOICE_MODELS entry declares the
// supported languages and the expected PCM sample rate. We do not
// actually run an acoustic model — we return deterministic,
// input-aware "transcripts" so downstream code (NER, dictation,
// SOAP) is testable end-to-end without GPU or model binaries.
//
// Voice data is NEVER logged (RAIL-12). We expose only:
//   - VOICE_MODELS: catalog
//   - transcribe({ model, audio, lang? }) → { text, lang, confidence, segments }
//   - detectLanguage({ model, audio })  → 'en-US' | 'ar-SA' | 'fr-FR' | 'ur-PK'
//   - segmentBySilence({ audio, minSilenceMs? }) → [{ startMs, endMs, text }]
//   - redactPHI(text)                   → { redacted, hits }
//
// Audio is treated as an opaque base64 string or a typed object. The
// ASR never returns raw PHI back to the caller unredacted.

'use strict';

const crypto = require('crypto');

const VOICE_MODELS = {
  'whisper-large-v3': {
    vendor: 'openai-compat',
    sampleRate: 16000,
    lang: ['en-US', 'ar-SA', 'fr-FR', 'ur-PK'],
    defaultLang: 'en-US',
    notes: 'Multilingual; diarization off by default'
  },
  'whisper-medium-ar': {
    vendor: 'openai-compat',
    sampleRate: 16000,
    lang: ['ar-SA', 'ar-EG'],
    defaultLang: 'ar-SA',
    notes: 'Arabic-optimized, MSA + dialect coverage'
  },
  'whisper-small-clinical': {
    vendor: 'openai-compat',
    sampleRate: 16000,
    lang: ['en-US', 'en-GB'],
    defaultLang: 'en-US',
    notes: 'Clinical fine-tune; medical vocabulary bias'
  }
};

// ---- internal helpers --------------------------------------------------

function _hash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

function _audioLen(audio) {
  if (!audio) return 0;
  if (typeof audio === 'string') return audio.length;
  if (typeof audio === 'object' && audio) {
    if (typeof audio.durationMs === 'number') return audio.durationMs;
    if (typeof audio.b64 === 'string') return audio.b64.length;
    if (typeof audio.bytes === 'number') return audio.bytes;
  }
  return 0;
}

// Lightweight PHI redactor (used by redactPHI; the dictation session
// applies the same rules to the persisted transcript per RAIL-12).
const _PHI_PATTERNS = [
  { re: /\b\d{10}\b/g,                                              tag: '[REDACTED-NID]' },
  { re: /(?:\+966|0)(?:\d[\s-]?){8,9}\d/g,                          tag: '[REDACTED-PHONE]' },
  { re: /\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,                    tag: '[REDACTED-EMAIL]' },
  { re: /\b\d{2}[-/]\d{2}[-/]\d{4}\b/g,                             tag: '[REDACTED-DOB]' },
  { re: /\bMRN[:\s]*[A-Z0-9-]{4,}\b/gi,                             tag: '[REDACTED-MRN]' },
  { re: /\b(?:Mr|Mrs|Ms|Dr|Sr|Jr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, tag: '[REDACTED-NAME]' }
];

function redactPHI(text) {
  if (typeof text !== 'string' || !text) return { redacted: text || '', hits: [] };
  let redacted = text;
  const hits = [];
  for (let i = 0; i < _PHI_PATTERNS.length; i++) {
    const p = _PHI_PATTERNS[i];
    const matches = text.match(p.re);
    if (matches && matches.length) {
      for (let j = 0; j < matches.length; j++) hits.push(matches[j]);
      redacted = redacted.replace(p.re, p.tag);
    }
  }
  return { redacted: redacted, hits: hits, redactedCount: hits.length };
}

// Heuristic language detector. We do not run a real LID model — we
// look at script ranges and a small set of stopwords to pick the
// best supported language for the model.
function _detectScript(text) {
  let arabic = 0, latin = 0, urdu = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06FF) arabic++;
    else if ((c >= 0x0041 && c <= 0x007A) || (c >= 0x00C0 && c <= 0x024F)) latin++;
    else if (c >= 0x0680 && c <= 0x06FF && (text[i] === 'ٹ' || text[i] === 'ڈ' || text[i] === 'پ' || text[i] === 'چ')) urdu++;
  }
  if (urdu > 0) return 'ur-PK';
  if (arabic > latin) return 'ar-SA';
  if (latin > 0) return 'en-US';
  return 'en-US';
}

function detectLanguage(model, audio) {
  const m = VOICE_MODELS[model] || VOICE_MODELS['whisper-large-v3'];
  // If the audio is an object with an explicit `lang`, honor it.
  if (audio && typeof audio === 'object' && typeof audio.lang === 'string') {
    if (m.lang.indexOf(audio.lang) !== -1) return audio.lang;
  }
  // Otherwise peek at any embedded `text` (text-seeded fixtures) and
  // pick a language. Real audio never carries text, so this branch
  // returns the model's default for opaque inputs.
  if (audio && typeof audio === 'object' && typeof audio.text === 'string' && audio.text.length) {
    const guess = _detectScript(audio.text);
    if (m.lang.indexOf(guess) !== -1) return guess;
  }
  return m.defaultLang;
}

// Splits a long transcript into utterance-like segments by detecting
// long pauses (signaled by a "…" or "..." marker or by a sentence-end
// punctuation followed by ≥ minSilenceMs of "silence"). Real audio
// would be VAD-segmented; here we operate on a transcript that the
// mock ASR has already produced.
function segmentBySilence(input) {
  if (!input) return [];
  let text = '';
  let audioLenMs = 0;
  let minSilenceMs = 700;
  if (typeof input === 'string') text = input;
  else if (typeof input === 'object') {
    text = input.text || '';
    audioLenMs = (typeof input.durationMs === 'number') ? input.durationMs : 0;
    if (typeof input.minSilenceMs === 'number') minSilenceMs = input.minSilenceMs;
  }
  if (!text) return [];

  // Split on sentence boundaries and "…" markers. Each segment gets a
  // synthesized timestamp range.
  const parts = text
    .split(/(?:\.\.\.|…|[.!?؟۔]+\s+)/g)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
  if (parts.length === 0) return [];

  const segMs = audioLenMs > 0 ? Math.floor(audioLenMs / parts.length) : 1800;
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      index: i,
      startMs: i * segMs,
      endMs: (i + 1) * segMs,
      text: parts[i]
    });
  }
  return segments;
}

// transcribe — mock ASR. Accepts either an opaque audio string or a
// typed object { b64, text?, lang?, durationMs? } (text-seeded mode
// for testing). Real audio always returns a deterministic placeholder
// so callers can wire downstream code without a real acoustic model.
function transcribe(opts) {
  opts = opts || {};
  if (!opts.model) opts.model = 'whisper-large-v3';
  const model = VOICE_MODELS[opts.model] ? opts.model : 'whisper-large-v3';
  const m = VOICE_MODELS[model];
  const lang = detectLanguage(model, opts.audio);

  // Text-seeded mode: caller provided an intended transcript.
  let text = '';
  if (opts.audio && typeof opts.audio === 'object' && typeof opts.audio.text === 'string') {
    text = opts.audio.text;
  } else {
    // Opaque audio → deterministic placeholder tied to a hash of the
    // payload so callers can correlate chunks. We never invent PHI.
    const seed = _hash(JSON.stringify({ m: model, l: _audioLen(opts.audio) }));
    text = '[mock-asr:' + model + ':' + lang + ':' + seed + ']';
  }

  // Redact PHI before returning to the caller.
  const red = redactPHI(text);
  const segments = segmentBySilence({ text: red.redacted, minSilenceMs: opts.minSilenceMs || 700 });

  return {
    model: model,
    lang: lang,
    confidence: 0.93,
    durationMs: _audioLen(opts.audio),
    text: red.redacted,
    segments: segments,
    redactedCount: red.redactedCount
  };
}

module.exports = {
  VOICE_MODELS: VOICE_MODELS,
  transcribe: transcribe,
  detectLanguage: detectLanguage,
  segmentBySilence: segmentBySilence,
  redactPHI: redactPHI
};
