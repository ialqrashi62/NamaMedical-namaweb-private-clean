// lib/billing/storage.js
// In-memory invoice storage for P7 (Multi-Currency Billing).
// Pure JS, no npm install. Sandbox-safe stand-in for a real PG-backed
// invoice ledger. Keyed by (tenantId, id) and (tenantId, hash) so
// idempotency lookups never cross tenant boundaries (RAIL-5).
//
// Production note: replace with a `pg`-backed ledger; the API surface
// here is intentionally narrow so the swap is mechanical.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BillingStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // invoiceId  -> { tenantId, invoice }
  const _byId = new Map();
  // hashKey    -> invoiceId  (idempotency index, tenant-scoped)
  const _byHash = new Map();
  // tenantId   -> Set<invoiceId>  (listing index, tenant-scoped)
  const _byTenant = new Map();

  function _tenantSet(tenantId) {
    if (!_byTenant.has(tenantId)) _byTenant.set(tenantId, new Set());
    return _byTenant.get(tenantId);
  }

  function _key(tenantId, id) {
    return tenantId + '::' + id;
  }

  function put(invoice) {
    if (!invoice || typeof invoice !== 'object') throw new Error('INVOICE_INVALID');
    if (!invoice.tenantId) throw new Error('TENANT_REQUIRED');
    if (!invoice.id)      throw new Error('INVOICE_ID_REQUIRED');
    if (!invoice.hash)    throw new Error('INVOICE_HASH_REQUIRED');

    const idKey = _key(invoice.tenantId, invoice.id);
    const hashKey = invoice.tenantId + '::' + invoice.hash;

    if (_byId.has(idKey)) {
      // Same id twice → return existing (idempotent put).
      return _byId.get(idKey);
    }
    _byId.set(idKey, invoice);
    _byHash.set(hashKey, invoice.id);
    _tenantSet(invoice.tenantId).add(invoice.id);
    return invoice;
  }

  function getById(tenantId, id) {
    if (!tenantId) return null;
    if (!id) return null;
    return _byId.get(_key(tenantId, id)) || null;
  }

  function getByHash(tenantId, hash) {
    if (!tenantId || !hash) return null;
    const id = _byHash.get(tenantId + '::' + hash);
    if (!id) return null;
    return _byId.get(_key(tenantId, id)) || null;
  }

  function list(tenantId, opts) {
    if (!tenantId) return [];
    const ids = Array.from(_tenantSet(tenantId).values());
    const currency = opts && opts.currency ? String(opts.currency).toUpperCase() : null;
    const q = opts && opts.q ? String(opts.q).toLowerCase() : null;
    const limit = (opts && Number.isFinite(opts.limit)) ? opts.limit : 100;
    const offset = (opts && Number.isFinite(opts.offset)) ? opts.offset : 0;
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const inv = _byId.get(_key(tenantId, ids[i]));
      if (!inv) continue;
      if (inv.voided) continue;
      if (currency && inv.currencyCode !== currency) continue;
      if (q) {
        const hay = (inv.patientId + ' ' + inv.id + ' ' + (inv.note || '')).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      results.push(inv);
    }
    return results.slice(offset, offset + limit);
  }

  function search(tenantId, predicate) {
    if (!tenantId) return [];
    if (typeof predicate !== 'function') return [];
    const ids = Array.from(_tenantSet(tenantId).values());
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const inv = _byId.get(_key(tenantId, ids[i]));
      if (!inv) continue;
      try {
        if (predicate(inv)) out.push(inv);
      } catch (_e) { /* predicate errors never break listing */ }
    }
    return out;
  }

  function voidInvoice(tenantId, id, reason) {
    const inv = getById(tenantId, id);
    if (!inv) return null;
    if (inv.voided) return inv;
    inv.voided = true;
    inv.voidedAt = new Date().toISOString();
    inv.voidReason = reason || null;
    return inv;
  }

  // Test helper, never called from routes.
  function _reset() {
    _byId.clear();
    _byHash.clear();
    _byTenant.clear();
  }

  function _stats() {
    return {
      byId: _byId.size,
      byHash: _byHash.size,
      tenants: _byTenant.size
    };
  }

  return {
    put: put,
    getById: getById,
    getByHash: getByHash,
    list: list,
    search: search,
    voidInvoice: voidInvoice,
    _reset: _reset,
    _stats: _stats
  };
});
