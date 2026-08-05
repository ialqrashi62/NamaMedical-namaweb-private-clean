// lib/telehealth/session.js
// Telehealth session registry + lifecycle (waiting, active, ended).
// Pure JS, no npm install. Tenant-scoped (RAIL-5).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TelehealthSessions = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Map<roomId, session>
  var sessions = new Map();
  // Map<tenantId, Set<roomId>>
  var tenantIndex = new Map();

  function _now() { return new Date().toISOString(); }

  function create(record) {
    if (!record || !record.roomId) throw new Error('FIELD_REQUIRED:roomId');
    if (!record.tenantId) throw new Error('TENANT_REQUIRED');
    var rec = {
      roomId: String(record.roomId),
      tenantId: String(record.tenantId),
      encounterId: record.encounterId ? String(record.encounterId) : null,
      hostId: record.hostId ? String(record.hostId) : null,
      lang: record.lang ? String(record.lang) : 'ar-SA',
      state: 'waiting',
      createdAt: _now(),
      startedAt: null,
      endedAt: null,
      participants: [],
    };
    sessions.set(rec.roomId, rec);
    if (!tenantIndex.has(rec.tenantId)) tenantIndex.set(rec.tenantId, new Set());
    tenantIndex.get(rec.tenantId).add(rec.roomId);
    return rec;
  }

  function get(roomId) {
    if (!roomId) return null;
    return sessions.get(String(roomId)) || null;
  }

  function start(roomId) {
    var rec = get(roomId);
    if (!rec) return null;
    if (rec.state === 'ended') return rec;
    rec.state = 'active';
    rec.startedAt = _now();
    return rec;
  }

  function addParticipant(roomId, userId, role) {
    var rec = get(roomId);
    if (!rec) return null;
    var p = { userId: String(userId), role: String(role || 'guest'), joinedAt: _now() };
    rec.participants.push(p);
    if (rec.state === 'waiting') {
      rec.state = 'active';
      rec.startedAt = _now();
    }
    return rec;
  }

  function end(roomId) {
    var rec = get(roomId);
    if (!rec) return null;
    rec.state = 'ended';
    rec.endedAt = _now();
    return rec;
  }

  function listForTenant(tenantId) {
    if (!tenantId) return [];
    var set = tenantIndex.get(String(tenantId));
    if (!set) return [];
    var out = [];
    set.forEach(function (rid) {
      var rec = sessions.get(rid);
      if (rec) out.push(rec);
    });
    return out;
  }

  function listActive(tenantId) {
    return listForTenant(tenantId).filter(function (r) { return r.state !== 'ended'; });
  }

  function remove(roomId) {
    var rec = get(roomId);
    if (!rec) return false;
    sessions.delete(String(roomId));
    var set = tenantIndex.get(rec.tenantId);
    if (set) set.delete(String(roomId));
    return true;
  }

  function reset() {
    sessions.clear();
    tenantIndex.clear();
  }

  function count(tenantId) {
    return listForTenant(tenantId).length;
  }

  return {
    create: create,
    get: get,
    start: start,
    addParticipant: addParticipant,
    end: end,
    listForTenant: listForTenant,
    listActive: listActive,
    remove: remove,
    count: count,
    reset: reset,
  };
});
