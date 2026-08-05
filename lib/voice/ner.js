// lib/voice/ner.js
// Medical NER (Named Entity Recognition) for clinical dictation.
// Pure JS, no npm install. No real ML model — deterministic pattern
// + dictionary lookups so downstream code is testable.
//
// Entity types:
//   - DRUG        (e.g. "amoxicillin 500 mg", "paracetamol")
//   - DOSE        ("500 mg", "5 ml", "1 tab")
//   - ROUTE       ("PO", "IV", "IM", "SC", "PR", "topical", "inhaled")
//   - FREQUENCY   ("BID", "TID", "QID", "Q4H", "Q6H", "PRN", "once daily")
//   - DIAGNOSIS   (ICD-10 text match from a small dictionary)
//   - BODY_PART   (anatomical terms)
//   - PROCEDURE   (clinical procedures)
//   - NEGATION    (cue that flips polarity of the prior entity)
//
// Each extraction returns:
//   { type, text, start, end, normalized, code?, negated? }
//
// Negation is the simple ConText-style approach: any entity in the
// same sentence as a negation cue ("no", "denies", "without", "not",
// "negative for", Arabic/Urdu equivalents) is marked negated=true.

'use strict';

// ---- dictionaries ------------------------------------------------------

const DRUGS = [
  'amoxicillin', 'paracetamol', 'acetaminophen', 'ibuprofen', 'metformin',
  'lisinopril', 'atorvastatin', 'clopidogrel', 'warfarin', 'aspirin',
  'metoprolol', 'omeprazole', 'amiodarone', 'furosemide', 'morphine',
  'codeine', 'azathioprine', 'simvastatin', 'irinotecan', 'abacavir',
  'fluoro-uracil', 'fluorouracil', '5-fu', 'capecitabine'
];

const ROUTES = ['po', 'iv', 'im', 'sc', 'pr', 'topical', 'inhaled', 'oral', 'ng', 'peg', 'sl', 'td'];
const FREQUENCIES = ['bid', 'tid', 'qid', 'q4h', 'q6h', 'q8h', 'q12h', 'prn', 'qd', 'od', 'hs', 'ac', 'pc', 'once daily', 'twice daily', 'three times daily'];

const BODY_PARTS = [
  'head', 'chest', 'abdomen', 'back', 'left arm', 'right arm', 'left leg', 'right leg',
  'heart', 'lung', 'liver', 'kidney', 'stomach', 'bowel', 'skin', 'throat', 'ear', 'eye',
  'knee', 'ankle', 'wrist', 'shoulder', 'hip', 'spine', 'neck', 'forehead', 'jaw', 'elbow',
  'صدر', 'بطن', 'رأس', 'قلب', 'كلية', 'كلى', 'كبد', 'معدة', 'جلد', 'حنجرة', 'ركبة', 'كتف'
];

const PROCEDURES = [
  'ecg', 'ekg', 'echocardiogram', 'x-ray', 'xray', 'ct scan', 'mri', 'ultrasound',
  'biopsy', 'colonoscopy', 'endoscopy', 'bronchoscopy', 'suture', 'intubation',
  'catheterization', 'dialysis', 'lumbar puncture', 'blood transfusion',
  'تخطيط قلب', 'أشعة', 'تنظير', 'غسيل كلى'
];

