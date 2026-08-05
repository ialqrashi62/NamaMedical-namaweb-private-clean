// lib/telehealth/consent.js
// Telehealth patient consent with hash-chained audit (RAIL-10).
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TelehealthConsent = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Map<key, record> where key = tenantId + ':' + patientId + ':' + encounterId
  var store = new Map();
  // Append-only audit chain per tenantId: { lastHash, entries: [] }
  var chains = new Map();

  function _now() { return new Date().toISOString(); }

  function _hash(input) {
    var s = String(input == null ? '' : input);
    var h1 = 0x811c9dc5;
    var h2 = 0xcbf29ce4;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 ^= (c + i); h2 = (h2 * 0x100000001b3) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(16, '0')).slice(0, 32);
  }

  function _key(tenantId, patientId, encounterId) {
    return String(tenantId || '') + ':' + String(patientId || '') + ':' + String(encounterId || '');
  }

  function _getChain(tenantId) {
    if (!chains.has(tenantId)) chains.set(tenantId, { lastHash: '0'.repeat(32), entries: [] });
    return chains.get(tenantId);
  }

  function _appendAudit(tenantId, entry) {
    var chain = _getChain(tenantId);
    var prev = chain.lastHash;
    var ts = _now();
    var hashInput = prev + '|' + ts + '|' + JSON.stringify(entry);
    var hash = _hash(hashInput);
    var audit = {
      ts: ts,
      prevHash: prev,
      hash: hash,
      entry: entry,
    };
    chain.entries.push(audit);
    chain.lastHash = hash;
    return audit;
  }

  function TelehealthConsent() {
    if (!(this instanceof TelehealthConsent)) return new TelehealthConsent();
  }

  TelehealthConsent.prototype.recordConsent = function recordConsent(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.patientId) return { ok: false, error: 'FIELD_REQUIRED:patientId' };
    if (!opts.encounterId) return { ok: false, error: 'FIELD_REQUIRED:encounterId' };
    if (!opts.scope) return { ok: false, error: 'FIELD_REQUIRED:scope' };
    var granted = opts.granted === true;
    var k = _key(opts.tenantId, opts.patientId, opts.encounterId);
    var rec = store.get(k) || {
      tenantId: String(opts.tenantId),
      patientId: String(opts.patientId),
      encounterId: String(opts.encounterId),
      history: [],
    };
    var event = {
      type: granted ? 'granted' : 'denied',
      scope: String(opts.scope),
      recordedBy: opts.recordedBy ? String(opts.recordedBy) : null,
      recordedAt: _now(),
    };
    rec.history.push(event);
    rec.current = granted ? 'granted' : 'denied';
    rec.currentScope = String(opts.scope);
    rec.updatedAt = _now();
    store.set(k, rec);
    var audit = _appendAudit(opts.tenantId, {
      patientId: rec.patientId,
      encounterId: rec.encounterId,
      scope: rec.currentScope,
      granted: granted,
      recordedBy: event.recordedBy,
    });
    return { ok: true, consent: rec, audit: audit };
  };

  TelehealthConsent.prototype.hasConsent = function hasConsent(opts) {
    if (!opts || !opts.tenantId) return false;
    if (!opts.patientId || !opts.encounterId) return false;
    var rec = store.get(_key(opts.tenantId, opts.patientId, opts.encounterId));
    if (!rec) return false;
    return rec.current === 'granted';
  };

  TelehealthConsent.prototype.revoke = function revoke(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.patientId || !opts.encounterId) return { ok: false, error: 'FIELD_REQUIRED' };
    var k = _key(opts.tenantId, opts.patientId, opts.encounterId);
    var rec = store.get(k);
    if (!rec) return { ok: false, error: 'NO_CONSENT' };
    var event = {
      type: 'revoked',
      scope: rec.currentScope,
      revokedBy: opts.revokedBy ? String(opts.revokedBy) : null,
      recordedAt: _now(),
    };
    rec.history.push(event);
    rec.current = 'revoked';
    rec.updatedAt = _now();
    store.set(k, rec);
    var audit = _appendAudit(opts.tenantId, {
      patientId: rec.patientId,
      encounterId: rec.encounterId,
      scope: rec.currentScope,
      granted: false,
      revoked: true,
      revokedBy: event.revokedBy,
    });
    return { ok: true, consent: rec, audit: audit };
  };

  TelehealthConsent.prototype.get = function get(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.patientId || !opts.encounterId) return { ok: false, error: 'FIELD_REQUIRED' };
    var rec = store.get(_key(opts.tenantId, opts.patientId, opts.encounterId));
    if (!rec) return { ok: true, consent: null, hasConsent: false };
    return { ok: true, consent: rec, hasConsent: rec.current === 'granted' };
  };

  TelehealthConsent.prototype.audit = function audit(opts) {
    if (!opts || !opts.tenantId) return [];
    var chain = chains.get(String(opts.tenantId));
    if (!chain) return [];
    return chain.entries.slice();
  };

  TelehealthConsent.prototype.verifyChain = function verifyChain(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    var chain = chains.get(String(opts.tenantId));
    if (!chain || chain.entries.length === 0) return { ok: true, valid: true, count: 0 };
    var prev = '0'.repeat(32);
    for (var i = 0; i < chain.entries.length; i++) {
      var e = chain.entries[i];
      if (e.prevHash !== prev) return { ok: true, valid: false, brokenAt: i };
      var hashInput = prev + '|' + e.ts + '|' + JSON.stringify(e.entry);
      var expected = _hash(hashInput);
      if (expected !== e.hash) return { ok: true, valid: false, brokenAt: i };
      prev = e.hash;
    }
    return { ok: true, valid: true, count: chain.entries.length, lastHash: prev };
  };

  return TelehealthConsent;
});
