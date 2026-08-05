// lib/telehealth/sfu.js
// Mock SFU (Selective Forwarding Unit) for telehealth WebRTC rooms.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). E2EE mandatory (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TelehealthSFU = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var Sessions = require('./session');

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

  function SFU() {
    if (!(this instanceof SFU)) return new SFU();
    this.sessions = Sessions;
  }

  SFU.prototype.createRoom = function createRoom(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.encounterId) return { ok: false, error: 'FIELD_REQUIRED:encounterId' };
    if (!opts.hostId) return { ok: false, error: 'FIELD_REQUIRED:hostId' };
    var salt = Math.random().toString(36).slice(2, 10);
    var roomId = 'sfu_' + _hash(opts.tenantId + ':' + opts.encounterId + ':' + salt);
    var hostToken = 'host_' + _hash(opts.tenantId + ':' + roomId + ':' + opts.hostId + ':' + salt);
    var ttlMs = 4 * 60 * 60 * 1000; // 4h rooms
    var expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.sessions.create({
      roomId: roomId,
      tenantId: opts.tenantId,
      encounterId: opts.encounterId,
      hostId: opts.hostId,
      lang: opts.lang || 'ar-SA',
    });
    return {
      ok: true,
      roomId: roomId,
      hostToken: hostToken,
      expiresAt: expiresAt,
      recording: false,         // recording disabled by default
      e2ee: true,               // mandatory flag
      sfu: 'mock-sfu-v1',
      iceServers: [{ urls: ['stun:stun.jumanasoft.com:3478'] }],
    };
  };

  SFU.prototype.joinRoom = function joinRoom(opts) {
    if (!opts || !opts.roomId) return { ok: false, error: 'FIELD_REQUIRED:roomId' };
    if (!opts.userId) return { ok: false, error: 'FIELD_REQUIRED:userId' };
    var rec = this.sessions.get(opts.roomId);
    if (!rec) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (rec.state === 'ended') return { ok: false, error: 'ROOM_ENDED' };
    var role = opts.role || (String(opts.userId) === String(rec.hostId) ? 'host' : 'guest');
    var salt = Math.random().toString(36).slice(2, 10);
    var guestToken = (role === 'host' ? 'host_' : 'gst_') + _hash(rec.tenantId + ':' + rec.roomId + ':' + opts.userId + ':' + salt);
    this.sessions.addParticipant(rec.roomId, opts.userId, role);
    return {
      ok: true,
      roomId: rec.roomId,
      guestToken: guestToken,
      role: role,
      e2ee: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  };

  SFU.prototype.endRoom = function endRoom(opts) {
    if (!opts || !opts.roomId) return { ok: false, error: 'FIELD_REQUIRED:roomId' };
    var rec = this.sessions.get(opts.roomId);
    if (!rec) return { ok: false, error: 'ROOM_NOT_FOUND' };
    this.sessions.end(opts.roomId);
    return { ok: true, roomId: opts.roomId, endedAt: new Date().toISOString() };
  };

  SFU.prototype.rooms = function rooms(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    var active = this.sessions.listActive(opts.tenantId);
    return {
      ok: true,
      count: active.length,
      rooms: active.map(function (r) {
        return {
          roomId: r.roomId,
          encounterId: r.encounterId,
          hostId: r.hostId,
          state: r.state,
          participants: r.participants.length,
          createdAt: r.createdAt,
          startedAt: r.startedAt,
        };
      }),
    };
  };

  return SFU;
});
