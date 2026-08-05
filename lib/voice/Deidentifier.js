'use strict';
// Deidentifier — strips PHI tokens before they reach the LLM.
// Recognizes: national-id, phone, email, name patterns.

function newDeidentifier() {
  const re = {
    nid: /\b\d{10}\b/g,
    phone: /(?:\+966|0)(?:\d[\s-]?){8,9}\d/g,
    email: /\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
    name: /\b(?:Mr|Mrs|Ms|Dr|Sr|Jr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
  };
  function strip(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(re.nid, '[REDACTED-NID]')
      .replace(re.phone, '[REDACTED-PHONE]')
      .replace(re.email, '[REDACTED-EMAIL]')
      .replace(re.name, '[REDACTED-NAME]');
  }
  return { strip };
}

module.exports = { newDeidentifier };
