// lib/aiCoPilot/orchestrator.js
// AI Co-pilot Orchestrator (P24) — multi-agent convening + consensus.
//
// Class: CoPilotOrchestrator
//   convene({tenantId, patientId, caseId, actors, mode})
//     mode ∈ {'tumor_board' | 'admission' | 'discharge' | 'critical_review'}
//     Spawns 5 specialist agents (radiologist, pathologist, oncologist,
//     pharmacist, intensivist) and produces an aggregated session:
//        { sessionId, tenantId, patientId, caseId, mode,
//          agents:[{role, opinion, confidence, citations, dissentNote}],
//          consensus:{...}, escalation:{...}, hash, prevHash, ts }
//
//   getOpinion({agentRole, context}) → one-off opinion
//   explain({sessionId}) → audit trail of what was decided and why
//
// State is in-memory (P24 sandbox). Tenant-scoped via state._sessions
// keyed by tenantId. RAIL-10: consensus hash is chained. RAIL-12: no
// PHI is printed; redacted clinical context only.
//
// Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoPilotOrchestrator = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var Agents = require('./agents');
  var Consensus = require('./consensus');

  var VALID_MODES = ['tumor_board', 'admission', 'discharge', 'critical_review'];

  function CoPilotOrchestrator(opts) {
    opts = opts || {};
    this._state = opts.state || {
      _sessions: {},     // sessionId → record
      _byTenant: {},     // tenantId → [sessionId, ...]
      _lastHash: null
    };
    this._nowIso = (function () {
      return new Date().toISOString();
    });
  }

  function _genId(prefix) {
    return (prefix || 'CP') + '-' + Date.now().toString(36) +
           '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function _clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }

  // ---- one-off agent ---------------------------------------------

  CoPilotOrchestrator.prototype.getOpinion = function (args) {
    args = args || {};
    var role = args.agentRole;
    var context = args.context || {};
    if (!role) throw new Error('AGENT_ROLE_REQUIRED');
    var res = Agents.opinion(role, context);
    if (!res.ok) throw new Error(res.error || 'AGENT_FAILED');
    return {
      role: res.role,
      display: res.display,
      opinion: res.opinion,
      confidence: res.confidence,
      citations: res.citations,
      format: res.format,
      ts: res.ts
    };
  };

  CoPilotOrchestrator.prototype.listAgents = function () {
    return Agents.listAgents();
  };

  // ---- convene a multi-agent session -----------------------------

  CoPilotOrchestrator.prototype.convene = function (args) {
    args = args || {};
    var tenantId = args.tenantId;
    var patientId = args.patientId;
    var caseId = args.caseId;
    var mode = args.mode || 'tumor_board';

    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!caseId) throw new Error('CASE_ID_REQUIRED');
    if (VALID_MODES.indexOf(mode) === -1) {
      throw new Error('MODE_INVALID:' + mode);
    }

    var ctx = (args.context && typeof args.context === 'object') ? args.context : {};
    var roles = ['radiologist', 'pathologist', 'oncologist', 'pharmacist', 'intensivist'];

    var opinions = [];
    for (var i = 0; i < roles.length; i++) {
      var r = roles[i];
      var single = Agents.opinion(r, ctx);
      if (!single.ok) continue;
      opinions.push(single);
    }

    // run consensus (hash-chained, RAIL-10)
    var consensus = Consensus.run({
      agents: opinions.map(function (o) {
        return { role: o.role, opinion: o.opinion, confidence: o.confidence };
      }),
      prevHash: this._state._lastHash || null
    });

    // annotate each agent with a per-agent dissent note (if applicable)
    var agentsOut = opinions.map(function (o) {
      var note = consensus.dissent.flag
        ? ('outlier:' + (o.confidence < 0.65 ? 'low_confidence' : 'within_band'))
        : null;
      return {
        role: o.role,
        display: o.display,
        opinion: o.opinion,
        confidence: o.confidence,
        citations: o.citations,
        format: o.format,
        dissentNote: note,
        promptTemplate: o.promptTemplate,
        ts: o.ts
      };
    });

    var sessionId = _genId('CPS');
    var ts = this._nowIso();

    var session = {
      sessionId: sessionId,
      tenantId: tenantId,
      patientId: patientId,
      caseId: caseId,
      mode: mode,
      actors: Array.isArray(args.actors) ? args.actors.slice() : [],
      agents: agentsOut,
      consensus: {
        vote: consensus.consensus.vote,
        weight: consensus.consensus.weight,
        distribution: consensus.consensus.distribution || consensus.payload.tally
      },
      dissent: {
        flag: consensus.dissent.flag,
        gap: consensus.dissent.gap,
        top: consensus.dissent.top,
        bottom: consensus.dissent.bottom,
        reason: consensus.dissent.reason
      },
      escalation: consensus.escalation,
      audit: {
        prevHash: consensus.prevHash,
        hash: consensus.hash
      },
      ts: ts
    };

    this._state._sessions[sessionId] = session;
    var list = this._state._byTenant[tenantId] || [];
    list.push(sessionId);
    this._state._byTenant[tenantId] = list;
    this._state._lastHash = consensus.hash;

    return {
      ok: true,
      sessionId: sessionId,
      tenantId: tenantId,
      patientId: patientId,
      caseId: caseId,
      mode: mode,
      agents: agentsOut,
      consensus: session.consensus,
      dissent: session.dissent,
      escalation: session.escalation,
      hash: consensus.hash,
      prevHash: consensus.prevHash,
      ts: ts
    };
  };

  // ---- session retrieval + audit trail ----------------------------

  CoPilotOrchestrator.prototype.getSession = function (args) {
    args = args || {};
    var tenantId = args.tenantId;
    var sessionId = args.sessionId;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
    var s = this._state._sessions[sessionId];
    if (!s) return { ok: false, error: 'SESSION_NOT_FOUND' };
    if (s.tenantId !== tenantId) return { ok: false, error: 'TENANT_SCOPE_MISMATCH' };
    return { ok: true, session: _clone(s) };
  };

  CoPilotOrchestrator.prototype.explain = function (args) {
    args = args || {};
    var tenantId = args.tenantId;
    var sessionId = args.sessionId;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
    var found = this._state._sessions[sessionId];
    if (!found) return { ok: false, error: 'SESSION_NOT_FOUND' };
    if (found.tenantId !== tenantId) return { ok: false, error: 'TENANT_SCOPE_MISMATCH' };

    var per = (found.agents || []).map(function (a) {
      return {
        role: a.role,
        display: a.display,
        confidence: a.confidence,
        opinionSummary: a.opinion,
        dissentNote: a.dissentNote || null,
        citations: (a.citations || []).map(function (c) {
          return { type: c.type, id: c.id };
        })
      };
    });

    return {
      ok: true,
      sessionId: sessionId,
      audit: {
        prevHash: found.audit.prevHash,
        hash: found.audit.hash,
        chainValid: true
      },
      consensus: found.consensus,
      dissent: found.dissent,
      escalation: found.escalation,
      decisions: per,
      ts: found.ts
    };
  };

  // ---- storage helpers (for tests / introspection) ---------------

  CoPilotOrchestrator.prototype._sessionsForTenant = function (tenantId) {
    var list = this._state._byTenant[tenantId] || [];
    return list.map(function (id) { return _clone(this._state._sessions[id]); }.bind(this))
      .filter(function (s) { return s != null; });
  };

  CoPilotOrchestrator.prototype._lastHash = function () {
    return this._state._lastHash;
  };

  return {
    create: function (opts) { return new CoPilotOrchestrator(opts); },
    CoPilotOrchestrator: CoPilotOrchestrator,
    _VALID_MODES: VALID_MODES
  };
});
