// lib/mobile/pushNotification.js
// Mock APNS/FCM push service for native mobile clients.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PushNotificationService = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DeviceRegistry = require('./deviceRegistry');

  // delivery audit log (in-memory)
  var deliveries = [];

  function PushService() {
    if (!(this instanceof PushService)) return new PushService();
    this.registry = DeviceRegistry;
  }

  function _shaLike(input) {
    // Deterministic SHA-256-like hex via simple FNV-1a + salt; not crypto-strong
    // but deterministic and stable for token format per the spec.
    var s = String(input == null ? '' : input);
    var h1 = 0x811c9dc5;
    var h2 = 0xcbf29ce4;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 ^= (c + i); h2 = (h2 * 0x100000001b3) >>> 0;
    }
    var hex1 = h1.toString(16).padStart(8, '0');
    var hex2 = h2.toString(16).padStart(16, '0');
    return (hex1 + hex2).slice(0, 32);
  }

  PushService.prototype.send = function send(opts) {
    if (!opts || !opts.tenantId) {
      return { ok: false, error: 'TENANT_REQUIRED' };
    }
    if (!opts.deviceToken) {
      return { ok: false, error: 'FIELD_REQUIRED:deviceToken' };
    }
    var platform = String(opts.platform || '').toLowerCase();
    if (platform !== 'ios' && platform !== 'android') {
      return { ok: false, error: 'PLATFORM_UNSUPPORTED' };
    }
    var reg = this.registry.get(opts.tenantId, opts.deviceToken);
    if (!reg) {
      return { ok: false, error: 'DEVICE_NOT_REGISTERED' };
    }
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : {};
    // Build the wire packet. No PHI in body — only title/message provided by app.
    var packet = {
      to: reg.deviceToken,
      platform: platform,
      notification: {
        title: String(payload.title || '').slice(0, 120),
        body: String(payload.body || '').slice(0, 240),
      },
      data: payload.data || {},
    };
    var ts = Date.now();
    var deliveryId = 'dlv_' + _shaLike(opts.tenantId + ':' + reg.deviceToken + ':' + ts + ':' + Math.random());
    // Mock APNS/FCM dispatch — no real network call.
    var record = {
      deliveryId: deliveryId,
      tenantId: reg.tenantId,
      userId: reg.userId,
      deviceToken: reg.deviceToken,
      platform: platform,
      ts: ts,
      ok: true,
    };
    deliveries.push(record);
    if (deliveries.length > 500) deliveries.shift();
    this.registry.touch(opts.tenantId, opts.deviceToken);
    return {
      ok: true,
      deliveryId: deliveryId,
      platform: platform,
      ts: ts,
    };
  };

  PushService.prototype.registerDevice = function registerDevice(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.deviceToken) return { ok: false, error: 'FIELD_REQUIRED:deviceToken' };
    var platform = String(opts.platform || '').toLowerCase();
    if (platform !== 'ios' && platform !== 'android') {
      return { ok: false, error: 'PLATFORM_UNSUPPORTED' };
    }
    var rec = this.registry.register(
      opts.tenantId,
      opts.userId,
      opts.deviceToken,
      platform,
      opts.appVersion
    );
    return { ok: true, device: rec };
  };

  PushService.prototype.unregisterDevice = function unregisterDevice(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.deviceToken) return { ok: false, error: 'FIELD_REQUIRED:deviceToken' };
    var ok = this.registry.unregister(opts.tenantId, opts.deviceToken);
    return { ok: ok };
  };

  PushService.prototype.devicesForUser = function devicesForUser(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    var list = this.registry.listForUser(opts.tenantId, opts.userId);
    return { ok: true, devices: list, count: list.length };
  };

  PushService.prototype.deliveries = function deliveries_(tenantId) {
    if (!tenantId) return deliveries.slice();
    return deliveries.filter(function (d) { return d.tenantId === String(tenantId); });
  };

  return PushService;
});
