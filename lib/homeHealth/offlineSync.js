// lib/homeHealth/offlineSync.js
// Offline-capable visit sync queue (P19).
// queue / sync / conflicts. Single-call batch resolution; no PHI in errors.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OfflineSync = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var _nowIso = function () { return new Date().toISOString(); };

  function OfflineSync(opts) {
    opts = opts || {};
    this._storage = opts.storage || null;
    this._tenantStrategy = opts.tenantStrategy || 'lastWriteWins';
    this._clockSkewMs = opts.clockSkewMs || 1000 * 60 * 5; // 5 minutes
  }

  function _normEntry(e) {
    if (!e || typeof e !== 'object') return null;
    if (!e.visitId) return null;
    return {
      visitId: String(e.visitId),
      payload: e.payload || {},
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : _nowIso(),
      source: e.source || 'mobile'
    };
  }

  OfflineSync.prototype.queue = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    var entry = _normEntry(ctx);
    if (!entry) throw new Error('VISIT_ID_REQUIRED');
    if (this._storage) {
      this._storage.appendOffline(ctx.tenantId, entry);
    }
    return {
      tenantId: ctx.tenantId,
      visitId: entry.visitId,
      queuedAt: entry.updatedAt,
      queued: true
    };
  };

  OfflineSync.prototype.sync = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    var raw = Array.isArray(ctx.queue) ? ctx.queue : [];
    var accepted = [];
    var rejected = [];
    var conflicts = [];
    for (var i = 0; i < raw.length; i++) {
      var entry = _normEntry(raw[i]);
      if (!entry) {
        rejected.push({ index: i, reason: 'VISIT_ID_REQUIRED' });
        continue;
      }
      // Detect clock skew as a soft conflict marker.
      var skew = Math.abs(Date.now() - new Date(entry.updatedAt).getTime());
      if (skew > this._clockSkewMs) {
        conflicts.push({ visitId: entry.visitId, reason: 'CLOCK_SKEW', skewMs: skew });
      }
      accepted.push({ visitId: entry.visitId, updatedAt: entry.updatedAt, source: entry.source });
    }
    if (this._storage) {
      var stamped = accepted.slice();
      for (var j = 0; j < stamped.length; j++) stamped[j].syncedAt = _nowIso();
      this._storage._offlineQueueByTenant[ctx.tenantId] = [];
      for (var k = 0; k < stamped.length; k++) {
        var e = stamped[k];
        this._storage.appendOffline(ctx.tenantId, e);
      }
    }
    return {
      tenantId: ctx.tenantId,
      received: raw.length,
      accepted: accepted.length,
      rejected: rejected.length,
      conflicts: conflicts.length,
      acceptedEntries: accepted,
      rejectedEntries: rejected,
      conflictEntries: conflicts,
      syncedAt: _nowIso()
    };
  };

  OfflineSync.prototype.conflicts = function (ctx) {
    ctx = ctx || {};
    if (!ctx.local || !ctx.remote) {
      return { hasConflict: false, reason: 'MISSING_RECORD' };
    }
    var local = _normEntry(ctx.local);
    var remote = _normEntry(ctx.remote);
    if (!local || !remote) {
      return { hasConflict: false, reason: 'INVALID_RECORD' };
    }
    var lT = new Date(local.updatedAt).getTime();
    var rT = new Date(remote.updatedAt).getTime();
    if (isNaN(lT) || isNaN(rT)) {
      return { hasConflict: true, reason: 'INVALID_TIMESTAMP', local: local, remote: remote };
    }
    if (lT === rT) {
      return { hasConflict: false, reason: 'EQUAL_TIMESTAMP', local: local, remote: remote };
    }
    var winner = lT > rT ? 'local' : 'remote';
    if (this._tenantStrategy === 'lastWriteWins') {
      return {
        hasConflict: lT !== rT,
        reason: lT === rT ? 'NO_CONFLICT' : 'TIMESTAMP_MISMATCH',
        strategy: 'lastWriteWins',
        winner: winner,
        resolution: winner === 'local' ? local : remote,
        local: local,
        remote: remote
      };
    }
    if (this._tenantStrategy === 'remoteWins') {
      return {
        hasConflict: lT !== rT,
        reason: lT === rT ? 'NO_CONFLICT' : 'TIMESTAMP_MISMATCH',
        strategy: 'remoteWins',
        winner: 'remote',
        resolution: remote,
        local: local,
        remote: remote
      };
    }
    return { hasConflict: true, reason: 'UNKNOWN_STRATEGY', local: local, remote: remote };
  };

  OfflineSync.prototype.listQueued = function (tenantId) {
    if (!this._storage) return [];
    return this._storage.listOffline(tenantId || '');
  };

  return {
    create: function (opts) { return new OfflineSync(opts); },
    OfflineSync: OfflineSync
  };
});
