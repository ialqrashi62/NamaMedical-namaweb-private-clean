'use strict';
// StructuredLogger.js — JSON-line logger with PHI redaction (rail 12).
// No external deps. Outputs to stdout (process.stdout) AND optionally a file.

const fs = require('fs');
const path = require('path');
const { Redactor } = require('./Redactor');

// Default deny-list (case-insensitive keys)
const PHI_KEYS = new Set([
  'password', 'token', 'authorization', 'cookie', 'csrf',
  'nationalid', 'national_id', 'ssn', 'email', 'phone',
  'mobile', 'address', 'birth', 'dob', 'name', 'mrn', 'patientname',
  'patientName', 'patient_id', 'patientid',
]);

function redactValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    // phone patterns
    return v
      .replace(/\b\d{10,15}\b/g, '<PHI>')
      .replace(/\b0?5\d{8}\b/g, '<PHI>')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}/g, '<PHI>');
  }
  return v;
}

function deepRedact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepRedact);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (PHI_KEYS.has(k.toLowerCase())) {
      out[k] = '<PHI>';
    } else {
      out[k] = deepRedact(obj[k]);
    }
  }
  return out;
}

class StructuredLogger {
  constructor(opts = {}) {
    this.service = opts.service || 'nama-medical';
    this.env = opts.env || process.env.NODE_ENV || 'sandbox';
    this.hostname = opts.hostname || require('os').hostname();
    this.file = opts.file || null;
    if (this.file) {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this._stream = fs.createWriteStream(this.file, { flags: 'a' });
    }
  }
  _emit(level, msg, fields) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: this.service,
      env: this.env,
      hostname: this.hostname,
      msg,
      ...deepRedact(fields || {}),
    }) + '\n';
    process.stdout.write(line);
    if (this._stream) this._stream.write(line);
  }
  info(msg, fields) { this._emit('info', msg, fields); }
  warn(msg, fields) { this._emit('warn', msg, fields); }
  error(msg, fields) { this._emit('error', msg, fields); }
  debug(msg, fields) { if (process.env.LOG_LEVEL === 'debug') this._emit('debug', msg, fields); }
}

module.exports = { StructuredLogger, redactValue, deepRedact, PHI_KEYS };
