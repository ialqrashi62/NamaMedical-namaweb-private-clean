'use strict';
// Encrypted local patient-side vault. Uses AES-256-GCM with a key derived from
// the user PIN via scrypt. In sandbox: keystore stub.

const crypto = require('crypto');

function newHealthVault() {
  function _key(pin) {
    return crypto.scryptSync(pin, 'nama-vault-salt', 32);
  }
  function put({ pin, payload }) {
    if (!pin || !payload) throw new Error('PIN_AND_PAYLOAD_REQUIRED');
    const key = _key(pin);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
  }
  function get({ pin, blob }) {
    if (!pin || !blob) throw new Error('PIN_AND_BLOB_REQUIRED');
    const key = _key(pin);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(blob.ct, 'base64')), decipher.final()]);
    return JSON.parse(pt.toString('utf8'));
  }
  return { put, get };
}

module.exports = { newHealthVault };
