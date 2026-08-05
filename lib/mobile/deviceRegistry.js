// lib/mobile/deviceRegistry.js
// In-memory device registry keyed by (tenantId, deviceToken).
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI stored.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MobileDeviceRegistry = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // store: Map<key, record> where key = tenantId + ':' + deviceToken
  var store = new Map();
  // user index: Map<key, Set<deviceToken>> where key = tenantId + ':' + userId
  var userIndex = new Map();

  function key(tenantId, deviceToken) {
    return String(tenantId || '') + ':' + String(deviceToken || '');
  }
  function userKey(tenantId, userId) {
    return String(tenantId || '') + ':' + String(userId || '');
  }

  function register(tenantId, userId, deviceToken, platform, appVersion) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!deviceToken) throw new Error('FIELD_REQUIRED:deviceToken');
    var k = key(tenantId, deviceToken);
    var rec = {
      tenantId: String(tenantId),
      userId: String(userId || ''),
      deviceToken: String(deviceToken),
      platform: String(platform || 'unknown'),
      appVersion: String(appVersion || '0.0.0'),
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    store.set(k, rec);
    var uk = userKey(tenantId, userId);
    if (!userIndex.has(uk)) userIndex.set(uk, new Set());
    userIndex.get(uk).add(String(deviceToken));
    return rec;
  }

  function unregister(tenantId, deviceToken) {
    if (!tenantId) return false;
    if (!deviceToken) return false;
    var k = key(tenantId, deviceToken);
    var existing = store.get(k);
    if (!existing) return false;
    var uk = userKey(tenantId, existing.userId);
    var set = userIndex.get(uk);
    if (set) set.delete(String(deviceToken));
    store.delete(k);
    return true;
  }

  function get(tenantId, deviceToken) {
    if (!tenantId || !deviceToken) return null;
    return store.get(key(tenantId, deviceToken)) || null;
  }

  function touch(tenantId, deviceToken) {
    var rec = get(tenantId, deviceToken);
    if (!rec) return null;
    rec.lastSeenAt = new Date().toISOString();
    return rec;
  }

  function listForUser(tenantId, userId) {
    if (!tenantId || !userId) return [];
    var set = userIndex.get(userKey(tenantId, userId));
    if (!set) return [];
    var out = [];
    set.forEach(function (dt) {
      var rec = store.get(key(tenantId, dt));
      if (rec) out.push(rec);
    });
    return out;
  }

  function count(tenantId) {
    if (!tenantId) return 0;
    var n = 0;
    store.forEach(function (rec) {
      if (rec.tenantId === String(tenantId)) n++;
    });
    return n;
  }

  function reset() {
    store.clear();
    userIndex.clear();
  }

  return {
    register: register,
    unregister: unregister,
    get: get,
    touch: touch,
    listForUser: listForUser,
    count: count,
    reset: reset,
  };
});