// A pragmatic ICD-10 dictionary. Each entry: { text, code }.
// Matching is case-insensitive and uses word boundaries.
const DIAGNOSES = [
  { text: 'diabetes mellitus type 2',     code: 'E11.9' },
  { text: 'type 2 diabetes',              code: 'E11.9' },
  { text: 'diabetes',                     code: 'E11.9' },
  { text: 'hypertension',                 code: 'I10' },
  { text: 'essential hypertension',      code: 'I10' },
  { text: 'atrial fibrillation',          code: 'I48.91' },
  { text: 'pneumonia',                    code: 'J18.9' },
  { text: 'asthma',                       code: 'J45.909' },
  { text: 'copd',                         code: 'J44.9' },
  { text: 'acute coronary syndrome',      code: 'I24.9' },
  { text: 'myocardial infarction',        code: 'I21.9' },
  { text: 'heart failure',                code: 'I50.9' },
  { text: 'ckd',                          code: 'N18.9' },
  { text: 'chronic kidney disease',       code: 'N18.9' },
  { text: 'stroke',                       code: 'I63.9' },
  { text: 'cerebrovascular accident',     code: 'I63.9' },
  { text: 'anemia',                       code: 'D64.9' },
  { text: 'hypothyroidism',               code: 'E03.9' },
  { text: 'depression',                   code: 'F32.9' },
  { text: 'anxiety',                      code: 'F41.9' },
  { text: 'urinary tract infection',      code: 'N39.0' },
  { text: 'uti',                          code: 'N39.0' },
  { text: 'chest pain',                   code: 'R07.9' },
  { text: 'abdominal pain',               code: 'R10.9' },
  { text: 'fever',                        code: 'R50.9' },
  { text: 'cough',                        code: 'R05' },
  { text: 'shortness of breath',          code: 'R06.0' },
  { text: 'dyspnea',                      code: 'R06.0' },
  // Arabic
  { text: 'السكري',                       code: 'E11.9' },
  { text: 'ارتفاع ضغط الدم',             code: 'I10' },
  { text: 'الالتهاب الرئوي',             code: 'J18.9' },
  { text: 'فشل القلب',                   code: 'I50.9' },
  { text: 'الربو',                        code: 'J45.909' }
];

// ---- negation cues -----------------------------------------------------

const NEG_CUES = [
  // English
  /\bno\b/i, /\bnot\b/i, /\bdenies?\b/i, /\bdenied\b/i, /\bwithout\b/i,
  /\bnegative for\b/i, /\brule[ -]?out\b/i, /\bruled out\b/i,
  // Arabic
  /لا\s+يعاني/i, /لا\s+يوجد/i, /ينفي/i, /بدون/i, /سلبي/i,
  // French
  /pas\s+de/i, /aucun/i, /négatif/i,
  // Urdu
  /نہیں/i, /بغیر/i
];

// ---- core extraction ---------------------------------------------------

