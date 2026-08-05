'use strict';
// OwnerPermitVerifier — verifies a permit emitted by scripts/owner_sign.js.
//
// Format of a permit:
//   { ok, keyId, target, ts, token, env }
// Where `token` is the first-16 hex of SHA-256( JSON({keyId, ts, target}) ).
//
// Verification policy:
//   - keyId must be in owner_keystore.json
//   - ts must be within +/- TTL of now
//   - token must match re-hash of (keyId, ts, target)
//
// In strict mode (requireKeystore(true)): refuses if keystore is empty,
// so default deployment can never produce a permit by accident.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OwnerPermitVerifier {
  constructor(opts = {}) {
    this.keystorePath = opts.keystorePath || path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'owner_keystore.json');
    this.ttlMs = opts.ttlMs !== undefined ? opts.ttlMs : 24 * 60 * 60 * 1000;
    this.strict = opts.strict !== false;
    this._keystore = null;
  }

  _load() {
    if (this._keystore) return this._keystore;
    if (!fs.existsSync(this.keystorePath)) {
      this._keystore = { owners: [], strict: this.strict };
      return this._keystore;
    }
    try {
      this._keystore = JSON.parse(fs.readFileSync(this.keystorePath, 'utf8'));
    } catch (e) {
      this._keystore = { owners: [], strict: this.strict };
    }
    return this._keystore;
  }

  requireKeystore(b) { this.strict = !!b; }

  _rehash(keyId, ts, target) {
    return crypto.createHash('sha256')
      .update(JSON.stringify({ keyId, ts, target }))
      .digest('hex')
      .slice(0, 16);
  }

  verify(permit) {
    if (!permit || typeof permit !== 'object') throw new Error('PERMIT_REQUIRED');
    const ks = this._load();
    if (this.strict && (!ks.owners || ks.owners.length === 0)) throw new Error('EMPTY_KEYSTORE');
    if (!permit.keyId) throw new Error('KEY_ID_REQUIRED');
    if (!permit.target) throw new Error('TARGET_REQUIRED');
    if (!permit.ts) throw new Error('TS_REQUIRED');
    if (!permit.token) throw new Error('TOKEN_REQUIRED');

    // keyId must exist in keystore
    const owner = (ks.owners || []).find(o => o.id === permit.keyId);
    if (!owner) {
      // Allow keystore-mode: if keystore empty AND we are NOT strict, accept
      // legacy/auto-generated system permits. We disabled this when strict.
      if (this.strict) throw new Error('UNKNOWN_KEY_ID');
      // non-strict: return permit unchanged
      return { ok: true, permit, reason: 'LEGACY_MODE', owner: null };
    }

    // ts window check
    const tsNum = Date.parse(permit.ts);
    if (Number.isNaN(tsNum)) throw new Error('TS_INVALID');
    const now = Date.now();
    if (Math.abs(now - tsNum) > this.ttlMs) throw new Error('PERMIT_EXPIRED');

    // token check
    const expected = this._rehash(permit.keyId, permit.ts, permit.target);
    if (expected !== permit.token) throw new Error('TOKEN_MISMATCH');

    return { ok: true, permit, owner };
  }
}

module.exports = { OwnerPermitVerifier };
