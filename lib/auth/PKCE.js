'use strict';
// PKCE (RFC 7636) — code_verifier + S256 code_challenge.
// Pure deterministic — no DB, no network. Used by OAuth2 / refresh_token flows.

const crypto = require('crypto');

function generateVerifier(byteLen = 32) {
  // 32 bytes → 43 base64url chars (RFC 7636 §4.1: 43..128 chars)
  return crypto.randomBytes(byteLen).toString('base64url');
}

function challengeFrom(verifier) {
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) {
    throw new Error('PKCE_VERIFIER_INVALID');
  }
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generatePair() {
  const code_verifier = generateVerifier();
  const code_challenge = challengeFrom(code_verifier);
  const code_challenge_method = 'S256';
  return { code_verifier, code_challenge, code_challenge_method };
}

function verify({ verifier, challenge, method }) {
  if (method === 'plain') {
    return verifier === challenge;
  }
  if (method === 'S256' || !method) {
    if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return false;
    try {
      return challengeFrom(verifier) === challenge;
    } catch (_) {
      return false;
    }
  }
  throw new Error('PKCE_METHOD_INVALID');
}

module.exports = { generateVerifier, challengeFrom, generatePair, verify };
