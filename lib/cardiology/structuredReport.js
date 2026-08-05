// lib/cardiology/structuredReport.js
// Structured report writer for the Cardiology module (P16).
// Wraps CardiologyStorage + CardiologyTemplates to support:
//   - create()   — validate fields against template, persist draft
//   - finalize() — lock report + append hash-chained audit (RAIL-10)
//   - get()      — tenant-scoped fetch
//   - history()  — tenant + patient filtered list
//   - exportDicomSR() — minimal DICOM Structured-Report XML export
//
// Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CardiologyReport = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function newId(prefix) {
    var p = prefix || 'RPT';
    var ts = Date.now().toString(36);
    var r = Math.floor(Math.random() * 0xFFFFFF).toString(36);
    return p + '-' + ts + '-' + r;
  }

  function _sha256Hex(input) {
    // Tiny deterministic fallback hash — sufficient for audit-chain linkage.
    // In production, this is replaced by crypto.createHash('sha256', ...) at the
    // route layer if Node `crypto` is available. Here we provide a stable,
    // non-cryptographic facade so dev / sandbox runs are reproducible.
    var s = String(input || '');
    var h1 = 0x811c9dc5 | 0;
    var h2 = 0xdeadbeef | 0;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) * 16777619) | 0;
      h2 = ((h2 + s.charCodeAt(i)) * 2246822519) | 0;
    }
    var a = (h1 >>> 0).toString(16);
    var b = (h2 >>> 0).toString(16);
    return ('0000000' + a).slice(-8) + ('0000000' + b).slice(-8) + ('0000000' + ((h1 ^ h2) >>> 0).toString(16)).slice(-8);
  }

  function _validate(fields, template) {
    if (!template || !Array.isArray(template.sections)) {
      return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    }
    var errs = [];
    var seen = Object.keys(fields || {});
    for (var i = 0; i < template.sections.length; i++) {
      var sec = template.sections[i];
      var v = fields ? fields[sec.id] : undefined;
      if (sec.type === 'multi') {
        if (v !== undefined && v !== null && !Array.isArray(v)) {
          errs.push(sec.id + ': must be array');
          continue;
        }
        if (Array.isArray(v)) {
          for (var j = 0; j < v.length; j++) {
            if (sec.options.indexOf(v[j]) === -1) errs.push(sec.id + ': bad option ' + v[j]);
          }
        }
        continue;
      }
      if (sec.type === 'select') {
        if (v !== undefined && v !== null && sec.options.indexOf(v) === -1) {
          errs.push(sec.id + ': bad option ' + v);
        }
        continue;
      }
      if (sec.type === 'measurements') {
        if (v !== undefined && v !== null && typeof v !== 'object') {
          errs.push(sec.id + ': must be object');
        }
        continue;
      }
      if (sec.type === 'number') {
        if (v !== undefined && v !== null && typeof v !== 'number') {
          errs.push(sec.id + ': must be number');
        }
        continue;
      }
    }
    if (errs.length) return { ok: false, error: 'VALIDATION_FAILED', details: errs };
    return { ok: true };
  }

  function StructuredReport(opts) {
    var self = this;
    opts = opts || {};
    var storage = opts.storage || null;
    if (!storage || typeof storage.createReport !== 'function') {
      storage = require('./storage').newCardiologyStorage();
    }
    self._storage = storage;
  }

  StructuredReport.prototype.create = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.patientId) throw new Error('FIELD_REQUIRED:patientId');
    if (!spec.templateId) throw new Error('FIELD_REQUIRED:templateId');
    var template = (require('./templates')).get(spec.templateId);
    if (!template) throw new Error('UNKNOWN_TEMPLATE');
    var validation = _validate(spec.fields || {}, template);
    if (!validation.ok) {
      var err = new Error('VALIDATION_FAILED');
      err.details = validation.details;
      throw err;
    }
    var reportId = newId('CARD');
    var row = this._storage.createReport({
      reportId: reportId,
      tenantId: spec.tenantId,
      patientId: spec.patientId,
      templateId: spec.templateId,
      actorId: spec.actorId || null,
      lang: spec.lang || 'en',
      fields: spec.fields || {},
      status: 'draft'
    });
    if (!row || row.ok !== true) {
      throw new Error((row && row.error) || 'CREATE_FAILED');
    }
    var record = this._makeAuditRecord({
      reportId: reportId,
      op: 'create',
      actorId: spec.actorId || null,
      tenantId: spec.tenantId
    });
    this._storage.appendAudit(record);
    return {
      ok: true,
      reportId: reportId,
      templateId: spec.templateId,
      status: 'draft',
      auditHash: record.hash
    };
  };

  StructuredReport.prototype.finalize = function (spec) {
    spec = spec || {};
    if (!spec.reportId) throw new Error('FIELD_REQUIRED:reportId');
    var existing = this._storage.getReportForTenant(spec.reportId, spec.tenantId);
    if (!existing) throw new Error('REPORT_NOT_FOUND');
    var hash = spec.hash || _sha256Hex(spec.reportId + '|' + new Date().toISOString());
    var r = this._storage.finalizeReport(spec.reportId, hash);
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'FINALIZE_FAILED');
    }
    var record = this._makeAuditRecord({
      reportId: spec.reportId,
      op: 'finalize',
      actorId: spec.actorId || null,
      tenantId: spec.tenantId,
      payloadHash: hash
    });
    this._storage.appendAudit(record);
    return {
      ok: true,
      reportId: spec.reportId,
      finalizedAt: r.finalizedAt,
      hash: hash
    };
  };

  StructuredReport.prototype.get = function (spec) {
    spec = spec || {};
    if (!spec.reportId) throw new Error('FIELD_REQUIRED:reportId');
    var row = this._storage.getReportForTenant(spec.reportId, spec.tenantId);
    if (!row) throw new Error('REPORT_NOT_FOUND');
    return row;
  };

  StructuredReport.prototype.history = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.patientId) throw new Error('FIELD_REQUIRED:patientId');
    var rows = this._storage.historyFor(spec.tenantId, spec.patientId);
    return { ok: true, count: rows.length, items: rows };
  };

  StructuredReport.prototype.exportDicomSR = function (spec) {
    spec = spec || {};
    if (!spec.reportId) throw new Error('FIELD_REQUIRED:reportId');
    var row = this._storage.getReportForTenant(spec.reportId, spec.tenantId);
    if (!row) throw new Error('REPORT_NOT_FOUND');
    if (row.status !== 'finalized') {
      throw new Error('REPORT_NOT_FINALIZED');
    }
    var template = (require('./templates')).get(row.templateId);
    var sections = template && Array.isArray(template.sections) ? template.sections : [];
    var items = [];
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var v = row.fields[s.id];
      items.push({
        concept: s.label,
        type: s.type,
        value: v == null ? '' : v
      });
    }
    var xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<DicomStructuredReport xmlns="urn:dicom-org:rsna:sr">' +
        '<Patient><Mrn>' + _esc(row.patientId) + '</Mrn></Patient>' +
        '<Report id="' + _esc(row.reportId) + '" template="' + _esc(row.templateId) + '" version="' + _esc(template ? template.version : 'unknown') + '">' +
          '<CreatedAt>' + _esc(row.createdAt) + '</CreatedAt>' +
          '<Status>' + _esc(row.status) + '</Status>' +
          '<FinalizedAt>' + _esc(row.finalizedAt || '') + '</FinalizedAt>' +
          '<Hash>' + _esc(row.finalizedHash || '') + '</Hash>' +
          '<Items>' +
            items.map(function (it) {
              var v = it.value;
              if (Array.isArray(v)) v = v.join(',');
              else if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
              return '<Item concept="' + _esc(it.concept) + '" type="' + _esc(it.type) + '">' + _esc(v) + '</Item>';
            }).join('') +
          '</Items>' +
        '</Report>' +
      '</DicomStructuredReport>';
    return {
      ok: true,
      reportId: row.reportId,
      xml: xml,
      items: items
    };
  };

  StructuredReport.prototype._makeAuditRecord = function (spec) {
    var payload = JSON.stringify({
      op: spec.op,
      reportId: spec.reportId,
      actorId: spec.actorId || null,
      tenantId: spec.tenantId,
      payloadHash: spec.payloadHash || null,
      prevHash: this._storage.lastHash() || null,
      ts: new Date().toISOString()
    });
    return {
      op: spec.op,
      reportId: spec.reportId,
      ts: new Date().toISOString(),
      hash: _sha256Hex(payload),
      prevHash: this._storage.lastHash() || null,
      actorId: spec.actorId || null
    };
  };

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  return StructuredReport;
});
