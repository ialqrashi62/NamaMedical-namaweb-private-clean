'use strict';
// lib/trials/protocol.js
// Clinical Trial Protocol orchestrator.
// - Define / amend / approve / close lifecycle (status: draft -> active -> closed)
// - Eligibility check (inclusion / exclusion predicate evaluation)
// - Block randomization (size 4, blinded) with deterministic seeding
// - 4-arm stratification (age, sex, severity, biomarker)
// - Hash-chained amendments (RAIL-10)
// - IRB approval gate
// - Consent gate (delegates to lib/trials/consent)
//
// Pure JS; no npm install. Audit hash chain uses SHA-256.

const crypto = require('crypto');
const { newTrialsStorage } = require('./storage');
const { newConsentStore } = require('./consent');

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  // ---- helpers ------------------------------------------------------------

  function _hash(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  function _newId(prefix, tenantId, phase) {
    return (
      prefix +
      '_' +
      _hash({ t: tenantId, p: phase || '', n: Date.now(), r: Math.random() })
        .slice(0, 16)
    );
  }

  // ---- criterion evaluators ------------------------------------------------
  // Predicate form: "field>value" | "field<value" | "field>=value" |
  //                 "field<=value" | "field==value" | "field!=value"
  // Boolean form:   "pregnant" | "smoker" | "biomarker+"
  // Interpretation: inclusion=[must be true], exclusion=[must be false]

  function _parseCriterion(c) {
    if (typeof c !== 'string') return null;
    const trimmed = c.trim();
    const match = /^(age|hba1c|sbp|dbp|ef|egfr|fev1|peak_flow)\s*(>=|<=|==|!=|>|<)\s*([0-9.]+)$/
      .exec(trimmed);
    if (match) {
      return {
        kind: 'numeric',
        field: match[1],
        op: match[2],
        value: parseFloat(match[3])
      };
    }
    return { kind: 'boolean', flag: trimmed.toLowerCase() };
  }

  function _evalCriterion(c, patient) {
    const parsed = _parseCriterion(c);
    if (!parsed) return true; // skip unknown rather than deny
    if (!patient) return false;
    if (parsed.kind === 'numeric') {
      const v = patient[parsed.field];
      if (typeof v !== 'number') return false;
      switch (parsed.op) {
        case '>':  return v >  parsed.value;
        case '<':  return v <  parsed.value;
        case '>=': return v >= parsed.value;
        case '<=': return v <= parsed.value;
        case '==': return v === parsed.value;
        case '!=': return v !== parsed.value;
      }
      return false;
    }
    // boolean predicate — interpret inclusion based on flag
    const flag = parsed.flag;
    if (flag === 'pregnant')  return patient.pregnant === true;
    if (flag === 'smoker')    return patient.smoker === true;
    if (flag === 'biomarker+')return patient.biomarkerPositive === true;
    if (flag === 'biomarker-')return patient.biomarkerPositive === false;
    if (flag === 'asthma')    return patient.asthma === true;
    if (flag === 'ckd')       return patient.ckd === true;
    if (flag === 'chf')       return patient.chf === true;
    return false;
  }

  function _stratify(patient) {
    const age = typeof patient.age === 'number' ? patient.age : 0;
    const ageBand = age < 30 ? 'lt30' : age < 50 ? '30-49' : age < 65 ? '50-64' : 'gte65';
    const sex = patient.sex === 'F' ? 'F' : 'M';
    const severity = patient.severity === 'severe' ? 'severe' : 'mild';
    const biomarker = patient.biomarkerPositive === true ? 'pos' : 'neg';
    return ageBand + '|' + sex + '|' + severity + '|' + biomarker;
  }

  function _eligibility(protocol, patient) {
    const inclusion = Array.isArray(protocol.inclusion) ? protocol.inclusion : [];
    const exclusion = Array.isArray(protocol.exclusion) ? protocol.exclusion : [];

    for (let i = 0; i < inclusion.length; i++) {
      if (!_evalCriterion(inclusion[i], patient)) {
        return { eligible: false, reason: 'INCLUSION_FAIL:' + inclusion[i] };
      }
    }
    for (let i = 0; i < exclusion.length; i++) {
      if (_evalCriterion(exclusion[i], patient)) {
        return { eligible: false, reason: 'EXCLUSION_FAIL:' + exclusion[i] };
      }
    }
    return { eligible: true };
  }

  // ---- block randomization (size 4, blinded) ------------------------------
  // Deterministic, reproducible. Inside a stratum we shuffle a 4-arm
  // assignment (A/B/C/D) per block and exhaust the block before reshuffling.

  function _shuffle4(seed) {
    const arms = ['A', 'B', 'C', 'D'];
    const h = crypto.createHash('sha256').update(String(seed)).digest();
    // Fisher-Yates using bytes from the hash
    for (let i = arms.length - 1; i > 0; i--) {
      const j = h[i] % (i + 1);
      const tmp = arms[i];
      arms[i] = arms[j];
      arms[j] = tmp;
    }
    return arms;
  }

  function _newBlockState(tenantId, protocolId) {
    const seed = tenantId + '::' + protocolId + '::' + Date.now();
    return {
      blockSeq: 0,
      usedCount: 0,
      sequence: _shuffle4(seed + '::B0')
    };
  }

  function _randomizeArm(manager, tenantId, protocol, patient) {
    const storage = manager._storage;
    const stratum = _stratify(patient);
    let block = storage.getBlock(tenantId, protocol.protocolId);
    if (!block || block.stratum !== stratum) {
      block = {
        blockSeq: 0,
        usedCount: 0,
        stratum,
        sequence: _shuffle4(tenantId + '::' + protocol.protocolId + '::' + stratum)
      };
    }
    if (block.usedCount >= block.sequence.length) {
      block.blockSeq += 1;
      block.usedCount = 0;
      block.sequence = _shuffle4(
        tenantId + '::' + protocol.protocolId + '::' + stratum + '::' + block.blockSeq
      );
    }
    const arm = block.sequence[block.usedCount];
    block.usedCount += 1;
    storage.putBlock(tenantId, protocol.protocolId, block);
    return { arm, blockSeq: block.blockSeq, stratum };
  }

  // ---- protocol class -----------------------------------------------------

  class ClinicalTrialProtocol {
    constructor(opts) {
      opts = opts || {};
      this._storage = opts.storage || newTrialsStorage();
      this._consent = opts.consent || newConsentStore();
    }

    define(args) {
      const tenantId = args && args.tenantId;
      const sponsor = args && args.sponsor;
      const phase = args && args.phase;
      const condition = args && args.condition;
      const title = args && args.title;
      const inclusion = args && args.inclusion;
      const exclusion = args && args.exclusion;
      const primaryEndpoint = args && args.primaryEndpoint;
      const secondaryEndpoints = args && args.secondaryEndpoints;
      const sampleSize = args && args.sampleSize;
      const randomization = args && args.randomization;

      if (!tenantId)  throw new Error('TENANT_REQUIRED');
      if (!sponsor)    throw new Error('SPONSOR_REQUIRED');
      if (!phase)      throw new Error('PHASE_REQUIRED');
      if (!condition)  throw new Error('CONDITION_REQUIRED');
      if (!title)      throw new Error('TITLE_REQUIRED');
      if (!Array.isArray(inclusion)) throw new Error('INCLUSION_REQUIRED');
      if (!Array.isArray(exclusion)) throw new Error('EXCLUSION_REQUIRED');
      if (!primaryEndpoint) throw new Error('PRIMARY_ENDPOINT_REQUIRED');
      if (!Array.isArray(secondaryEndpoints)) throw new Error('SECONDARY_ENDPOINTS_REQUIRED');
      if (typeof sampleSize !== 'number' || sampleSize <= 0) throw new Error('SAMPLE_SIZE_INVALID');
      if (randomization !== 'block_4') throw new Error('RANDOMIZATION_UNSUPPORTED');

      const protocolId = _newId('pt', tenantId, phase);
      const version = 1;
      const meta = {
        tenantId,
        protocolId,
        sponsor,
        phase,
        condition,
        title,
        inclusion,
        exclusion,
        primaryEndpoint,
        secondaryEndpoints,
        sampleSize,
        randomization,
        status: 'draft',
        version,
        irbApprovalCode: null,
        irbExpiresAt: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: new Date().toISOString(),
        auditHash: _hash({ p: protocolId, v: version, sponsor, phase, title })
      };
      this._storage.putProtocol(meta);
      this._consent.defineTemplate({
        tenantId,
        protocolId,
        version: 'v' + version,
        template: {
          protocolId,
          sponsor,
          title,
          version,
          inclusion: inclusion.slice(),
          exclusion: exclusion.slice(),
          primaryEndpoint
        }
      });
      return {
        protocolId,
        status: meta.status,
        version,
        phase: phase,
        condition: condition,
        title: title,
        sponsor: sponsor,
        sampleSize: sampleSize,
        auditHash: meta.auditHash
      };
    }

    amend(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const changes = args && args.changes;
      const reason = args && args.reason;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!changes || typeof changes !== 'object') throw new Error('CHANGES_REQUIRED');
      if (!reason) throw new Error('REASON_REQUIRED');
      if (!actorId) throw new Error('ACTOR_REQUIRED');

      const cur = this._storage.getProtocol(tenantId, protocolId);
      if (!cur) throw new Error('PROTOCOL_NOT_FOUND');
      if (cur.status === 'closed') throw new Error('PROTOCOL_CLOSED');

      const amendments = this._storage.listAmendments(tenantId, protocolId);
      const prevHash = amendments.length
        ? amendments[amendments.length - 1].hash
        : cur.auditHash;
      const newVersion = cur.version + 1;

      const updated = Object.assign({}, cur, changes, {
        version: newVersion,
        status: 'draft' // amendment reverts to draft for re-approval
      });
      delete updated.auditHash;
      const newAuditHash = _hash({
        p: protocolId,
        prev: prevHash,
        v: newVersion,
        changes,
        reason,
        actorId
      });
      updated.auditHash = newAuditHash;
      this._storage.putProtocol(updated);

      const amendmentRec = {
        tenantId,
        protocolId,
        version: newVersion,
        changes,
        reason,
        actorId,
        prevHash,
        hash: newAuditHash,
        at: new Date().toISOString()
      };
      this._storage.putAmendment(amendmentRec);

      this._consent.defineTemplate({
        tenantId,
        protocolId,
        version: 'v' + newVersion,
        template: Object.assign({}, updated)
      });

      return {
        protocolId,
        version: newVersion,
        status: updated.status,
        auditHash: newAuditHash,
        prevHash
      };
    }

    approve(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const irbApprovalCode = args && args.irbApprovalCode;
      const irbExpiresAt = args && args.irbExpiresAt;
      const approverId = args && args.approverId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!irbApprovalCode) throw new Error('IRB_CODE_REQUIRED');
      if (!irbExpiresAt) throw new Error('IRB_EXPIRES_REQUIRED');
      if (!approverId) throw new Error('APPROVER_REQUIRED');

      const cur = this._storage.getProtocol(tenantId, protocolId);
      if (!cur) throw new Error('PROTOCOL_NOT_FOUND');
      if (cur.status === 'closed') throw new Error('PROTOCOL_CLOSED');

      const updated = Object.assign({}, cur, {
        status: 'active',
        irbApprovalCode,
        irbExpiresAt,
        approvedBy: approverId,
        approvedAt: new Date().toISOString()
      });
      this._storage.putProtocol(updated);
      return {
        protocolId,
        status: updated.status,
        version: updated.version,
        irbApprovalCode,
        irbExpiresAt
      };
    }

    close(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const reason = args && args.reason;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!reason) throw new Error('REASON_REQUIRED');
      if (!actorId) throw new Error('ACTOR_REQUIRED');

      const cur = this._storage.getProtocol(tenantId, protocolId);
      if (!cur) throw new Error('PROTOCOL_NOT_FOUND');
      if (cur.status === 'closed') throw new Error('PROTOCOL_ALREADY_CLOSED');

      const updated = Object.assign({}, cur, {
        status: 'closed',
        closedBy: actorId,
        closedReason: reason,
        closedAt: new Date().toISOString()
      });
      this._storage.putProtocol(updated);
      return { protocolId, status: updated.status };
    }

    enroll(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      const screeningId = args && args.screeningId;
      const patient = args && args.patient;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      if (!screeningId) throw new Error('SCREENING_REQUIRED');
      if (!actorId) throw new Error('ACTOR_REQUIRED');

      const proto = this._storage.getProtocol(tenantId, protocolId);
      if (!proto) {
        return { ok: false, eligible: false, reason: 'PROTOCOL_NOT_FOUND' };
      }
      if (proto.status !== 'active') {
        return { ok: false, eligible: false, reason: 'PROTOCOL_NOT_ACTIVE' };
      }

      const existing = this._storage.getEnrollment(tenantId, protocolId, patientId);
      if (existing) {
        return { ok: false, eligible: true, reason: 'PATIENT_ALREADY_ENROLLED' };
      }

      const eligible = _eligibility(proto, patient || {});
      if (!eligible.eligible) {
        return {
          ok: false,
          eligible: false,
          reason: eligible.reason
        };
      }

      // consent gate
      const consentOk = this._consent.hasValidConsent({
        tenantId,
        protocolId,
        patientId
      });
      if (!consentOk) {
        return {
          ok: false,
          eligible: true,
          reason: 'CONSENT_REQUIRED'
        };
      }

      const rec = {
        tenantId,
        protocolId,
        patientId,
        screeningId,
        actorId,
        stratum: _stratify(patient || {}),
        enrolledAt: new Date().toISOString(),
        consentVersion: 'v' + proto.version
      };
      this._storage.putEnrollment(rec);
      return {
        ok: true,
        eligible: true,
        enrollment: rec
      };
    }

    randomize(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      const patient = args && args.patient;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      if (!actorId) throw new Error('ACTOR_REQUIRED');

      const proto = this._storage.getProtocol(tenantId, protocolId);
      if (!proto) {
        return { ok: false, randomized: false, reason: 'PROTOCOL_NOT_FOUND' };
      }
      if (proto.status !== 'active') {
        return { ok: false, randomized: false, reason: 'PROTOCOL_NOT_ACTIVE' };
      }

      const enrolled = this._storage.getEnrollment(tenantId, protocolId, patientId);
      if (!enrolled) {
        return { ok: false, randomized: false, reason: 'PATIENT_NOT_ENROLLED' };
      }

      const already = this._storage.getRandomization(tenantId, protocolId, patientId);
      if (already) {
        return { ok: true, randomized: false, duplicate: true, randomization: already };
      }

      const r = _randomizeArm(this, tenantId, proto, patient || {});
      const rec = {
        tenantId,
        protocolId,
        patientId,
        arm: r.arm,
        blockSeq: r.blockSeq,
        stratum: r.stratum,
        actorId,
        randomizedAt: new Date().toISOString(),
        blinded: true
      };
      this._storage.putRandomization(rec);
      return { ok: true, randomized: true, randomization: rec };
    }

    recordOutcome(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      const patientId = args && args.patientId;
      const outcome = args && args.outcome;
      const actorId = args && args.actorId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      if (!outcome || typeof outcome !== 'object') throw new Error('OUTCOME_REQUIRED');
      if (!actorId) throw new Error('ACTOR_REQUIRED');

      const proto = this._storage.getProtocol(tenantId, protocolId);
      if (!proto) return { ok: false, reason: 'PROTOCOL_NOT_FOUND' };

      const enrolled = this._storage.getEnrollment(tenantId, protocolId, patientId);
      if (!enrolled) return { ok: false, reason: 'PATIENT_NOT_ENROLLED' };

      const outcomeId = _newId('oc', tenantId, protocolId);
      const rec = {
        tenantId,
        protocolId,
        patientId,
        outcomeId,
        outcome,
        actorId,
        recordedAt: new Date().toISOString()
      };
      this._storage.putOutcome(rec);
      return { ok: true, outcome: rec };
    }

    get(args) {
      const tenantId = args && args.tenantId;
      const protocolId = args && args.protocolId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!protocolId) throw new Error('PROTOCOL_REQUIRED');

      const proto = this._storage.getProtocol(tenantId, protocolId);
      if (!proto) return null;
      return {
        protocol: proto,
        enrolments: this._storage.listEnrollments(tenantId, protocolId),
        outcomes: this._storage.listOutcomes(tenantId, protocolId),
        amendments: this._storage.listAmendments(tenantId, protocolId)
      };
    }

    list(args) {
      const tenantId = args && args.tenantId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      const filter = args && args.filter ? args.filter : args;
      return this._storage.listProtocols(tenantId, filter || {});
    }
  }

  // expose helpers for testing / audit export
  ClinicalTrialProtocol._evaluateEligibility = _eligibility;
  ClinicalTrialProtocol._stratify = _stratify;

  module.exports = ClinicalTrialProtocol;
  module.exports.newTrialsStorage = newTrialsStorage;
  module.exports.newConsentStore = newConsentStore;
})();
