'use strict';
// Re-identification pre-pass for LLM. Wraps voice/Deidentifier + extra checks
// for tokens that look like dates, locations, MRN.

function newDeidentify() {
  const re = {
    date: /\b\d{4}-\d{2}-\d{2}\b/g,
    mrn: /\bMRN[-:\s]?\d{6,}\b/gi,
    loc: /\b(?:Saudi Arabia|Riyadh|Jeddah|Mecca)\b/g,
  };
  function strip(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(re.date, '[REDACTED-DATE]')
      .replace(re.mrn, '[REDACTED-MRN]')
      .replace(re.loc, '[REDACTED-LOC]');
  }
  return { strip };
}

module.exports = { newDeidentify };
