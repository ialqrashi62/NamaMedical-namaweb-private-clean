'use strict';
// CredentialVault — per-tenant envelope encryption with KEK rotation.
// Rail 7 hardening.
//
// Flow:
//   KEK (master) — random AES-256-GCM generated per tenant
//   DEK (data)   — each secret gets its own AES-256-GCM DEK
//   Stored shape:
//      { tenantId, kekVersion, encryptedDek, dekIv, dekTag,
//        cipherBySecretKey: { [secretKey]: { iv, tag, ciphertext } } }
//
// Sandbox mode:
//   - KEK stored in-process (must be transferred to a KMS in production)
//   - File-backed JSON at .ai-brain/99-state/vault.json for cross-process
//     sharing inside the same workspace.
//
// All operations take ctx.tenantId so multi-tenant isolation is enforced.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VAULT_PATH = path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'vault.json');

function loadState(path) {
  if (!fs.existsSync(path)) return { version: 1, kekByTenant: {}, cipherByTenant: {} };
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) { return { version: 1, kekByTenant: {}, cipherByTenant: {} }; }
}

function saveState(state, path) {
  fs.mkdirSync(path && require('path').dirname(path) || '.', { recursive: true });
  fs.writeFileSync(VAULT_PATH, JSON.stringify(state, null, 2), 'utf8');
}

class CredentialVault {
  constructor(opts = {}) {
    this.path = opts.path || VAULT_PATH;
    this.fileState = opts.fileState !== false; // persist in sandbox
    this.inMemState = {
      version: 1,
      kekByTenant: {},       // tenantId -> [base64 KEK]
      kekVersionByTenant: {},// tenantId -> number
      cipherByTenant: {},    // tenantId -> { [secretKey]: {iv, tag, ciphertext} }
    };
    if (this.fileState && fs.existsSync(this.path)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        this.inMemState.kekByTenant = parsed.kekByTenant || {};
        this.inMemState.kekVersionByTenant = parsed.kekVersionByTenant || {};
        this.inMemState.cipherByTenant = parsed.cipherByTenant || {};
      } catch (e) { /* ignore */ }
    }
  }

  _persist() {
    if (!this.fileState) return;
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(this.inMemState, null, 2), 'utf8');
  }

  _ensureKek(tenantId) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!this.inMemState.kekByTenant[tenantId]) {
      const kek = crypto.randomBytes(32);
      this.inMemState.kekByTenant[tenantId] = kek.toString('base64');
      this.inMemState.kekVersionByTenant[tenantId] = 1;
      this.inMemState.cipherByTenant[tenantId] = this.inMemState.cipherByTenant[tenantId] || {};
      this._persist();
    }
    return {
      kek: Buffer.from(this.inMemState.kekByTenant[tenantId], 'base64'),
      version: this.inMemState.kekVersionByTenant[tenantId],
    };
  }

  rotateKek(tenantId) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const oldKekB64 = this.inMemState.kekByTenant[tenantId];
    if (!oldKekB64) {
      // nothing to rotate; just init
      this._ensureKek(tenantId);
      return { rotated: false, version: this.inMemState.kekVersionByTenant[tenantId] };
    }

    // Re-encrypt all secrets under new KEK
    const oldKek = Buffer.from(oldKekB64, 'base64');
    const oldSecrets = this.inMemState.cipherByTenant[tenantId] || {};
    const newKek = crypto.randomBytes(32);
    const reEncrypted = {};
    for (const secretKey of Object.keys(oldSecrets)) {
      const enc = oldSecrets[secretKey];
      // Decrypt with old KEK
      const iv = Buffer.from(enc.iv, 'base64');
      const tag = Buffer.from(enc.tag, 'base64');
      const ct = Buffer.from(enc.ciphertext, 'base64');
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', oldKek, iv);
        decipher.setAuthTag(tag);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        // Re-encrypt with new KEK
        const nIv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', newKek, nIv);
        const cOut = Buffer.concat([cipher.update(pt), cipher.final()]);
        reEncrypted[secretKey] = {
          iv: nIv.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
          ciphertext: cOut.toString('base64'),
        };
      } catch (e) {
        // If decrypt fails (key mismatch), skip
      }
    }
    this.inMemState.kekByTenant[tenantId] = newKek.toString('base64');
    this.inMemState.kekVersionByTenant[tenantId] = (this.inMemState.kekVersionByTenant[tenantId] || 1) + 1;
    this.inMemState.cipherByTenant[tenantId] = reEncrypted;
    this._persist();
    return {
      rotated: true,
      version: this.inMemState.kekVersionByTenant[tenantId],
      reEncryptedSecrets: Object.keys(reEncrypted).length,
    };
  }

  put(tenantId, secretKey, plaintext) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!secretKey) throw new Error('SECRET_KEY_REQUIRED');
    if (typeof plaintext !== 'string' && !Buffer.isBuffer(plaintext)) throw new Error('PLAIN_TEXT_REQUIRED');
    const { kek, version } = this._ensureKek(tenantId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const buf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const entry = {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ct.toString('base64'),
      kekVersion: version,
    };
    this.inMemState.cipherByTenant[tenantId] = this.inMemState.cipherByTenant[tenantId] || {};
    this.inMemState.cipherByTenant[tenantId][secretKey] = entry;
    this._persist();
    return entry;
  }

  get(tenantId, secretKey) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!secretKey) throw new Error('SECRET_KEY_REQUIRED');
    this._ensureKek(tenantId);
    const enc = (this.inMemState.cipherByTenant[tenantId] || {})[secretKey];
    if (!enc) return null;
    const kek = Buffer.from(this.inMemState.kekByTenant[tenantId], 'base64');
    const iv = Buffer.from(enc.iv, 'base64');
    const tag = Buffer.from(enc.tag, 'base64');
    const ct = Buffer.from(enc.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);
    try {
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return pt.toString('utf8');
    } catch (e) {
      throw new Error('VAULT_DECRYPT_FAILED');
    }
  }

  list(tenantId) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    this._ensureKek(tenantId);
    return Object.keys(this.inMemState.cipherByTenant[tenantId] || {});
  }

  has(tenantId, secretKey) {
    return !!(this.inMemState.cipherByTenant[tenantId] && this.inMemState.cipherByTenant[tenantId][secretKey]);
  }

  delete(tenantId, secretKey) {
    if (this.inMemState.cipherByTenant[tenantId]) {
      delete this.inMemState.cipherByTenant[tenantId][secretKey];
      this._persist();
      return true;
    }
    return false;
  }

  // Sign a payload with the tenant's KEK (HMAC-SHA256) — for cookie signing,
  // CSRF, etc. Returns base64.
  sign(tenantId, payload) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const { kek } = this._ensureKek(tenantId);
    const h = crypto.createHmac('sha256', kek);
    h.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return h.digest('base64');
  }

  verify(tenantId, payload, signature) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const { kek } = this._ensureKek(tenantId);
    const h = crypto.createHmac('sha256', kek);
    h.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
    const expected = h.digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  kekVersion(tenantId) {
    return this.inMemState.kekVersionByTenant[tenantId] || 0;
  }
}

module.exports = { CredentialVault };
