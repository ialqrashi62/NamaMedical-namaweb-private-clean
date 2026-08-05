'use strict';
// lib/trials/consent.js
// Informed Consent Form (ICF) management for clinical trials.
// Per-trial, versioned. Supports:
//   - Adult consent (recordConsent)
//   - Minor assent + parental consent (recordAssent)
//   - Withdrawal (withdraw) — must provide reason
//   - Audit hash chain over all consent events (RAIL-10)
//
// Pure JS; no npm install. No PHI in audit messages — only event
// metadata (consentId, protocolId, version, withdrew:boolean).

const crypto = require('crypto');

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  function _hash(payload) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  function _newConsentId(tenantId, protocolId) {
    return (
      'cf_' +
      _hash({ t: tenantId, p: protocolId, n: Date.now(), r: Math.random() })
        .slice(0, 16)
    );
  }

  function newConsentStore() {
    // tenantId::protocolId -> { versions: [{version, template, createdAt}],
    //                          records: [record, ...] }
    const store = new Map();

    function _bucket(tenantId, protocolId) {
      const k = tenantId + '::' + protocolId;
      let b = store.get(k);
      if (!b) {
        b = { versions: [], records: [] };
        store.set(k, b);
      }
      return b;
    }

    function defineTemplate(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const template = args && args.template;
      const version = (args && args.version) || ('v' + Date.now());
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!template || typeof template !== 'object') throw new Error('TEMPLATE_REQUIRED');

      const b = _bucket(tenantId, protocolId);
      b.versions.push({
        version: version,
        template: template,
        createdAt: new Date().toISOString()
      });
      return { tenantId, protocolId, version, count: b.versions.length };
    }

    function _appendRecord(tenantId, protocolId, rec) {
      const b = _bucket(tenantId, protocolId);
      const prevHash = b.records.length
        ? b.records[b.records.length - 1].hash
        : 'GENESIS';
      const prevVersion = b.records.length
        ? b.records[b.records.length - 1].version
        : null;

      const payload = Object.assign({}, rec, {
        tenantId,
        protocolId,
        prevHash,
        prevVersion,
        at: new Date().toISOString()
      });
      const hash = _hash(payload);
      const stored = Object.assign({}, payload, { hash });
      b.records.push(stored);
      return stored;
    }

    function recordConsent(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      const version = args && args.version;
      const witnessId = args && args.witnessId || null;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      if (!version) throw new Error('VERSION_REQUIRED');

      const b = _bucket(tenantId, protocolId);
      if (!b.versions.some(function (v) { return v.version === version; })) {
        throw new Error('VERSION_UNREGISTERED');
      }

      const consentId = _newConsentId(tenantId, protocolId);
      return _appendRecord(tenantId, protocolId, {
        consentId,
        type: 'consent',
        patientId,
        version,
        witnessId,
        actorId,
        withdrew: false
      });
    }

    function recordAssent(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const minorId = args && args.minorId;
      const guardianId = args && args.guardianId;
      const version = args && args.version;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!minorId) throw new Error('MINOR_REQUIRED');
      if (!guardianId) throw new Error('GUARDIAN_REQUIRED');
      if (!version) throw new Error('VERSION_REQUIRED');

      const b = _bucket(tenantId, protocolId);
      if (!b.versions.some(function (v) { return v.version === version; })) {
        throw new Error('VERSION_UNREGISTERED');
      }
      const consentId = _newConsentId(tenantId, protocolId);
      return _appendRecord(tenantId, protocolId, {
        consentId,
        type: 'assent+parental',
        patientId: minorId,
        guardianId,
        version,
        actorId,
        withdrew: false
      });
    }

    function withdraw(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      const reason = args && args.reason;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      if (!reason) throw new Error('REASON_REQUIRED');

      const rec = _appendRecord(tenantId, protocolId, {
        type: 'withdrawal',
        patientId,
        reason,
        actorId,
        withdrew: true
      });
      return rec;
    }

    function get(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      const b = store.get(tenantId + '::' + protocolId);
      if (!b) return { versions: [], records: [] };
      return {
        versions: b.versions.slice(),
        records: b.records.slice()
      };
    }

    function hasValidConsent(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      if (!tenantId || !protocolId || !patientId) return false;
      const b = store.get(tenantId + '::' + protocolId);
      if (!b) return false;
      const events = b.records.filter(function (r) {
        return r.patientId === patientId;
      });
      if (events.length === 0) return false;
      const last = events[events.length - 1];
      return last && last.withdrew === false &&
        (last.type === 'consent' || last.type === 'assent+parental');
    }

    return {
      defineTemplate: defineTemplate,
      recordConsent: recordConsent,
      recordAssent: recordAssent,
      withdraw: withdraw,
      get: get,
      hasValidConsent: hasValidConsent,
      _raw: store
    };
  }

  module.exports = { newConsentStore };
})();
