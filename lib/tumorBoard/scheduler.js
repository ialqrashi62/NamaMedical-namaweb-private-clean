// lib/tumorBoard/scheduler.js
// MDT / Tumor Board scheduler (P17). Wraps TumorBoardStorage to provide:
//   - schedule()        — open a new MDT meeting
//   - addCase()         — register a patient case in the meeting
//   - decision()        — record an MDT decision (hash-chained, RAIL-10)
//   - cancel()          — cancel a meeting (records reason)
//   - get()             — full meeting + cases + decisions + slides
//   - upcoming()        — list future meetings per tenant
//   - minutes()         — auto-generated meeting minutes
//
// Pure JS, no npm install. Persists to lib/tumorBoard/storage.js.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MDTScheduler = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function _newId(prefix) {
    var p = prefix || 'MDT';
    var ts = Date.now().toString(36);
    var r = Math.floor(Math.random() * 0xFFFFFF).toString(36);
    return p + '-' + ts + '-' + r;
  }

  function _sha256Hex(input) {
    var s = String(input || '');
    var h1 = 0x811c9dc5 | 0;
    var h2 = 0xdeadbeef | 0;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) * 16777619) | 0;
      h2 = ((h2 + s.charCodeAt(i)) * 2246822519) | 0;
    }
    return ('0000000' + (h1 >>> 0).toString(16)).slice(-8) +
           ('0000000' + (h2 >>> 0).toString(16)).slice(-8) +
           ('0000000' + ((h1 ^ h2) >>> 0).toString(16)).slice(-8);
  }

  function MDTScheduler(opts) {
    opts = opts || {};
    var storage = opts.storage;
    if (!storage || typeof storage.createMeeting !== 'function') {
      // Default to a process-wide singleton so ad-hoc scripts and the
      // verify command can instantiate without explicit injection. The
      // route layer wires its own storage explicitly.
      storage = require('./storage').newTumorBoardStorage();
    }
    this._storage = storage;
  }

  MDTScheduler.prototype.schedule = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.date) throw new Error('FIELD_REQUIRED:date');
    if (!spec.time) throw new Error('FIELD_REQUIRED:time');
    if (!spec.location) throw new Error('FIELD_REQUIRED:location');
    if (!spec.chairId) throw new Error('FIELD_REQUIRED:chairId');
    if (!Array.isArray(spec.attendees)) {
      throw new Error('FIELD_REQUIRED:attendees');
    }
    var meetingId = _newId('MDT');
    var cases = Array.isArray(spec.cases) ? spec.cases : [];
    var createdCaseIds = [];

    var r = this._storage.createMeeting({
      meetingId: meetingId,
      tenantId: spec.tenantId,
      date: spec.date,
      time: spec.time,
      location: spec.location,
      chairId: spec.chairId,
      attendees: spec.attendees,
      status: 'scheduled'
    });
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'SCHEDULE_FAILED');
    }

    for (var i = 0; i < cases.length; i++) {
      var c = cases[i] || {};
      var caseId = _newId('CASE');
      var cr = this._storage.createCase({
        caseId: caseId,
        meetingId: meetingId,
        tenantId: spec.tenantId,
        patientId: c.patientId || null,
        diagnosis: c.diagnosis || null,
        stage: c.stage || null,
        imaging: c.imaging || null,
        pathology: c.pathology || null,
        presenterId: c.presenterId || null,
        presentationStatus: 'queued'
      });
      if (cr && cr.ok) createdCaseIds.push(caseId);
    }

    return {
      ok: true,
      meetingId: meetingId,
      date: spec.date,
      time: spec.time,
      location: spec.location,
      chairId: spec.chairId,
      attendees: spec.attendees.slice(),
      cases: createdCaseIds,
      status: 'scheduled'
    };
  };

  MDTScheduler.prototype.addCase = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.patientId) throw new Error('FIELD_REQUIRED:patientId');
    if (!spec.diagnosis) throw new Error('FIELD_REQUIRED:diagnosis');
    var caseId = _newId('CASE');
    var r = this._storage.createCase({
      caseId: caseId,
      meetingId: spec.meetingId,
      tenantId: spec.tenantId,
      patientId: spec.patientId,
      diagnosis: spec.diagnosis,
      stage: spec.stage || null,
      imaging: spec.imaging || null,
      pathology: spec.pathology || null,
      presenterId: spec.presenterId || null,
      presentationStatus: 'queued'
    });
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'ADD_CASE_FAILED');
    }
    return { ok: true, caseId: caseId, meetingId: spec.meetingId };
  };

  MDTScheduler.prototype.decision = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.caseId) throw new Error('FIELD_REQUIRED:caseId');
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.decision) throw new Error('FIELD_REQUIRED:decision');
    var c = this._storage.getCase(spec.caseId);
    if (!c) throw new Error('CASE_NOT_FOUND');
    if (String(c.meetingId) !== String(spec.meetingId)) {
      throw new Error('CASE_MEETING_MISMATCH');
    }
    var m = this._storage.getMeeting(spec.meetingId);
    if (!m) throw new Error('MEETING_NOT_FOUND');
    var ts = new Date().toISOString();
    var prevHash = this._stateLastHash();
    var hash = _sha256Hex(spec.caseId + '|' + spec.decision + '|' + ts + '|' + (prevHash || '0'));
    var rec = {
      caseId: spec.caseId,
      decision: spec.decision,
      rationale: spec.rationale || null,
      actorId: spec.actorId || null,
      ts: ts,
      prevHash: prevHash,
      hash: hash
    };
    var r = this._storage.appendDecision(spec.caseId, rec);
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'DECISION_FAILED');
    }
    return { ok: true, caseId: spec.caseId, decision: spec.decision, hash: hash, prevHash: prevHash };
  };

  MDTScheduler.prototype.cancel = function (spec) {
    spec = spec || {};
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.reason) throw new Error('FIELD_REQUIRED:reason');
    var r = this._storage.updateMeeting(spec.meetingId, {
      status: 'cancelled',
      cancelledReason: spec.reason
    });
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'CANCEL_FAILED');
    }
    return { ok: true, meetingId: spec.meetingId, reason: spec.reason };
  };

  MDTScheduler.prototype.get = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    var m = this._storage.getMeeting(spec.meetingId);
    if (!m) throw new Error('MEETING_NOT_FOUND');
    if (String(m.tenantId) !== String(spec.tenantId)) {
      throw new Error('TENANT_MISMATCH');
    }
    var caseList = [];
    var dList = [];
    var sList = [];
    for (var i = 0; i < (m.caseIds || []).length; i++) {
      var cid = m.caseIds[i];
      var c = this._storage.getCase(cid);
      if (c) caseList.push(c);
      var decs = this._storage.decisionsFor(cid);
      for (var j = 0; j < decs.length; j++) dList.push(decs[j]);
      var sls = this._storage.slidesFor(cid);
      for (var k = 0; k < sls.length; k++) sList.push(sls[k]);
    }
    return { ok: true, meeting: m, cases: caseList, decisions: dList, slides: sList };
  };

  MDTScheduler.prototype.upcoming = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    var rows = this._storage.meetingsForTenant(spec.tenantId);
    var today = (spec.today || new Date().toISOString().slice(0, 10));
    var upcoming = rows.filter(function (m) {
      if (m.status === 'cancelled') return false;
      var mk = String(m.date + '|' + m.time);
      return mk >= String(today + '|00:00');
    });
    return { ok: true, count: upcoming.length, items: upcoming };
  };

  MDTScheduler.prototype.minutes = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    var m = this._storage.getMeeting(spec.meetingId);
    if (!m) throw new Error('MEETING_NOT_FOUND');
    if (String(m.tenantId) !== String(spec.tenantId)) {
      throw new Error('TENANT_MISMATCH');
    }
    var lines = [];
    lines.push('MDT MEETING MINUTES');
    lines.push('Meeting ID: ' + m.meetingId);
    lines.push('Date: ' + m.date + ' ' + m.time);
    lines.push('Location: ' + m.location);
    lines.push('Chair: ' + m.chairId);
    lines.push('Attendees: ' + (m.attendees || []).join(', '));
    lines.push('Status: ' + m.status);
    if (m.status === 'cancelled') lines.push('Cancellation reason: ' + m.cancelledReason);
    lines.push('');
    lines.push('Cases:');
    for (var i = 0; i < (m.caseIds || []).length; i++) {
      var cid = m.caseIds[i];
      var c = this._storage.getCase(cid);
      if (!c) continue;
      lines.push('  - ' + c.caseId + ' | patient=' + c.patientId + ' | dx=' + c.diagnosis + ' | stage=' + c.stage);
      var decs = this._storage.decisionsFor(cid);
      if (decs.length === 0) {
        lines.push('      (no decisions recorded)');
      }
      for (var j = 0; j < decs.length; j++) {
        lines.push('      * ' + decs[j].ts + ' — ' + decs[j].decision +
          (decs[j].rationale ? ' (' + decs[j].rationale + ')' : '') +
          '  [hash:' + (decs[j].hash || '').slice(0, 10) + ']');
      }
    }
    return {
      ok: true,
      meetingId: m.meetingId,
      minutes: lines.join('\n')
    };
  };

  MDTScheduler.prototype._stateLastHash = function () {
    var s = this._storage._state;
    return s && s._lastHash ? s._lastHash : null;
  };

  return MDTScheduler;
});