function _escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function _matchAll(text, dict) {
  const hits = [];
  for (let i = 0; i < dict.length; i++) {
    const term = dict[i];
    if (!term) continue;
    const pat = new RegExp('\\b' + _escape(term) + '\\b', 'gi');
    let m;
    while ((m = pat.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  return hits;
}

function _hasNegationCueNear(text, start, end) {
  // Scope the negation check to the *current sentence*: look back only
  // to the last sentence-ending punctuation (or 80 chars, whichever is
  // shorter) so a "no" in a prior sentence does not negate an entity
  // in a later sentence.
  const before = text.slice(0, start);
  const sentenceBreaks = /[.!?؟۔\n]/g;
  let lastBreak = -1;
  let m;
  while ((m = sentenceBreaks.exec(before)) !== null) {
    lastBreak = m.index;
  }
  const sliceStart = Math.max(0, Math.max(lastBreak + 1, start - 80));
  const sentence = (before.slice(sliceStart) + ' ' + text.slice(end, end + 20)).toLowerCase();
  for (let i = 0; i < NEG_CUES.length; i++) {
    if (NEG_CUES[i].test(sentence)) return true;
  }
  return false;
}

function _entitiesFromHits(type, hits, text) {
  const out = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    out.push({
      type: type,
      text: h.text,
      start: h.start,
      end: h.end,
      normalized: h.text.toLowerCase().trim(),
      negated: _hasNegationCueNear(text, h.start, h.end)
    });
  }
  return out;
}

// Extract drug entities, including the dose that immediately follows.
// We don't try to be perfect — we capture "drug <number><unit>" pairs.
function _extractDrugs(text) {
  const drugHits = _matchAll(text, DRUGS);
  const out = [];
  for (let i = 0; i < drugHits.length; i++) {
    const h = drugHits[i];
    const trailing = text.slice(h.end, h.end + 40);
    const doseMatch = trailing.match(/^\s*(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ml|iu|units?|tab(?:let)?s?|cap(?:sule)?s?)\b/i);
    const routeMatch = trailing.match(/^\s*(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ml|iu|units?|tab(?:let)?s?|cap(?:sule)?s?)\s+(po|iv|im|sc|pr|ng|sl|td|topical|inhaled|oral)\b/i);
    const freqMatch = trailing.match(/\b(q\d+h|bid|tid|qid|prn|qd|od|hs|ac|pc|once daily|twice daily|three times daily)\b/i);

    out.push({
      type: 'DRUG',
      text: h.text,
      start: h.start,
      end: h.end,
      normalized: h.text.toLowerCase().trim(),
      dose: doseMatch ? { value: parseFloat(doseMatch[1]), unit: doseMatch[2].toLowerCase() } : null,
      route: routeMatch ? routeMatch[3].toLowerCase() : null,
      frequency: freqMatch ? freqMatch[1].toLowerCase() : null,
      negated: _hasNegationCueNear(text, h.start, h.end)
    });
  }
  return out;
}

function _extractDoses(text) {
  // Standalone doses (not anchored to a drug) — captured for completeness.
  const re = /\b(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ml|iu|units?|tab(?:let)?s?|cap(?:sule)?s?)\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      type: 'DOSE',
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      normalized: (parseFloat(m[1]) + ' ' + m[2].toLowerCase()),
      value: parseFloat(m[1]),
      unit: m[2].toLowerCase(),
      negated: _hasNegationCueNear(text, m.index, m.index + m[0].length)
    });
  }
  return out;
}

function _extractDiagnoses(text) {
  const out = [];
  for (let i = 0; i < DIAGNOSES.length; i++) {
    const d = DIAGNOSES[i];
    const pat = new RegExp(_escape(d.text), 'gi');
    let m;
    while ((m = pat.exec(text)) !== null) {
      out.push({
        type: 'DIAGNOSIS',
        text: m[0],
        start: m.index,
        end: m.index + m[0].length,
        normalized: d.text.toLowerCase(),
        code: d.code,
        negated: _hasNegationCueNear(text, m.index, m.index + m[0].length)
      });
    }
  }
  return out;
}

function extract(text) {
  if (typeof text !== 'string' || !text) return { entities: [], negated: 0 };

  const drugs = _extractDrugs(text);
  const doses = _extractDoses(text);
  const routes = _entitiesFromHits('ROUTE', _matchAll(text, ROUTES), text);
  const freqs  = _entitiesFromHits('FREQUENCY', _matchAll(text, FREQUENCIES), text);
  const bodies = _entitiesFromHits('BODY_PART', _matchAll(text, BODY_PARTS), text);
  const procs  = _entitiesFromHits('PROCEDURE', _matchAll(text, PROCEDURES), text);
  const dx     = _extractDiagnoses(text);

  const all = drugs.concat(doses, routes, freqs, bodies, procs, dx)
    .sort(function (a, b) { return a.start - b.start; });

  let neg = 0;
  for (let i = 0; i < all.length; i++) if (all[i].negated) neg++;

  // De-duplicate exact ranges.
  const seen = Object.create(null);
  const unique = [];
  for (let i = 0; i < all.length; i++) {
    const k = all[i].type + '|' + all[i].start + '|' + all[i].end + '|' + all[i].text.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    unique.push(all[i]);
  }

  return { entities: unique, negated: neg, count: unique.length };
}

module.exports = {
  extract: extract,
  DRUGS: DRUGS,
  DIAGNOSES: DIAGNOSES,
  ROUTES: ROUTES,
  FREQUENCIES: FREQUENCIES,
  BODY_PARTS: BODY_PARTS,
  PROCEDURES: PROCEDURES
};
