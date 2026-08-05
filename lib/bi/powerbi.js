'use strict';
// lib/bi/powerbi.js
// P27 — Power BI Embedded token broker (mocked Azure AD). Pure JS, no
// npm install. The class returns signed-looking embed tokens with:
//   - 60-minute TTL default
//   - tenant-bound RLS roles filter
//   - HTTPS-only embed URL validation
//
// In production this would call Microsoft's `GenerateToken` REST API and
// sign with a tenant-bound X.509. The mock emits a stable signed-token
// shape that downstream embed players can verify.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PowerBIEmbed = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULT_TTL_SEC = 60 * 60;        // 60 min
  const MIN_TTL_SEC     = 5 * 60;         // 5 min hard floor
  const MAX_TTL_SEC     = 60 * 60;        // 1 hour hard ceiling (Power BI policy)

  function _now() { return Date.now(); }

  // Pseudo-HMAC base64url — deterministic for a given {tenantId,userId,roles,ttl,nonce}.
  // NOT secure for production; here only to exercise downstream consumers.
  function _fakeSign(input) {
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
      h = (h * 33) ^ input.charCodeAt(i);
    }
    let s = '';
    let n = h >>> 0;
    for (let i = 0; i < 6; i++) {
      s += n.toString(36);
      n = (n * 1103515245 + 12345) >>> 0;
    }
    return s.slice(0, 18);
  }

  function _b64UrlEncode(s) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    // tiny b64url encoder (covers ascii only — fine for our tokens)
    const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    let buf = 0;
    let bits = 0;
    for (let i = 0; i < s.length; i++) {
      buf = (buf << 8) | s.charCodeAt(i);
      bits += 8;
      while (bits >= 6) {
        bits -= 6;
        out += b64[(buf >> bits) & 0x3F];
      }
    }
    if (bits > 0) out += b64[(buf << (6 - bits)) & 0x3F];
    return out;
  }

  function _isHttps(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }

  function _normalizeRoles(roles) {
    if (!roles) return [];
    if (Array.isArray(roles)) {
      return roles
        .filter(function (r) { return typeof r === 'string' && r.length > 0; })
        .map(function (r) { return r.replace(/[^a-zA-Z0-9_-]/g, ''); });
    }
    if (typeof roles === 'string') {
      return roles.split(',').map(function (r) { return r.trim().replace(/[^a-zA-Z0-9_-]/g, ''); })
        .filter(function (r) { return r.length > 0; });
    }
    return [];
  }

  class PowerBIEmbed {
    constructor(opts) {
      opts = opts || {};
      this._ttlSec = (typeof opts.ttlSec === 'number' && opts.ttlSec > 0)
        ? Math.min(Math.max(opts.ttlSec, MIN_TTL_SEC), MAX_TTL_SEC)
        : DEFAULT_TTL_SEC;
      this._audience = opts.audience || 'powerbi:embed';
    }

    // Tenant-bound embed token.
    // workspaceId: GUID of the Power BI workspace
    // reportId   : GUID of the report
    // tenantId   : MUST be the calling tenant (binding for RAIL-5)
    // userId     : MUST resolve to a real user (no anon tokens)
    // roles      : optional array|string of RLS role names
    getToken({ workspaceId, reportId, tenantId, userId, roles, ttlSec } = {}) {
      if (!workspaceId || typeof workspaceId !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'workspaceId is required' };
      }
      if (!reportId || typeof reportId !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'reportId is required' };
      }
      if (!tenantId || typeof tenantId !== 'string') {
        return { ok: false, error: 'TENANT_REQUIRED', msg: 'tenantId is required' };
      }
      if (!userId || typeof userId !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'userId is required' };
      }

      const normRoles = _normalizeRoles(roles);
      const ttl = (typeof ttlSec === 'number' && ttlSec > 0)
        ? Math.min(Math.max(ttlSec, MIN_TTL_SEC), MAX_TTL_SEC)
        : this._ttlSec;

      const issued = _now();
      const expires = issued + (ttl * 1000);
      const nonce = Math.random().toString(36).slice(2, 10);

      const header  = { alg: 'HS256', typ: 'JWT', kid: 'pbi-kid-' + tenantId };
      const payload = {
        iss: this._audience,
        sub: userId,
        tid: tenantId,
        wid: workspaceId,
        rid: reportId,
        roles: normRoles,
        rls: normRoles.length > 0,
        iat: Math.floor(issued / 1000),
        nbf: Math.floor(issued / 1000),
        exp: Math.floor(expires / 1000),
        nonce: nonce,
      };

      const head = _b64UrlEncode(JSON.stringify(header));
      const body = _b64UrlEncode(JSON.stringify(payload));
      const sig  = _fakeSign(head + '.' + body + '.' + tenantId + '.' + userId);
      const token = head + '.' + body + '.' + sig;

      const embedUrl = this._embedUrlFor({ workspaceId: workspaceId, reportId: reportId });

      // Defense-in-depth: reject any non-HTTPS embed URL.
      if (!_isHttps(embedUrl)) {
        return { ok: false, error: 'INSECURE_EMBED_URL', msg: 'Embed URL must be HTTPS' };
      }

      return {
        ok: true,
        token: token,
        embedUrl: embedUrl,
        tokenType: 'Bearer',
        expiration: new Date(expires).toISOString(),
        ttlSec: ttl,
        rls: { roles: normRoles, enforced: normRoles.length > 0 },
        tenantId: tenantId,
        workspaceId: workspaceId,
        reportId: reportId,
        userId: userId,
      };
    }

    _embedUrlFor({ workspaceId, reportId }) {
      return 'https://app.powerbi.com/reportEmbed?reportId='
        + encodeURIComponent(reportId)
        + '&groupId='
        + encodeURIComponent(workspaceId);
    }

    // List reports in a workspace — returns metadata, NOT raw report XML.
    listReports({ workspaceId, tenantId } = {}) {
      if (!workspaceId || typeof workspaceId !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'workspaceId is required' };
      }
      if (!tenantId || typeof tenantId !== 'string') {
        return { ok: false, error: 'TENANT_REQUIRED', msg: 'tenantId is required' };
      }
      return {
        ok: true,
        workspaceId: workspaceId,
        tenantId: tenantId,
        reports: [
          { reportId: 'rpt-exec-overview',    name: 'Executive Overview',       type: 'powerBIReport' },
          { reportId: 'rpt-daily-admissions', name: 'Daily Admissions by Dept', type: 'powerBIReport' },
          { reportId: 'rpt-revenue-cycle',    name: 'Revenue Cycle KPIs',       type: 'powerBIReport' },
          { reportId: 'rpt-er-wait',          name: 'ER Wait Times',            type: 'powerBIReport' },
          { reportId: 'rpt-icu-occupancy',    name: 'ICU Occupancy',            type: 'powerBIReport' },
        ],
      };
    }

    // List workspaces the tenant owns/has a role on.
    listWorkspaces({ tenantId } = {}) {
      if (!tenantId || typeof tenantId !== 'string') {
        return { ok: false, error: 'TENANT_REQUIRED', msg: 'tenantId is required' };
      }
      return {
        ok: true,
        tenantId: tenantId,
        workspaces: [
          { workspaceId: 'ws-exec-' + tenantId,      name: 'Executive',  role: 'Admin' },
          { workspaceId: 'ws-clinical-' + tenantId,  name: 'Clinical',   role: 'Member' },
          { workspaceId: 'ws-fin-' + tenantId,       name: 'Finance',    role: 'Viewer' },
        ],
      };
    }

    // Security check: refuse to embed URLs not on HTTPS / not on the
    // expected Microsoft host. Prevents crafted XSS-borne embed URLs.
    validateEmbedUrl(url) {
      if (!_isHttps(url)) {
        return { ok: false, valid: false, reason: 'NOT_HTTPS' };
      }
      let host = '';
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch (_e) {
        return { ok: false, valid: false, reason: 'INVALID_URL' };
      }
      const allowed = ['app.powerbi.com', 'powerbi.com'];
      const matches = allowed.some(function (h) { return host === h || host.endsWith('.' + h); });
      if (!matches) {
        return { ok: false, valid: false, reason: 'UNEXPECTED_HOST' };
      }
      return { ok: true, valid: true, host: host };
    }
  }

  return PowerBIEmbed;
});
