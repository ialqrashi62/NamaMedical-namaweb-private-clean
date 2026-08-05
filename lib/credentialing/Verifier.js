'use strict';
// Credentialing verifier — checks SCFHS/DHA/MOH license numbers.
// Uses a hash-based cache (in-memory) so the same number doesn't re-verify
// within a session. In production this hits the regulator's API.

const crypto = require('crypto');

function newCredentialingVerifier() {
  const cache = new Map(); // sha256(license) → {status, expiry, regulator}
  function _hash(license) { return crypto.createHash('sha256').update(license).digest('hex'); }

  function verify({ license, regulator }) {
    if (!license || !regulator) throw new Error('LICENSE_REGULATOR_REQUIRED');
    if (!['SCFHS', 'DHA', 'MOH'].includes(regulator)) throw new Error('REGULATOR_INVALID');
    const key = _hash(license + '|' + regulator);
    if (cache.has(key)) return cache.get(key);
    // Stub behavior: license is valid if last char is a digit.
    const valid = /\d$/.test(license);
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const result = { status: valid ? 'ACTIVE' : 'INACTIVE', expiry, regulator, licenseHash: key };
    cache.set(key, result);
    return result;
  }

  return { verify, _cache: cache };
}

module.exports = { newCredentialingVerifier };
