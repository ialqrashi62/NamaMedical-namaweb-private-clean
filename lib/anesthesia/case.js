// lib/anesthesia/case.js
// Anesthesia case driver (P15). Pure JS, no npm install.
//
// Responsibilities:
//   - start()  opens a case with provider, agent, preop ASA score
//   - recordVital() appends a vital sign snapshot to the per-case timeline
//   - addEvent() appends an event (induction/intubation/incision/etc.)
//   - finalize() enforces the 5R (Right patient / drug / dose / route / time)
//              then closes the case with a hash-chained audit entry
//   - get() returns the full timeline (vitals + events + audit)
//
// Audit chain (RAIL-10) — SHA-256, link-style: prevHash || payloadHash.
// Storage is in-memory; production lives in lib/anesthesia/storage.js.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnesthesiaCase = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cryptoLib = (function () {
    try { return require('crypto'); } catch (_e) { return null; }
  })();

  function _hash(prevHash, payload) {
    if (cryptoLib && typeof cryptoLib.createHash === 'function') {
      var h = cryptoLib.createHash('sha256');
      h.update(String(prevHash || ''));
      h.update('|');
      h.update(JSON.stringify(payload));
      return h.digest('hex');
    }
    // Fallback: pure-JS djb2 (deterministic but not crypto-grade).
    // Sandbox / Node-without-crypto only; not for production.
    var s = String(prevHash || '') + '|' + JSON.stringify(payload);
    var h1 = 5381;
    var h2 = 52711;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ ch;
      h2 = ((h2 << 5) + h2) ^ ch;
    }
    return ('djb2_' + (h1 >>> 0).toString(16) + '_' + (h2 >>> 0).toString(16));
  }

  // 5R (Right patient / drug / dose / route / time) checks for finalize.
  // Required fields: rightPatient, rightDrug, rightDose, rightRoute, rightTime.
  function _check5R(preop) {
    var required = ['rightPatient', 'rightDrug', 'rightDose', 'rightRoute', 'rightTime'];
    var missing = [];
    var failed = [];
    for (var i = 0; i < required.length; i++) {
      var k = required[i];
      if (!preop || preop[k] === undefined || preop[k] === null || preop[k] === '') {
        missing.push(k);
      } else if (preop[k] === false) {
        failed.push(k);
      }
    }
    return { ok: missing.length === 0 && failed.length === 0, missing: missing, failed: failed };
  }

  function AnesthesiaCase(opts) {
    if (!(this instanceof AnesthesiaCase)) return new AnesthesiaCase(opts);
    var storage = (opts && opts.storage) ? opts.storage : null;
    var nowProvider = (opts && opts.now) ? opts.now : function () { return new Date().toISOString(); };
    this._storage = storage;
    this._now = nowProvider;
    this._chainHead = null;
  }

  AnesthesiaCase.prototype._genCaseId = function () {
    return 'ANES-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 0xffff).toString(36).toUpperCase();
  };

  AnesthesiaCase.prototype._appendAudit = function (caseId, payload) {
    var prev = this._chainHead || (this._storage && this._storage.lastHash ? this._storage.lastHash(caseId) : null);
    var hash = _hash(prev, payload);
    this._chainHead = hash;
    if (this._storage && typeof this._storage.appendAudit === 'function') {
      this._storage.appendAudit(caseId, { hash: hash, prevHash: prev, payload: payload });
    }
    return hash;
  };

  AnesthesiaCase.prototype.start = function (spec) {
    if (!spec || !spec.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!spec.patientId) return { ok: false, error: 'FIELD_REQUIRED:patientId' };
    if (!spec.surgeonId) return { ok: false, error: 'FIELD_REQUIRED:surgeonId' };
    if (!spec.anesthesiaType) return { ok: false, error: 'FIELD_REQUIRED:anesthesiaType' };

    var allowed = { general: 'volatile', regional: 'regional', local: 'local', sedation: 'inhaled' };
    var type = String(spec.anesthesiaType).toLowerCase();
    if (!allowed[type]) {
      return { ok: false, error: 'INVALID_TYPE', allowed: Object.keys(allowed) };
    }
    var agent = allowed[type];

    var startTs = this._now();
    var caseObj = {
      caseId: spec.caseId || this._genCaseId(),
      tenantId: spec.tenantId,
      patientId: spec.patientId,
      surgeonId: spec.surgeonId,
      anesthesiaType: type,
      agent: agent,
      status: 'active',
      startTs: startTs,
      preop: spec.preop || null,
      events: [],
      vitals: [],
      audit: []
    };

    if (this._storage && typeof this._storage.createCase === 'function') {
      var r = this._storage.createCase(caseObj);
      if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'STORAGE_ERROR' };
    }

    var auditHash = this._appendAudit(caseObj.caseId, { op: 'start', caseObj: { caseId: caseObj.caseId, agent: agent, type: type, startTs: startTs } });
    caseObj.audit.push({ hash: auditHash, op: 'start', ts: startTs });

    return { ok: true, caseId: caseObj.caseId, startTs: startTs, agent: agent, type: type, auditHash: auditHash, case: caseObj };
  };

  AnesthesiaCase.prototype.recordVital = function (spec) {
    if (!spec || !spec.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
    if (!spec.code) return { ok: false, error: 'FIELD_REQUIRED:code' };
    if (spec.value === undefined || spec.value === null) return { ok: false, error: 'FIELD_REQUIRED:value' };
    if (!spec.unit) return { ok: false, error: 'FIELD_REQUIRED:unit' };
    if (!spec.ts) return { ok: false, error: 'FIELD_REQUIRED:ts' };

    var ts = String(spec.ts);
    var code = String(spec.code);
    var unit = String(spec.unit);
    var value = Number(spec.value);
    if (!isFinite(value)) return { ok: false, error: 'INVALID_VALUE' };

    var entry = { ts: ts, code: code, value: value, unit: unit };
    if (this._storage && typeof this._storage.appendVital === 'function') {
      var r = this._storage.appendVital(spec.caseId, entry);
      if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'STORAGE_ERROR' };
    }
    var auditHash = this._appendAudit(spec.caseId, { op: 'vital', entry: entry });
    return { ok: true, caseId: spec.caseId, entry: entry, auditHash: auditHash };
  };

  AnesthesiaCase.prototype.addEvent = function (spec) {
    if (!spec || !spec.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
    if (!spec.type) return { ok: false, error: 'FIELD_REQUIRED:type' };
    var ts = (spec.ts && String(spec.ts)) || this._now();
    var validTypes = ['induction', 'intubation', 'incision', 'closing', 'extubation', 'emergence', 'note'];
    var t = String(spec.type).toLowerCase();
    if (validTypes.indexOf(t) === -1) return { ok: false, error: 'INVALID_TYPE', allowed: validTypes };

    var entry = { ts: ts, type: t, note: spec.note || null };
    if (this._storage && typeof this._storage.appendEvent === 'function') {
      var r = this._storage.appendEvent(spec.caseId, entry);
      if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'STORAGE_ERROR' };
    }
    var auditHash = this._appendAudit(spec.caseId, { op: 'event', entry: entry });
    return { ok: true, caseId: spec.caseId, entry: entry, auditHash: auditHash };
  };

  AnesthesiaCase.prototype.finalize = function (spec) {
    if (!spec || !spec.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
    var stored = this._storage && typeof this._storage.getCase === 'function'
      ? this._storage.getCase(spec.caseId)
      : null;
    if (!stored || stored.ok !== true) return { ok: false, error: 'CASE_NOT_FOUND' };
    var caseObj = stored.case;
    if (caseObj.status !== 'active') return { ok: false, error: 'CASE_FINALIZED', status: caseObj.status };

    // Enforce 5R: the finalize handler MUST receive an explicit
    // preopFinalize payload proving Right-now verification at the time
    // of close. We do NOT trust preop fields from start() alone — the
    // "Right" is in the moment, not the chart open.
    var fiveROnly = spec.preopFinalize || {};
    var fiveR = _check5R(fiveROnly);
    if (!fiveR.ok) {
      return { ok: false, error: '5R_FAILED', missing: fiveR.missing, failed: fiveR.failed };
    }
    var endTs = spec.endTs || this._now();
    caseObj.endTs = endTs;
    caseObj.status = 'closed';
    caseObj.outcome = spec.outcome || null;

    if (this._storage && typeof this._storage.closeCase === 'function') {
      var r = this._storage.closeCase(spec.caseId, { endTs: endTs, outcome: caseObj.outcome });
      if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'STORAGE_ERROR' };
    }
    var auditHash = this._appendAudit(spec.caseId, {
      op: 'finalize',
      endTs: endTs,
      outcome: caseObj.outcome,
      fiveR: { passed: true, fields: Object.keys(fiveROnly) }
    });
    caseObj.audit.push({ hash: auditHash, op: 'finalize', ts: endTs });
    return { ok: true, caseId: spec.caseId, endTs: endTs, outcome: caseObj.outcome, auditHash: auditHash, fiveR: fiveR };
  };

  AnesthesiaCase.prototype.get = function (spec) {
    if (!spec || !spec.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
    if (!this._storage || typeof this._storage.getCase !== 'function') {
      return { ok: false, error: 'NO_STORAGE' };
    }
    return this._storage.getCase(spec.caseId);
  };

  AnesthesiaCase.prototype.chainHead = function () {
    if (!this._chainHead && this._storage && typeof this._storage.lastHash === 'function') {
      // No specific caseId available here — return last-known head for any case.
      this._chainHead = this._storage.lastHash(null) || this._chainHead;
    }
    return this._chainHead || 'GENESIS';
  };

  return AnesthesiaCase;
});
