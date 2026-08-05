'use strict';
// Refresh token rotation with revocation list. In-memory store for sandbox.
// Rotation: each call to rotate() returns a NEW refresh token and revokes the old.
// Revoked tokens are kept in a tombstone set with TTL to prevent replay.

const crypto = require('crypto');

function newRefreshTokenStore(opts = {}) {
  const ttlMs = opts.ttlMs || 30 * 24 * 3600 * 1000; // 30 days
  const tokens = new Map(); // token → { userId, tenantId, rotatedFrom, expiresAt, revoked }
  const tombstones = new Map(); // token → expiresAt

  function _now() { return Date.now(); }
  function _rand() { return crypto.randomBytes(32).toString('base64url'); }

  function issue(opts) {
    const { userId, tenantId, parentToken } = opts || {};
    if (!userId || !tenantId) throw new Error('USER_TENANT_REQUIRED');
    // Note: replay detection lives in rotate() — internals only.
    const token = _rand();
    const family = (parentToken && tokens.get(parentToken)?.family) || crypto.randomUUID();
    tokens.set(token, {
      token,
      userId,
      tenantId,
      family,
      rotatedFrom: parentToken || null,
      expiresAt: _now() + ttlMs,
      revoked: false,
    });
    return token;
  }

  function rotate(opts) {
    const { refreshToken } = opts || {};
    if (!refreshToken) throw new Error('REFRESH_REQUIRED');
    // Replay detection: token was already rotated/revoked.
    if (tombstones.has(refreshToken)) {
      // Tombstone is sufficient evidence. We do NOT purge the family here
      // because the legitimate user (with the rotated descendant) should still
      // be able to rotate. Callers must treat REFRESH_REPLAY_DETECTED as a
      // signal to invalidate the session.
      throw new Error('REFRESH_REPLAY_DETECTED');
    }
    const cur = tokens.get(refreshToken);
    if (!cur) throw new Error('REFRESH_UNKNOWN');
    if (cur.revoked) throw new Error('REFRESH_REVOKED');
    if (cur.expiresAt < _now()) throw new Error('REFRESH_EXPIRED');
    cur.revoked = true;
    tombstones.set(refreshToken, cur.expiresAt);
    return { newToken: issue({ userId: cur.userId, tenantId: cur.tenantId, parentToken: refreshToken }),
             userId: cur.userId, tenantId: cur.tenantId };
  }

  function revoke(token) {
    const cur = tokens.get(token);
    if (!cur) return false;
    cur.revoked = true;
    tombstones.set(token, cur.expiresAt);
    return true;
  }

  function _gc() {
    const now = _now();
    for (const [k, v] of tokens) if (v.expiresAt < now) tokens.delete(k);
    for (const [k, v] of tombstones) if (v < now) tombstones.delete(k);
  }

  return { issue, rotate, revoke, _gc, _store: tokens, _tombstones: tombstones };
}

module.exports = { newRefreshTokenStore };
