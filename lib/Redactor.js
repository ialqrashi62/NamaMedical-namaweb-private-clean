'use strict';

/**
 * Redactor — strips PHI from any object before logging,
 * before LLM input, before audit.
 * SAFETY RAIL 12.
 */
const PHI_KEYS = new Set([
  'national_id', 'nationalid', 'id_number', 'ssn', 'iqama_number',
  'phone', 'mobile', 'email', 'address', 'name', 'full_name', 'first_name',
  'last_name', 'mrn', 'date_of_birth', 'dob', 'birthdate',
  'patient_name', 'patient_id', 'patient_mrn',
]);
const PHI_REGEX = [
  /\b\d{10}\b/g,                       // Saudi-style national ID 10 digits
  /\b05\d{8}\b/g,                      // Saudi mobile
  /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g,       // credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,   // date
];

class Redactor {
  redactLog(obj) {
    if (obj == null) return obj;
    if (typeof obj !== 'object') return this._scrubStr(obj);
    if (Array.isArray(obj)) return obj.map(o => this.redactLog(o));
    const r = {};
    for (const k of Object.keys(obj)) {
      if (PHI_KEYS.has(k.toLowerCase())) {
        r[k] = '<PHI>';
      } else if (obj[k] && typeof obj[k] === 'object') {
        r[k] = this.redactLog(obj[k]);
      } else if (typeof obj[k] === 'string') {
        r[k] = this._scrubStr(obj[k]);
      } else {
        r[k] = obj[k];
      }
    }
    return r;
  }

  _scrubStr(s) {
    if (typeof s !== 'string') return s;
    let r = s;
    for (const re of PHI_REGEX) r = r.replace(re, '<PHI>');
    return r;
  }

  /** Same as redactLog — same shape; output may include PHI but never echoed in HTTP log. */
  redactOutput(obj) {
    return this.redactLog(obj);
  }

  /** Hash-only identifier for cross-tenant-safe audit linkage. */
  hashId(id, salt) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(String(salt || '') + String(id)).digest('hex').slice(0, 16);
  }
}

module.exports = { Redactor };
