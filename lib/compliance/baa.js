'use strict';
// Business Associate Agreement (BAA) Manager.
// Tracks BAAs per tenant under HIPAA §164.504(e).
// Hash-chained audit (RAIL-10), tenant-scoped (RAIL-5).
// Pure JS, no npm install. No PHI in records.

const crypto = require('crypto');

function hash(prev, payload) {
  const h = crypto.createHash('sha256');
  h.update(String(prev || 'GENESIS'));
  h.update('|');
  h.update(JSON.stringify(payload));
  return h.digest('hex');
}

function newBAAManager() {
  const records = []; // { baaId, tenantId, vendor, scope, signedBy, signedAt, expiresAt, status, hash, prevHash }
  let head = 'GENESIS';

  function genId(tenantId) {
    const t = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    const r = crypto.randomBytes(6).toString('hex');
    return 'BAA-' + t + '-' + r.toUpperCase();
  }

  function register(rec) {
    if (!rec || !rec.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!rec.vendor || !rec.signedBy) return { ok: false, error: 'FIELD_REQUIRED' };
    if (!rec.signedAt || !rec.expiresAt) return { ok: false, error: 'FIELD_REQUIRED' };
    if (typeof rec.scope !== 'string' || rec.scope.length === 0) {
      return { ok: false, error: 'FIELD_REQUIRED' };
    }
    const baaId = genId(rec.tenantId);
    const payload = {
      baaId: baaId,
      tenantId: rec.tenantId,
      vendor: rec.vendor,
      scope: rec.scope,
      signedBy: rec.signedBy,
      signedAt: rec.signedAt,
      expiresAt: rec.expiresAt,
      status: 'active',
      ts: new Date().toISOString()
    };
    const h = hash(head, payload);
    records.push(Object.assign({}, payload, { hash: h, prevHash: head }));
    head = h;
    return { ok: true, baa: { baaId: baaId, vendor: rec.vendor, status: 'active', hash: h } };
  }

  function active(tenantId) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const out = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.tenantId === tenantId && r.status === 'active') {
        out.push({
          baaId: r.baaId,
          vendor: r.vendor,
          scope: r.scope,
          signedBy: r.signedBy,
          signedAt: r.signedAt,
          expiresAt: r.expiresAt,
          hash: r.hash
        });
      }
    }
    return { ok: true, tenantId: tenantId, count: out.length, baas: out };
  }

  function expiring(tenantId, days) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const d = typeof days === 'number' && days > 0 ? days : 30;
    const now = Date.now();
    const horizon = now + d * 86400000;
    const out = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.tenantId !== tenantId || r.status !== 'active') continue;
      const exp = Date.parse(r.expiresAt);
      if (isNaN(exp)) continue;
      if (exp >= now && exp <= horizon) {
        out.push({
          baaId: r.baaId,
          vendor: r.vendor,
          expiresAt: r.expiresAt,
          daysLeft: Math.round((exp - now) / 86400000)
        });
      }
    }
    return { ok: true, tenantId: tenantId, days: d, baas: out };
  }

  function revoke(input) {
    if (!input || !input.baaId) return { ok: false, error: 'FIELD_REQUIRED' };
    if (!input.reason) return { ok: false, error: 'FIELD_REQUIRED' };
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.baaId !== input.baaId) continue;
      const payload = {
        op: 'revoke',
        baaId: r.baaId,
        reason: input.reason,
        ts: new Date().toISOString()
      };
      const h = hash(head, payload);
      r.status = 'revoked';
      r.revokedAt = payload.ts;
      r.revokeReason = input.reason;
      records.push(Object.assign({}, payload, { tenantId: r.tenantId, hash: h, prevHash: head }));
      head = h;
      return { ok: true, baaId: r.baaId, status: 'revoked', hash: h };
    }
    return { ok: false, error: 'BAA_NOT_FOUND' };
  }

  function audit(tenantId) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const chain = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.tenantId === tenantId) chain.push(r);
    }
    let valid = true;
    let prev = 'GENESIS';
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].prevHash !== prev) { valid = false; break; }
      prev = chain[i].hash;
    }
    return { ok: true, tenantId: tenantId, length: chain.length, valid: valid, head: prev };
  }

  function _has(tenantId, vendor) {
    if (!tenantId || !vendor) return false;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.tenantId === tenantId && r.vendor === vendor && r.status === 'active') {
        const exp = Date.parse(r.expiresAt);
        if (!isNaN(exp) && exp > Date.now()) return true;
      }
    }
    return false;
  }

  return {
    register: register,
    active: active,
    expiring: expiring,
    revoke: revoke,
    audit: audit,
    _has: _has,
    _records: function () { return records; }
  };
}

module.exports = { newBAAManager };
