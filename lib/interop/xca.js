// lib/interop/xca.js
// Cross-Community Access (XCA) bridge for Epic Care Everywhere,
// CommonWell, and other XDS.b-style communities.
//
// XCA is the IHE profile that lets one community request a Patient
// Summary (C-CDA, or our FHIR-equivalent manifest) from another
// community via SAML/WS-Trust headers + a Document Registry.
//
// Class: XCABridge
//   requestPatientSummary({sourceHie, patientId, purpose})
//     Returns { gateway, docId, status }  — request recorded locally
//     and a corresponding stub response is enqueued.
//
//   respondPatientSummary({requestId, patientSummary, signedBy})
//     Returns { responseId, hash, sent } — provider signs and sends
//     a response. Hash is sha256 over the canonical summary.
//
//   status({requestId}) → 'pending' | 'completed' | 'failed'
//
// State is in-memory (P25 sandbox). All entries tenant-scoped via
// `state._byTenant`. RAIL-12: no PHI logs.
//
// Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.XCABridge = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cryptoLib = null;
  try { cryptoLib = require('crypto'); } catch (_e) { cryptoLib = null; }

  function _hash(s) {
    if (cryptoLib) {
      try { return cryptoLib.createHash('sha256').update(String(s)).digest('hex'); }
      catch (_e) { /* fallthrough */ }
    }
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    var hex = '';
    var v = Math.abs(h);
    while (v > 0) { hex = (v % 16).toString(16) + hex; v = Math.floor(v / 16); }
    return ('00000000' + hex).slice(-8) + '...' + String(s.length);
  }

  function _genId(prefix) {
    return (prefix || 'XCA') + '-' + Date.now().toString(36) +
           '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function _canonical(o) {
    return JSON.stringify(o, Object.keys(o || {}).sort());
  }

  function _nowIso() { return new Date().toISOString(); }

  function XCABridge(opts) {
    opts = opts || {};
    this._state = opts.state || {
      _requests: {},           // requestId → requestRecord
      _responses: {},          // requestId → responseRecord
      _audit: [],              // hash-chained audit (RAIL-10)
      _lastHash: null,
      _byTenant: {}            // tenantId → [requestId, ...]
    };
    // When true, missing tenantId defaults to 'public' (sandbox-only).
    // Routes always pass tenantId explicitly; only opt-in here.
    this._allowPublic = !!opts.allowPublic;
    this._publicTenant = opts.publicTenant || 'public';
  }

  function _appendAudit(state, entry) {
    var prev = state._lastHash || null;
    var h = _hash(String(prev || '') + '|' + _canonical(entry));
    state._audit.push({ ts: _nowIso(), prev: prev, hash: h, op: entry.op, requestId: entry.requestId });
    state._lastHash = h;
    return h;
  }

  // ---- request -----------------------------------------------------

  XCABridge.prototype.requestPatientSummary = function (args) {
    args = args || {};
    if (!args.tenantId) {
      if (!this._allowPublic) throw new Error('TENANT_REQUIRED');
      args.tenantId = this._publicTenant;
    }
    if (!args.sourceHie) throw new Error('SOURCE_HIE_REQUIRED');
    if (!args.patientId) throw new Error('PATIENT_ID_REQUIRED');

    var requestId = _genId('REQ');
    var docId = 'urn:uuid:' + _genId('DOC');
    var purpose = args.purpose || 'treatment';

    // SAML assertion stub — real systems use WS-Trust + SAML 2.0.
    var saml = {
      id: '_' + _genId('SAML'),
      issuer: 'urn:nama:medical:gateway',
      assertionIssuer: 'urn:nama:medical:sp',
      subject: {
        tenantId: args.tenantId,
        purpose: purpose
      },
      issueInstant: _nowIso(),
      notOnOrAfter: _nowIso(),  // sandbox: not strict
      audienceRestriction: [args.sourceHie]
    };

    // Document manifest — what we expect to receive
    var manifest = {
      requestId: requestId,
      sourceHie: args.sourceHie,
      patientId: args.patientId,
      purpose: purpose,
      requested: [
        { code: '51852-2', display: 'Summary of Patient' },
        { code: '11369-6', display: 'Immunization History' },
        { code: '10160-0', display: 'Medication Use Statement' },
        { code: '11302-7', display: 'Problem List' }
      ]
    };

    var record = {
      requestId: requestId,
      tenantId: args.tenantId,
      sourceHie: args.sourceHie,
      patientId: args.patientId,
      purpose: purpose,
      gateway: args.sourceHie + '.nama-gateway.local',
      docId: docId,
      samlAssertion: saml,
      manifest: manifest,
      requestedBy: args.requestedBy || null,
      status: 'pending',
      createdAt: _nowIso()
    };

    this._state._requests[requestId] = record;
    this._state._responses[requestId] = null;

    var bucket = this._state._byTenant[args.tenantId] || [];
    bucket.push(requestId);
    this._state._byTenant[args.tenantId] = bucket;

    var h = _appendAudit(this._state, { op: 'request', requestId: requestId,
      tenantId: args.tenantId, purpose: purpose, sourceHie: args.sourceHie });

    return {
      ok: true,
      requestId: requestId,
      gateway: record.gateway,
      docId: docId,
      status: record.status,
      samlAssertion: saml,
      manifest: manifest,
      auditHash: h
    };
  };

  // ---- respond -----------------------------------------------------

  XCABridge.prototype.respondPatientSummary = function (args) {
    args = args || {};
    if (!args.requestId) throw new Error('REQUEST_ID_REQUIRED');
    if (!args.signedBy) throw new Error('SIGNATURE_REQUIRED');
    var req = this._state._requests[args.requestId];
    if (!req) throw new Error('REQUEST_NOT_FOUND');

    var summary = args.patientSummary || args.summary;
    if (!summary || typeof summary !== 'object') throw new Error('SUMMARY_REQUIRED');

    // Build response. The provider's signature is captured; the hash is
    // computed over (canonical summary + signer + prevHash).
    var responseId = _genId('RESP');
    var payload = {
      requestId: args.requestId,
      tenantId: req.tenantId,
      sourceHie: req.sourceHie,
      patientId: req.patientId,
      summary: summary,
      signedBy: args.signedBy,
      ts: _nowIso()
    };
    var h = _hash(String(this._state._lastHash || '') + '|' + _canonical(payload));

    var rec = {
      responseId: responseId,
      requestId: args.requestId,
      tenantId: req.tenantId,
      signedBy: args.signedBy,
      hash: h,
      sent: true,
      ts: payload.ts
    };

    this._state._responses[args.requestId] = rec;
    req.status = 'completed';
    req.completedAt = payload.ts;

    var audit = _appendAudit(this._state, { op: 'respond', requestId: args.requestId,
      responseId: responseId, tenantId: req.tenantId, signer: args.signedBy });

    return {
      ok: true,
      responseId: responseId,
      hash: h,
      sent: true,
      requestId: args.requestId,
      auditHash: audit
    };
  };

  // ---- status ------------------------------------------------------

  XCABridge.prototype.status = function (args) {
    args = args || {};
    if (!args.requestId) throw new Error('REQUEST_ID_REQUIRED');
    var req = this._state._requests[args.requestId];
    if (!req) return { ok: false, status: 'failed', error: 'REQUEST_NOT_FOUND' };
    var resp = this._state._responses[args.requestId];
    return {
      ok: true,
      requestId: args.requestId,
      status: req.status,
      completedAt: req.completedAt || null,
      responseId: resp ? resp.responseId : null,
      responseHash: resp ? resp.hash : null,
      gateway: req.gateway,
      sourceHie: req.sourceHie,
      tenantId: req.tenantId,
      docId: req.docId
    };
  };

  // ---- audit + introspection --------------------------------------

  XCABridge.prototype.audit = function () {
    var list = this._state._audit.slice();
    return { ok: true, chain: list, lastHash: this._state._lastHash };
  };

  XCABridge.prototype.requestsForTenant = function (tenantId) {
    var ids = this._state._byTenant[tenantId] || [];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var r = this._state._requests[ids[i]];
      if (r) out.push(JSON.parse(JSON.stringify(r)));
    }
    return out;
  };

  return {
    create: function (opts) { return new XCABridge(opts); },
    XCABridge: XCABridge,
    _hash: _hash
  };
});
