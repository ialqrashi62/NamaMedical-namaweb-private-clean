'use strict';
// MFA — TOTP (RFC 6238) sandbox implementation.
// In production, integrate with authenticator apps via QRcode.

const crypto = require('crypto');

function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out = [];
  for (const c of s.toUpperCase()) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) buf[7 - i] = counter & 0xff;
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
  return String(code).padStart(digits, '0');
}

function totp(secret, window = 0, time = Date.now()) {
  const sec = base32Decode(secret);
  const counter = Math.floor((time / 1000) / 30) + window;
  return hotp(sec, counter);
}

function generateSecret() {
  const buf = crypto.randomBytes(32);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = '';
  for (const b of buf) s += alphabet[b & 0x1f];
  return s;
}

function verify(secret, code, opts = {}) {
  const window = opts.window || 1;
  for (let w = -window; w <= window; w++) {
    if (totp(secret, w) === code) return true;
  }
  return false;
}

module.exports = { generateSecret, totp, verify, base32Decode };
