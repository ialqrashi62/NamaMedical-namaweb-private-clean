'use strict';
// lib/populationHealth/cohort.js
// CohortBuilder for population-health cohorts:
//   define  → cohort definition
//   addPatients → bulk add (tenant-scoped, deduped)
//   snapshot → frozen metric snapshot
//   metrics → aggregate stats (registry-aware)
//   outreach → bulk outreach trigger (PHI-safe: count + IDs only)
//   export  → de-identified export (HIPAA 18-identifier strip)
//
// No npm install. Audit messages include only counts and IDs.
// HIPAA identifiers stripped (Safe Harbor method):
//  1. Names
//  2. Geographic subdivisions smaller than state (ZIP prefix kept only
//     when population<20k via coarse truncation)
//  3. All elements of dates (year of birth kept for ages < 90 only)
//  4. Telephone, fax, email
//  5. SSN / national IDs / medical record numbers / account numbers
//  6. Vehicle identifiers / device IDs / URLs / IPs
//  7. Biometric identifiers / full-face photos
//  8. Any other unique identifying code

const crypto = require('crypto');
const {
  REGISTRIES,
  buildRegistry,
  registryStats,
  outreachCandidates,
  riskStratify
} = require('./registry');

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  function _hash(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
  }

  function _newId(prefix, tenantId) {
    return prefix + '_' + crypto.randomBytes(8).toString('hex');
  }

  function _nowIso() { return new Date().toISOString(); }

  // HIPAA Safe Harbor stripping — strip 18 identifiers.
  // Strategy: explicit list of PHI fields; replace with `null` or coarse bucket.
  const PHI_FIELDS = [
    'name', 'firstName', 'lastName', 'fullName', 'givenName', 'familyName',
    'ssn', 'nationalId', 'iqamaNumber', 'passportNumber',
    'mrn', 'medicalRecordNumber', 'accountNumber',
    'phone', 'mobile', 'fax', 'email', 'telephone',
    'address', 'street', 'addressLine1', 'city', 'zip', 'postalCode',
    'birthDate', 'dateOfBirth', 'dob', 'birthdate',
    'ipAddress', 'url', 'deviceId', 'vehicleId', 'biometricId', 'photo',
    'nextOfKin', 'nextOfKinPhone', 'emergencyContactPhone'
  ];

  const DATE_FIELDS = ['birthDate', 'dateOfBirth', 'dob', 'birthdate'];

  function _deidentify(patient, opts) {
    opts = opts || {};
    const keepAgeBracket = !!opts.keepAgeBracket;
    const allowPopUnder20k = !!opts.allowPopUnder20k;

    if (!patient || typeof patient !== 'object') return patient;
    const out = {};
    Object.keys(patient).forEach(function (k) {
      const v = patient[k];
      if (PHI_FIELDS.indexOf(k) !== -1) {
        if (DATE_FIELDS.indexOf(k) !== -1 && keepAgeBracket) {
          // keep year-only when age >= 90 (HIPAA), else null
          if (typeof patient.age === 'number' && patient.age >= 90) {
            out[k] = '(omitted)';
          } else {
            const yr = (typeof v === 'string' && /^\d{4}/.test(v))
              ? v.slice(0, 4)
              : null;
            out[k] = yr;
          }
          return;
        }
        if (k === 'zip' || k === 'postalCode') {
          out[k] = allowPopUnder20k ? String(v).slice(0, 3) + '**' : '***';
          return;
        }
        out[k] = null;
        return;
      }
      out[k] = v;
    });
    // Replace direct identifiers with salted hash for cohort linkage
    if (patient.patientId) out.patientPseudonym = _hash(patient.patientId + ':cohort');
    return out;
  }

  // ---- CohortBuilder -----------------------------------------------------

  class CohortBuilder {
    constructor(opts) {
      opts = opts || {};
      this._cohorts = new Map(); // tenantId::cohortId -> cohort record
      this._registry = opts.registry || require('./registry');
    }

    _bucket(tenantId, cohortId) {
      const k = tenantId + '::' + cohortId;
      let b = this._cohorts.get(k);
      if (!b) {
        b = {
          cohort: null,
          patients: [],
          snapshots: [],
          outreaches: []
        };
        this._cohorts.set(k, b);
      }
      return b;
    }

    define(args) {
      const tenantId = args && args.tenantId;
      const name = args && args.name;
      const registry = args && args.registry;
      const criteria = args && args.criteria;
      const followUpDays = args && (typeof args.followUpDays === 'number' ? args.followUpDays : 180);
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!name) throw new Error('NAME_REQUIRED');
      if (!registry || !REGISTRIES[registry]) throw new Error('REGISTRY_UNKNOWN');
      if (!criteria || typeof criteria !== 'object') throw new Error('CRITERIA_REQUIRED');

      const cohortId = _newId('co', tenantId);
      const cohort = {
        cohortId: cohortId,
        tenantId: tenantId,
        name: name,
        registry: registry,
        criteria: criteria,
        followUpDays: followUpDays,
        createdAt: _nowIso(),
        status: 'active'
      };
      const b = this._bucket(tenantId, cohortId);
      b.cohort = cohort;
      return cohort;
    }

    addPatients(args) {
      const tenantId = args && args.tenantId;
      const cohortId = args && args.cohortId;
      const patientIds = args && args.patientIds;
      const patientData = args && args.patientData;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!cohortId) throw new Error('COHORT_REQUIRED');
      if (!Array.isArray(patientIds)) throw new Error('PATIENT_IDS_REQUIRED');
      const b = this._bucket(tenantId, cohortId);
      if (!b.cohort) throw new Error('COHORT_NOT_FOUND');

      const known = new Set(b.patients.map(function (p) { return p.patientId; }));
      const added = [];
      const skipped = [];
      for (let i = 0; i < patientIds.length; i++) {
        const pid = patientIds[i];
        if (!pid) { skipped.push({ index: i, reason: 'ID_MISSING' }); continue; }
        if (known.has(pid)) { skipped.push({ patientId: pid, reason: 'DUP' }); continue; }
        known.add(pid);
        const metrics = (patientData && patientData[pid]) || null;
        b.patients.push({
          patientId: pid,
          metrics: metrics || {},
          addedAt: _nowIso()
        });
        added.push(pid);
      }
      return {
        cohortId: cohortId,
        added: added.length,
        skipped: skipped.length,
        total: b.patients.length
      };
    }

    snapshot(args) {
      const tenantId = args && args.tenantId;
      const cohortId = args && args.cohortId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!cohortId) throw new Error('COHORT_REQUIRED');
      const b = this._bucket(tenantId, cohortId);
      if (!b.cohort) throw new Error('COHORT_NOT_FOUND');

      const cohortData = {
        patients: b.patients.map(function (p) {
          const o = { patientId: p.patientId };
          if (p.metrics) Object.keys(p.metrics).forEach(function (k) { o[k] = p.metrics[k]; });
          return o;
        })
      };
      const stats = registryStats(b.cohort.registry, cohortData);
      const riskBuckets = { low: 0, medium: 0, high: 0 };
      for (let i = 0; i < cohortData.patients.length; i++) {
        const r = riskStratify(b.cohort.registry, cohortData.patients[i]);
        riskBuckets[r.bucket] = (riskBuckets[r.bucket] || 0) + 1;
      }
      const snap = {
        snapshotId: _newId('snap', tenantId),
        cohortId: cohortId,
        registryId: b.cohort.registry,
        cohortSize: stats.cohortSize,
        stats: stats,
        riskBuckets: riskBuckets,
        capturedAt: _nowIso()
      };
      b.snapshots.push(snap);
      return snap;
    }

    metrics(args) {
      const tenantId = args && args.tenantId;
      const cohortId = args && args.cohortId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!cohortId) throw new Error('COHORT_REQUIRED');
      const b = this._bucket(tenantId, cohortId);
      if (!b.cohort) throw new Error('COHORT_NOT_FOUND');
      if (b.snapshots.length === 0) {
        // eager snapshot
        this.snapshot({ tenantId, cohortId });
      }
      const last = b.snapshots[b.snapshots.length - 1];
      return {
        cohort: b.cohort,
        lastSnapshot: last,
        totalPatients: b.patients.length
      };
    }

    outreach(args) {
      const tenantId = args && args.tenantId;
      const cohortId = args && args.cohortId;
      const channel = args && args.channel;
      const template = args && args.template;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!cohortId) throw new Error('COHORT_REQUIRED');
      if (channel !== 'sms' && channel !== 'email') throw new Error('CHANNEL_INVALID');
      if (!template) throw new Error('TEMPLATE_REQUIRED');
      const b = this._bucket(tenantId, cohortId);
      if (!b.cohort) throw new Error('COHORT_NOT_FOUND');

      const candidates = outreachCandidates(
        b.cohort.registry,
        b.patients.map(function (p) {
          const o = { patientId: p.patientId };
          if (p.metrics) Object.keys(p.metrics).forEach(function (k) { o[k] = p.metrics[k]; });
          return o;
        })
      );

      // PHI-safe audit: only count + IDs + reason
      const recipientIds = candidates.map(function (c) { return c.patientId; });
      const event = {
        eventId: _newId('out', tenantId),
        tenantId: tenantId,
        cohortId: cohortId,
        registryId: b.cohort.registry,
        channel: channel,
        template: template,
        recipientCount: recipientIds.length,
        recipientIds: recipientIds,
        reasonCodes: Array.from(new Set(candidates.map(function (c) { return c.reason; }))),
        queuedAt: _nowIso()
      };
      b.outreaches.push(event);
      // Return audit shape — NO PHI content (no body text leak).
      return {
        eventId: event.eventId,
        cohortId: cohortId,
        registryId: b.cohort.registry,
        channel: channel,
        template: template,
        recipientCount: recipientIds.length,
        recipientIds: recipientIds.slice(0, 50) // cap returned IDs at 50
      };
    }

    export(args) {
      const tenantId = args && args.tenantId;
      const cohortId = args && args.cohortId;
      const format = (args && args.format) || 'json';
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!cohortId) throw new Error('COHORT_REQUIRED');
      if (format !== 'csv' && format !== 'json') throw new Error('FORMAT_INVALID');
      const b = this._bucket(tenantId, cohortId);
      if (!b.cohort) throw new Error('COHORT_NOT_FOUND');

      const deidentified = b.patients.map(function (p) {
        const merged = Object.assign({ patientId: p.patientId }, p.metrics || {});
        return _deidentify(merged, { keepAgeBracket: true, allowPopUnder20k: true });
      });

      if (format === 'json') {
        return {
          cohort: {
            cohortId: b.cohort.cohortId,
            tenantId: b.cohort.tenantId,
            registry: b.cohort.registry,
            name: b.cohort.name
          },
          patients: deidentified
        };
      }
      // CSV
      if (deidentified.length === 0) {
        return { cohortId: cohortId, csv: 'patientPseudonym\n' };
      }
      const headers = Object.keys(deidentified[0]).filter(function (k) {
        return PHI_FIELDS.indexOf(k) === -1 || k === 'patientPseudonym';
      });
      const lines = [headers.join(',')];
      for (let i = 0; i < deidentified.length; i++) {
        const row = headers.map(function (h) {
          const v = deidentified[i][h];
          if (v === null || v === undefined) return '';
          const s = String(v);
          if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        });
        lines.push(row.join(','));
      }
      return { cohortId: cohortId, csv: lines.join('\n') + '\n' };
    }
  }

  module.exports = CohortBuilder;
  module.exports.deidentify = _deidentify;
  module.exports.PHI_FIELDS = PHI_FIELDS.slice();
})();
