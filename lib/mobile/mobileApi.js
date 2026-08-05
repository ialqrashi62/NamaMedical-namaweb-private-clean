// lib/mobile/mobileApi.js
// Mobile native API: login, refresh, bootstrap, sync, logout.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MobileAPI = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DeviceRegistry = require('./deviceRegistry');

  function _hash(input) {
    // Deterministic FNV-1a derived token (matches pushNotification style).
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

  // Mock user store: keyed by tenantId + ':' + username.
  var users = new Map();
  // Token store: tokenString -> { tenantId, userId, username, expiresAt, refresh, revoked }
  var tokens = new Map();
  var refreshTokens = new Map();
  // Mock fixtures
  users.set('demo:admin', {
    tenantId: 'demo', userId: 'u-admin', username: 'admin',
    passwordHash: _hash('demo:admin:admin'),
    displayName: 'Demo Admin', roles: ['admin', 'doctor'],
    tenantBranding: { name: 'Demo Hospital', logo: 'branding/demo.png', primary: '#0a3d62' },
  });
  users.set('demo:dr-fatima', {
    tenantId: 'demo', userId: 'u-dr-fatima', username: 'dr-fatima',
    passwordHash: _hash('demo:dr-fatima:welcome'),
    displayName: 'Dr. Fatima', roles: ['doctor'],
    tenantBranding: { name: 'Demo Hospital', logo: 'branding/demo.png', primary: '#0a3d62' },
  });
  users.set('demo:u1', {
    tenantId: 'demo', userId: 'u1', username: 'u1',
    passwordHash: _hash('demo:u1:x'),
    displayName: 'Demo User 1', roles: ['doctor'],
    tenantBranding: { name: 'Demo Hospital', logo: 'branding/demo.png', primary: '#0a3d62' },
  });

  function MobileAPI() {
    if (!(this instanceof MobileAPI)) return new MobileAPI();
    this.registry = DeviceRegistry;
  }

  function _newTokenId(tenantId, userId, salt) {
    return 'mbt_' + _hash(tenantId + ':' + userId + ':' + salt + ':' + Date.now() + ':' + Math.random());
  }

  MobileAPI.prototype.login = function login(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.username) return { ok: false, error: 'FIELD_REQUIRED:username' };
    if (!opts.password) return { ok: false, error: 'FIELD_REQUIRED:password' };
    var key = String(opts.tenantId) + ':' + String(opts.username);
    var u = users.get(key);
    if (!u) return { ok: false, error: 'AUTH_FAILED' };
    if (u.passwordHash !== _hash(String(opts.tenantId) + ':' + String(opts.username) + ':' + String(opts.password))) {
      return { ok: false, error: 'AUTH_FAILED' };
    }
    // Register / refresh device on login.
    if (opts.deviceToken && opts.platform) {
      this.registry.register(opts.tenantId, u.userId, opts.deviceToken, opts.platform, opts.appVersion || '0.0.0');
    }
    var salt = Math.random().toString(36).slice(2, 10);
    var token = _newTokenId(opts.tenantId, u.userId, salt);
    var refresh = _newTokenId(opts.tenantId, u.userId, 'r:' + salt);
    var ttlMs = 60 * 60 * 1000; // 1h
    var expiresAt = new Date(Date.now() + ttlMs).toISOString();
    var rec = {
      token: token,
      tenantId: u.tenantId,
      userId: u.userId,
      username: u.username,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt,
      refresh: refresh,
      revoked: false,
    };
    tokens.set(token, rec);
    refreshTokens.set(refresh, { tenantId: u.tenantId, userId: u.userId, token: token });
    return {
      ok: true,
      token: token,
      refreshToken: refresh,
      user: { id: u.userId, username: u.username, displayName: u.displayName, roles: u.roles },
      expiresAt: expiresAt,
      tenantBranding: u.tenantBranding,
    };
  };

  MobileAPI.prototype.refresh = function refresh(opts) {
    if (!opts || !opts.refreshToken) return { ok: false, error: 'FIELD_REQUIRED:refreshToken' };
    var meta = refreshTokens.get(opts.refreshToken);
    if (!meta) return { ok: false, error: 'REFRESH_INVALID' };
    var old = tokens.get(meta.token);
    if (!old || old.revoked) return { ok: false, error: 'TOKEN_REVOKED' };
    // Rotate
    var salt = Math.random().toString(36).slice(2, 10);
    var token = _newTokenId(meta.tenantId, meta.userId, salt);
    var newRefresh = _newTokenId(meta.tenantId, meta.userId, 'r:' + salt);
    var ttlMs = 60 * 60 * 1000;
    var expiresAt = new Date(Date.now() + ttlMs).toISOString();
    var rec = {
      token: token,
      tenantId: meta.tenantId,
      userId: meta.userId,
      username: old.username,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt,
      refresh: newRefresh,
      revoked: false,
    };
    tokens.set(token, rec);
    refreshTokens.set(newRefresh, { tenantId: meta.tenantId, userId: meta.userId, token: token });
    // Revoke old pair
    old.revoked = true;
    refreshTokens.delete(opts.refreshToken);
    return { ok: true, token: token, refreshToken: newRefresh, expiresAt: expiresAt };
  };

  MobileAPI.prototype.bootstrap = function bootstrap(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.userId) return { ok: false, error: 'FIELD_REQUIRED:userId' };
    var lang = (opts.lang || 'ar-SA').toString();
    return {
      ok: true,
      config: {
        appVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        forceUpdate: false,
        ssoEnabled: false,
        mfaRequired: false,
        apiBase: '/api/mobile',
      },
      fonts: lang.startsWith('ar')
        ? ['Cairo', 'Tajawal', 'NotoSansArabic']
        : ['Inter', 'Roboto'],
      theme: {
        primary: '#0a3d62',
        accent: '#3c6382',
        rtl: lang.startsWith('ar'),
        dark: false,
      },
      services: ['appointments', 'labs', 'imaging', 'vitals', 'prescriptions', 'telehealth'],
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
  };

  MobileAPI.prototype.sync = function sync(opts) {
    if (!opts || !opts.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!opts.userId) return { ok: false, error: 'FIELD_REQUIRED:userId' };
    var since = opts.since ? new Date(opts.since).getTime() : 0;
    if (isNaN(since)) since = 0;
    var serverTs = Date.now();
    return {
      ok: true,
      serverTs: new Date(serverTs).toISOString(),
      delta: {
        appointments: [],
        labs: [],
        imaging: [],
        vitals: [],
        prescriptions: [],
      },
      cursor: new Date(serverTs).toISOString(),
    };
  };

  MobileAPI.prototype.logout = function logout(opts) {
    if (!opts || !opts.token) return { ok: false, error: 'FIELD_REQUIRED:token' };
    var rec = tokens.get(opts.token);
    if (!rec) return { ok: true, alreadyInvalid: true };
    rec.revoked = true;
    if (rec.refresh) refreshTokens.delete(rec.refresh);
    tokens.delete(opts.token);
    return { ok: true };
  };

  // Test helpers (not part of the public spec)
  MobileAPI.prototype._users = function () { return users; };
  MobileAPI.prototype._tokens = function () { return tokens; };

  return MobileAPI;
});
