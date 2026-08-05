'use strict';
// SSO — SAML 2.0 / OIDC discovery. In production, integrates with azure-ad, okta, onelogin.
// Sandbox: token-based shim.

class SSO {
  constructor(opts = {}) {
    this.providers = opts.providers || [];
  }

  addProvider({ id, name, type, discoveryUrl }) {
    if (!id || !type) throw new Error('PROVIDER_INVALID');
    this.providers.push({ id, name, type, discoveryUrl });
  }

  list() { return this.providers; }

  callback({ providerId, token, claims }) {
    const p = this.providers.find(x => x.id === providerId);
    if (!p) throw new Error('PROVIDER_UNKNOWN');
    if (!token) throw new Error('TOKEN_REQUIRED');
    // In production: validate JWT signature using JWKS from discovery URL.
    return { ok: true, providerId, claims: claims || {}, token };
  }
}

module.exports = { SSO };
