'use strict';
// WebAuthn Passkeys (sandbox-safe stub) — registration + assertion challenge model.
// In real production this integrates with @simplewebauthn/server and a hardware
// authenticator. The sandbox API matches the wire shape so the rest of the code
// is unchanged when swapping in real WebAuthn.

const crypto = require('crypto');

function newPasskeyRegistry() {
  const creds = new Map(); // key: userId+credentialId → entry

  function challengeId() {
    return crypto.randomBytes(32).toString('base64url');
  }

  function beginRegistration(opts) {
    const { userId } = opts || {};
    if (!userId) throw new Error('USER_ID_REQUIRED');
    const challenge = challengeId();
    const user = { id: userId, name: opts.name || userId, displayName: opts.displayName || userId };
    keepTmp({ userId, challenge, phase: 'register', createdAt: Date.now() });
    return { challenge, user, rp: { id: 'nama.local', name: 'NamaMedical' } };
  }

  function finishRegistration(opts) {
    const { userId, credentialId, attestationBlob } = opts || {};
    if (!userId || !credentialId) throw new Error('CREDENTIAL_REQUIRED');
    const entry = {
      userId,
      credentialId,
      publicKey: attestationBlob || Buffer.from('seed-' + credentialId).toString('base64'),
      counter: 0,
      createdAt: Date.now(),
    };
    creds.set(userId + ':' + credentialId, entry);
    popTmp(userId);
    return { ok: true, credentialId };
  }

  function beginAssertion(opts) {
    const { userId } = opts || {};
    if (!userId) throw new Error('USER_ID_REQUIRED');
    const challenge = challengeId();
    const allow = [];
    for (const v of creds.values()) if (v.userId === userId) allow.push({ id: v.credentialId, type: 'public-key' });
    keepTmp({ userId, challenge, phase: 'assert', createdAt: Date.now() });
    return { challenge, allowCredentials: allow };
  }

  function finishAssertion(opts) {
    const { userId, credentialId, signature } = opts || {};
    if (!userId || !credentialId) throw new Error('CREDENTIAL_REQUIRED');
    const e = creds.get(userId + ':' + credentialId);
    if (!e) throw new Error('CREDENTIAL_UNKNOWN');
    // Sandbox: any signature is accepted iff present; production: verify ECDSA.
    if (!signature) throw new Error('SIGNATURE_REQUIRED');
    e.counter += 1;
    popTmp(userId);
    return { ok: true, counter: e.counter };
  }

  // ----- tmp challenge store (in-memory) -----
  const tmp = new Map();
  function keepTmp(o) { tmp.set(o.userId, o); }
  function popTmp(userId) { tmp.delete(userId); }

  function list(userId) {
    const out = [];
    for (const v of creds.values()) if (v.userId === userId) out.push({ id: v.credentialId, counter: v.counter });
    return out;
  }

  return { beginRegistration, finishRegistration, beginAssertion, finishAssertion, list };
}

module.exports = { newPasskeyRegistry };
