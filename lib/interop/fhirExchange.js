// lib/interop/fhirExchange.js
// FHIR R4 exchange surface for interop (P25).
//   - Bundle upload (DocumentReference, Patient, Observation,
//     MedicationRequest, Condition)
//   - CapabilityStatement exchange
//   - Subscription topic registration
//   - AuditEvent emission
//
// State is in-memory (P25 sandbox). All bundles are tenant-scoped.
// RAIL-12: no PHI in logs. RAIL-10: AuditEvent rows have a chained
// hash so any tamper breaks the chain.
//
// Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FhirExchange = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var Mapping = require('./mapping');

  var cryptoLib = null;
  try { cryptoLib = require('crypto'); } catch (_e) { cryptoLib = null; }

  function _hash(s) {
    if (cryptoLib) {
      try { return cryptoLib.createHash('sha256').update(String(s)).digest('hex'); }
      catch (_e) { /* fallthrough */ }
    }
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    var v = Math.abs(h); var hex = '';
    while (v > 0) { hex = (v % 16).toString(16) + hex; v = Math.floor(v / 16); }
    return ('00000000' + hex).slice(-8) + '_' + String(s.length);
  }

  function _nowIso() { return new Date().toISOString(); }

  function FhirExchange(opts) {
    opts = opts || {};
    this._state = opts.state || {
      _bundles: {},                  // bundleId → Bundle record
      _subscriptions: {},            // subId → subscription
      _capabilities: {},             // tenantId → CapabilityStatement
      _audit: [],                    // hash-chained AuditEvent
      _lastHash: null,
      _byTenant: {}
    };
  }

  // ---- CapabilityStatement ------------------------------------------

  // Returns a US Core v3-style capability statement
  FhirExchange.prototype.capabilityStatement = function (args) {
    args = args || {};
    var tenantId = args.tenantId || 'public';
    var fmt = args.fmt && Array.isArray(args.fmt) ? args.fmt.slice() : ['application/fhir+json'];
    return {
      resourceType: 'CapabilityStatement',
      id: tenantId + ':cst',
      status: 'active',
      date: _nowIso(),
      kind: 'instance',
      fhirVersion: '4.0.1',
      format: fmt.map(function (f) { return { code: f }; }),
      software: { name: 'NamaMedical', version: args.version || 'p25-1.0.0' },
      implementation: {
        description: 'NamaMedical Hospital Information System',
        url: args.url || 'urn:nama:medical:gateway'
      },
      rest: [{
        mode: 'server',
        security: {
          service: [
            { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                         code: 'SMART-on-FHIR' }] }
          ]
        },
        resource: [
          { type: 'Patient',            interaction: ['read', 'search-type'], searchParam: [{ name: 'identifier', type: 'token' }] },
          { type: 'Condition',          interaction: ['read', 'create'],     searchParam: [{ name: 'patient', type: 'reference' }] },
          { type: 'Observation',        interaction: ['read', 'create'],     searchParam: [{ name: 'patient', type: 'reference' }, { name: 'category', type: 'token' }] },
          { type: 'MedicationRequest',  interaction: ['read', 'create'],     searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }] },
          { type: 'DocumentReference',  interaction: ['read', 'create'] },
          { type: 'AuditEvent',         interaction: ['read'] },
          { type: 'Subscription',       interaction: ['read', 'create'] }
        ]
      }]
    };
  };

  FhirExchange.prototype.publishCapability = function (args) {
    args = args || {};
    if (!args.tenantId) throw new Error('TENANT_REQUIRED');
    var cs = this.capabilityStatement(args);
    this._state._capabilities[args.tenantId] = cs;
    return { ok: true, capability: cs };
  };

  // ---- Bundle upload ------------------------------------------------

  FhirExchange.prototype.uploadBundle = function (args) {
    args = args || {};
    if (!args.tenantId) throw new Error('TENANT_REQUIRED');
    if (!args.bundle || args.bundle.resourceType !== 'Bundle') {
      throw new Error('BUNDLE_REQUIRED');
    }
    var bundle = args.bundle;
    var entries = Array.isArray(bundle.entry) ? bundle.entry : [];
    var parsed = Mapping.parseFhirBundle(bundle);
    var id = 'B-' + Date.now().toString(36) + '-' +
             Math.floor(Math.random() * 1e6).toString(36);
    var record = {
      bundleId: id,
      tenantId: args.tenantId,
      source: args.source || 'unknown',
      receivedAt: _nowIso(),
      type: bundle.type || 'collection',
      entryCount: entries.length,
      counts: {
        patient: parsed.patient ? 1 : 0,
        conditions: parsed.conditions.length,
        medications: parsed.medications.length,
        observations: parsed.observations.length
      },
      parsed: parsed
    };
    this._state._bundles[id] = record;
    var bucket = this._state._byTenant[args.tenantId] || [];
    bucket.push(id);
    this._state._byTenant[args.tenantId] = bucket;

    var prevHash = this._state._lastHash || null;
    var h = _hash(String(prevHash) + '|' + JSON.stringify({
      op: 'bundle.upload', bundleId: id, tenantId: args.tenantId,
      counts: record.counts
    }));
    this._state._audit.push({
      resourceType: 'AuditEvent',
      id: 'AE-' + id,
      type: { system: 'http://dicom.nema.org/resources/audit/message',
              code: 'restful-activity' },
      recorded: _nowIso(),
      outcome: 'success',
      agent: [{ who: { display: args.actor || 'fhir-gateway' } }],
      source: { site: 'nama-gateway' },
      action: 'C',     // create
      object: { reference: 'Bundle/' + id },
      detail: [{ text: 'bundleType=' + record.type + ' entries=' + record.entryCount }],
      prevHash: prevHash,
      hash: h
    });
    this._state._lastHash = h;

    return {
      ok: true,
      bundleId: id,
      counts: record.counts,
      audit: { id: 'AE-' + id, hash: h }
    };
  };

  // ---- Subscriptions ------------------------------------------------

  FhirExchange.prototype.registerSubscription = function (args) {
    args = args || {};
    if (!args.tenantId) throw new Error('TENANT_REQUIRED');
    if (!args.topic) throw new Error('TOPIC_REQUIRED');
    if (!args.endpoint) throw new Error('ENDPOINT_REQUIRED');
    var id = 'SUB-' + Date.now().toString(36) + '-' +
             Math.floor(Math.random() * 1e6).toString(36);
    var sub = {
      resourceType: 'Subscription',
      id: id,
      status: args.status || 'requested',
      topic: args.topic,
      contact: [{ system: 'url', value: args.endpoint }],
      end: args.end || null,
      reason: args.reason || 'inter-community notification',
      criteria: args.criteria || 'Patient',
      tenantId: args.tenantId,
      createdAt: _nowIso()
    };
    this._state._subscriptions[id] = sub;
    return { ok: true, subscription: sub };
  };

  FhirExchange.prototype.listSubscriptions = function (tenantId) {
    var out = [];
    for (var k in this._state._subscriptions) {
      if (!Object.prototype.hasOwnProperty.call(this._state._subscriptions, k)) continue;
      var s = this._state._subscriptions[k];
      if (!tenantId || s.tenantId === tenantId) out.push(JSON.parse(JSON.stringify(s)));
    }
    return out;
  };

  // ---- AuditEvent emission -----------------------------------------

  FhirExchange.prototype.audit = function () {
    return {
      ok: true,
      chain: this._state._audit.slice(),
      lastHash: this._state._lastHash
    };
  };

  // ---- Introspection ------------------------------------------------

  FhirExchange.prototype.bundleById = function (tenantId, bundleId) {
    var b = this._state._bundles[bundleId];
    if (!b) return null;
    if (b.tenantId !== tenantId) return null;
    return JSON.parse(JSON.stringify(b));
  };

  FhirExchange.prototype.bundlesForTenant = function (tenantId) {
    var ids = this._state._byTenant[tenantId] || [];
    return ids.map(function (i) { return this._state._bundles[i]; }.bind(this))
      .filter(function (b) { return b != null; })
      .map(function (b) { return { bundleId: b.bundleId, type: b.type, entryCount: b.entryCount,
                                   counts: b.counts, receivedAt: b.receivedAt }; });
  };

  return {
    create: function (opts) { return new FhirExchange(opts); },
    FhirExchange: FhirExchange,
    _hash: _hash
  };
});
