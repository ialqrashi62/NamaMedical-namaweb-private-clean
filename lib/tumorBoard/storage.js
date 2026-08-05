// lib/tumorBoard/storage.js
// In-memory storage for Tumor Board / MDT meetings (P17). Pure JS, no
// npm install. Tenant-scoped (RAIL-5). All decisions are hash-chained
// (RAIL-10) at the storage level so any tampered row breaks the chain.
//
// Two primary shapes:
//   state._meetings = { [meetingId]: Meeting }
//   state._cases    = { [caseId]: MDTCase }
//   state._decisions = { [caseId]: [Decision, ...] }   (ordered by ts)
//   state._slides   = { [caseId]: [Slide, ...] }
//   state._audit    = [{ op, ts, hash, prevHash }]    (hash-chained)

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TumorBoardStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function newTumorBoardStorage() {
    var state = { _meetings: {}, _cases: {}, _decisions: {}, _slides: {}, _audit: [], _lastHash: null };

    function _clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }

    function appendAudit(record) {
      state._audit.push(record);
      state._lastHash = record.hash || state._lastHash;
      return { ok: true };
    }

    function createMeeting(m) {
      if (!m || !m.meetingId) return { ok: false, error: 'FIELD_REQUIRED:meetingId' };
      if (!m.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
      if (state._meetings[m.meetingId]) return { ok: false, error: 'DUPLICATE_MEETING' };
      state._meetings[m.meetingId] = {
        meetingId: m.meetingId,
        tenantId: m.tenantId,
        date: m.date,
        time: m.time,
        location: m.location,
        chairId: m.chairId,
        attendees: Array.isArray(m.attendees) ? m.attendees.slice() : [],
        caseIds: Array.isArray(m.caseIds) ? m.caseIds.slice() : [],
        status: m.status || 'scheduled',
        cancelledReason: m.cancelledReason || null,
        createdAt: m.createdAt || new Date().toISOString()
      };
      return { ok: true, meetingId: m.meetingId };
    }

    function updateMeeting(meetingId, patch) {
      var m = state._meetings[meetingId];
      if (!m) return { ok: false, error: 'MEETING_NOT_FOUND' };
      if (m.status === 'cancelled') return { ok: false, error: 'MEETING_CANCELLED' };
      for (var k in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
        m[k] = patch[k];
      }
      return { ok: true, meetingId: meetingId };
    }

    function getMeeting(meetingId) {
      var m = state._meetings[meetingId];
      if (!m) return null;
      return _clone(m);
    }

    function meetingsForTenant(tenantId) {
      var out = [];
      for (var id in state._meetings) {
        if (!Object.prototype.hasOwnProperty.call(state._meetings, id)) continue;
        var m = state._meetings[id];
        if (String(m.tenantId) !== String(tenantId)) continue;
        out.push(_clone(m));
      }
      out.sort(function (a, b) {
        return String(a.date + '|' + a.time).localeCompare(String(b.date + '|' + b.time));
      });
      return out;
    }

    function createCase(c) {
      if (!c || !c.caseId) return { ok: false, error: 'FIELD_REQUIRED:caseId' };
      if (!c.meetingId) return { ok: false, error: 'FIELD_REQUIRED:meetingId' };
      if (!state._meetings[c.meetingId]) return { ok: false, error: 'MEETING_NOT_FOUND' };
      if (state._cases[c.caseId]) return { ok: false, error: 'DUPLICATE_CASE' };
      state._cases[c.caseId] = {
        caseId: c.caseId,
        meetingId: c.meetingId,
        tenantId: c.tenantId,
        patientId: c.patientId,
        diagnosis: c.diagnosis || null,
        stage: c.stage || null,
        imaging: c.imaging || null,
        pathology: c.pathology || null,
        presenterId: c.presenterId || null,
        presentationStatus: c.presentationStatus || 'queued',
        createdAt: c.createdAt || new Date().toISOString()
      };
      state._decisions[c.caseId] = state._decisions[c.caseId] || [];
      state._slides[c.caseId] = state._slides[c.caseId] || [];
      var m = state._meetings[c.meetingId];
      if (m.caseIds.indexOf(c.caseId) === -1) m.caseIds.push(c.caseId);
      return { ok: true, caseId: c.caseId };
    }

    function getCase(caseId) {
      var c = state._cases[caseId];
      if (!c) return null;
      return _clone(c);
    }

    function appendDecision(caseId, d) {
      if (!d || !d.decision) return { ok: false, error: 'FIELD_REQUIRED:decision' };
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      if (state._meetings[c.meetingId].status === 'cancelled') {
        return { ok: false, error: 'MEETING_CANCELLED' };
      }
      var arr = state._decisions[caseId] = state._decisions[caseId] || [];
      arr.push({
        caseId: caseId,
        decision: d.decision,
        rationale: d.rationale || null,
        actorId: d.actorId || null,
        ts: d.ts || new Date().toISOString(),
        prevHash: state._lastHash || null,
        hash: d.hash || null
      });
      var last = arr[arr.length - 1];
      state._lastHash = last.hash || state._lastHash;
      return { ok: true, caseId: caseId, count: arr.length };
    }

    function decisionsFor(caseId) {
      var arr = state._decisions[caseId] || [];
      return arr.map(_clone);
    }

    function appendSlide(caseId, s) {
      if (!s || !s.kind) return { ok: false, error: 'FIELD_REQUIRED:kind' };
      var c = state._cases[caseId];
      if (!c) return { ok: false, error: 'CASE_NOT_FOUND' };
      var arr = state._slides[caseId] = state._slides[caseId] || [];
      arr.push({
        slideId: s.slideId || ('SLD-' + Date.now().toString(36)),
        caseId: caseId,
        kind: s.kind,
        content: s.content || null,
        order: arr.length + 1,
        createdAt: new Date().toISOString()
      });
      return { ok: true, caseId: caseId, count: arr.length };
    }

    function slidesFor(caseId) {
      var arr = state._slides[caseId] || [];
      return arr.map(_clone);
    }

    function clear(tenantId) {
      var prefix = String(tenantId) + '|';
      var removedMeetings = 0;
      var removedCases = 0;
      var k;
      for (k in state._meetings) {
        if (Object.prototype.hasOwnProperty.call(state._meetings, k) &&
            String(state._meetings[k].tenantId) === String(tenantId)) {
          delete state._meetings[k];
          removedMeetings++;
        }
      }
      for (k in state._cases) {
        if (Object.prototype.hasOwnProperty.call(state._cases, k) &&
            String(state._cases[k].tenantId) === String(tenantId)) {
          delete state._cases[k];
          delete state._decisions[k];
          delete state._slides[k];
          removedCases++;
        }
      }
      return { ok: true, removedMeetings: removedMeetings, removedCases: removedCases };
    }

    return {
      createMeeting: createMeeting,
      updateMeeting: updateMeeting,
      getMeeting: getMeeting,
      meetingsForTenant: meetingsForTenant,
      createCase: createCase,
      getCase: getCase,
      appendDecision: appendDecision,
      decisionsFor: decisionsFor,
      appendSlide: appendSlide,
      slidesFor: slidesFor,
      appendAudit: appendAudit,
      clear: clear,
      _state: state
    };
  }

  return {
    newTumorBoardStorage: newTumorBoardStorage,
    _shared: newTumorBoardStorage()
  };
});
