'use strict';
// OAuth2 issuer — issue/verify tokens. In production this is backed by an
// auth provider (Hydra, Keycloak). Sandbox: HMAC-signed tokens.

const crypto = require('crypto');

function newDeveloperPortal(secret) {
  const secret_ = secret || crypto.randomBytes(32).toString('base64url');
  const partners = new Map();
  function registerPartner({ partnerId, scopes }) {
    if (!partnerId) throw new Error('PARTNER_ID_REQUIRED');
    partners.set(partnerId, { partnerId, scopes: scopes || [], apiKey: 'ak-' + crypto.randomBytes(8).toString('hex') });
    return partners.get(partnerId);
  }
  function issueToken({ partnerId, scope }) {
    const p = partners.get(partnerId);
    if (!p) throw new Error('PARTNER_UNKNOWN');
    if (scope && !p.scopes.includes(scope)) throw new Error('SCOPE_NOT_GRANTED');
    const body = { partnerId, scope: scope || null, ts: Date.now() };
    const sig = crypto.createHmac('sha256', secret_).update(JSON.stringify(body)).digest('hex');
    return { token: Buffer.from(JSON.stringify(body)).toString('base64url') + '.' + sig, body };
  }
  function verifyToken({ token }) {
    if (!token || token.indexOf('.') < 0) return { ok: false };
    const [b, sig] = token.split('.');
    const body = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    const expect = crypto.createHmac('sha256', secret_).update(JSON.stringify(body)).digest('hex');
    if (expect !== sig) return { ok: false, reason: 'BAD_SIG' };
    return { ok: true, body };
  }
  return { registerPartner, issueToken, verifyToken };
}

module.exports = { newDeveloperPortal };
