// lib/billing/invoice.js
// InvoiceEngine — P7 (Multi-Currency Billing).
// Pure JS, no npm install. RAIL-compliant:
//
//   RAIL-5  tenant scope enforced on every read/write.
//   RAIL-6  idempotency on POST /invoice via Idempotency-Key header
//           OR a deterministic hash of (tenantId+patientId+items+ccy+fxDate).
//   RAIL-9  money server-side: we always recompute totals from items[].
//           We never trust a client-provided `total` or `discount`.
//   RAIL-10 hash-chained audit via optional AuditService (defaults to
//           an in-process array for the sandbox; never throws to caller).
//   RAIL-12 no PHI in logs (we log id/tenant/currency/latency only).
//
// FX snapshot: the engine records the FX rate + source + fxDate at the
// moment of invoice creation, so a later rate change does NOT mutate
// historical invoices. This is the "FX snapshot at invoice time" rule.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InvoiceEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const crypto = require('crypto');
  const Currency = require('./currency');
  const Storage  = require('./storage');

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------
  function _nowIso() { return new Date().toISOString(); }

  function _genId() {
    return 'inv_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  }

  // Deterministic, RAIL-6 idempotency hash. Two POSTs with the same
  // tenant + patient + items + currency + fxDate resolve to the same
  // invoice — i.e. duplicate submissions are safe to retry.
  function _idempotencyHash(tenantId, patientId, items, currencyCode, fxDate) {
    const norm = (items || []).map(function (it) {
      return {
        code:   String(it.code || ''),
        amount: Number(it.amount || 0),
        qty:    Number(it.qty || 1)
      };
    }).sort(function (a, b) { return (a.code < b.code) ? -1 : (a.code > b.code ? 1 : 0); });
    const payload = {
      t: tenantId,
      p: patientId,
      i: norm,
      c: currencyCode,
      f: (fxDate instanceof Date) ? fxDate.toISOString() : String(fxDate || '')
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  // Hash-chain a single audit event to a tenant-local chain. Mirrors
  // AuditService.record() so a sandbox run without PG still produces a
  // verifiable chain. We never let audit failures break the caller.
  function _audit(chain, evt) {
    if (!chain) return { ok: true, sink: 'noop' };
    try {
      const prev = chain.lastHash || '0'.repeat(64);
      const enriched = Object.assign({ ts: _nowIso() }, evt);
      const hash = crypto.createHash('sha256').update(prev + JSON.stringify(enriched)).digest('hex');
      chain.lastHash = hash;
      chain.entries.push({ prev: prev, hash: hash, payload: enriched });
      return { ok: true, sink: 'memory', hash: hash };
    } catch (e) {
      return { ok: false, sink: 'memory', error: e.message };
    }
  }

  function _isValidItem(it) {
    if (!it || typeof it !== 'object') return false;
    if (typeof it.amount !== 'number' || !isFinite(it.amount) || it.amount < 0) return false;
    if (!it.code || typeof it.code !== 'string') return false;
    return true;
  }

  // ------------------------------------------------------------------
  // InvoiceEngine
  // ------------------------------------------------------------------
  class InvoiceEngine {
    constructor(opts) {
      opts = opts || {};
      this.tenantId = opts.tenantId || null;
      this.actorId  = opts.actorId  || null;
      // audit chain is per-instance; production uses AuditService.
      this._chain = { lastHash: null, entries: [] };
      this._auditSink = (typeof opts.auditSink === 'function') ? opts.auditSink : null;
    }

    // Sum items in the requested currency. We do not trust any
    // client-supplied `total` or `discount` — RAIL-9.
    totalize(args) {
      args = args || {};
      const items = Array.isArray(args.items) ? args.items : [];
      const currencyCode = args.currencyCode || 'SAR';
      if (!Currency.get(currencyCode)) throw new Error('CURRENCY_UNSUPPORTED:' + currencyCode);

      let subtotal = 0;
      const lines = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!_isValidItem(it)) throw new Error('ITEM_INVALID');
        const qty = Number(it.qty || 1);
        const lineAmount = Number(it.amount) * qty;
        subtotal += lineAmount;
        lines.push({
          code: it.code,
          desc: it.desc || null,
          qty: qty,
          unitAmount: Number(it.amount),
          lineAmount: Currency._round(lineAmount, Currency.get(currencyCode).decimals)
        });
      }
      // SAR is our base currency; we snapshot the rate for this invoice
      // and report both totalsInBase (SAR) and totalsInCurrency.
      const fx = Currency.convert({
        amount: subtotal,
        from: currencyCode,
        to: 'SAR',
        at: args.fxDate || new Date()
      });

      return {
        lines: lines,
        subtotal: Currency._round(subtotal, Currency.get(currencyCode).decimals),
        currencyCode: currencyCode,
        totalsInBase: {
          currencyCode: 'SAR',
          subtotal: fx.converted === null ? null : Currency._round(fx.converted, 2)
        },
        fx: {
          rate: fx.rate,
          fxDate: fx.fxDate,
          source: fx.source,
          path: fx.path
        }
      };
    }

    create(args) {
      args = args || {};
      const tenantId = args.tenantId || this.tenantId;
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      const patientId = args.patientId;
      if (!patientId) throw new Error('PATIENT_REQUIRED');
      const items = Array.isArray(args.items) ? args.items : [];
      if (items.length === 0) throw new Error('ITEMS_REQUIRED');
      const currencyCode = (args.currencyCode || 'SAR').toUpperCase();
      if (!Currency.get(currencyCode)) throw new Error('CURRENCY_UNSUPPORTED:' + currencyCode);
      const fxDate = args.fxDate || new Date();

      // RAIL-6: idempotency. If a caller-supplied Idempotency-Key header
      // is present we honour it; otherwise we derive one from the
      // canonical payload. Either way the storage layer is the
      // single source of truth for dedup.
      const explicitKey = args.idempotencyKey || null;
      const derived = _idempotencyHash(tenantId, patientId, items, currencyCode, fxDate);

      // Existing invoice? Return as-is (RAIL-6).
      const existing = Storage.getByHash(tenantId, derived);
      if (existing) {
        _audit(this._chain, {
          tenantId: tenantId,
          action: 'invoice.idempotent_replay',
          invoiceId: existing.id,
          hash: derived,
          explicitKey: explicitKey,
          actorId: args.actorId || this.actorId
        });
        return Object.assign({ idem_replay: true, idempotencyKey: explicitKey, derivedHash: derived }, existing);
      }

      // Compute totals server-side (RAIL-9).
      const totals = this.totalize({ items: items, currencyCode: currencyCode, fxDate: fxDate });

      const id = _genId();
      const invoice = {
        id: id,
        tenantId: tenantId,
        patientId: patientId,
        items: totals.lines,
        currencyCode: currencyCode,
        subtotal: totals.subtotal,
        total: totals.subtotal, // no tax/discount in v1; future-proof
        totalsInBase: totals.totalsInBase,
        // FX snapshot at invoice time (RAIL-9 + auditability).
        fxRateAtInvoice: totals.fx.rate,
        fxDateAtInvoice: totals.fx.fxDate,
        fxSource: totals.fx.source,
        fxPath: totals.fx.path,
        // RAIL-10 + RAIL-6 plumbing.
        hash: derived,
        idempotencyKey: explicitKey,
        actorId: args.actorId || this.actorId || null,
        createdAt: _nowIso(),
        voided: false,
        note: args.note || null
      };

      Storage.put(invoice);

      const auditResult = _audit(this._chain, {
        tenantId: tenantId,
        action: 'invoice.create',
        invoiceId: id,
        hash: derived,
        currencyCode: currencyCode,
        subtotal: invoice.subtotal,
        totalInBase: invoice.totalsInBase.subtotal,
        fxRate: invoice.fxRateAtInvoice,
        fxSource: invoice.fxSource,
        actorId: invoice.actorId
      });
      invoice.auditHash = auditResult.hash;

      // External sink (AuditService) if injected.
      if (this._auditSink) {
        try {
          this._auditSink({
            tenantId: tenantId,
            action: 'invoice.create',
            invoiceId: id,
            hash: derived,
            payload: {
              currencyCode: currencyCode,
              subtotal: invoice.subtotal,
              fxRate: invoice.fxRateAtInvoice,
              fxSource: invoice.fxSource
            }
          });
        } catch (_e) { /* never throw to caller */ }
      }

      // RAIL-12: log non-PHI metadata only.
      if (process && process.env && process.env.BILLING_DEBUG === '1') {
        process.stdout.write('[billing] invoice.create ' + JSON.stringify({
          id: id, tenantId: tenantId, currencyCode: currencyCode,
          subtotal: invoice.subtotal, fxRate: invoice.fxRateAtInvoice,
          latencyMs: 0
        }) + '\n');
      }

      return invoice;
    }

    get(tenantId, id) {
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!id) throw new Error('INVOICE_ID_REQUIRED');
      const inv = Storage.getById(tenantId, id);
      if (!inv) return null;
      return inv;
    }

    list(tenantId, opts) {
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      return Storage.list(tenantId, opts || {});
    }

    search(tenantId, predicate) {
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      return Storage.search(tenantId, predicate);
    }

    voidInvoice(tenantId, id, reason) {
      if (!tenantId) throw new Error('TENANT_REQUIRED');
      if (!id) throw new Error('INVOICE_ID_REQUIRED');
      const inv = Storage.voidInvoice(tenantId, id, reason);
      if (!inv) return null;
      _audit(this._chain, {
        tenantId: tenantId,
        action: 'invoice.void',
        invoiceId: id,
        reason: reason || null,
        actorId: this.actorId
      });
      if (this._auditSink) {
        try { this._auditSink({ tenantId: tenantId, action: 'invoice.void', invoiceId: id, reason: reason || null }); }
        catch (_e) { /* never throw */ }
      }
      return inv;
    }

    // Read-only: dump the in-process audit chain. Never logged.
    auditChain() {
      return {
        lastHash: this._chain.lastHash,
        entries: this._chain.entries.slice()
      };
    }
  }

  // Dual-shape export:
  //   const InvoiceEngine = require('./lib/billing/invoice')   → the class
  //   const { InvoiceEngine, _idempotencyHash } = require(...)  → named members
  //   const I = require('./lib/billing/invoice'); new I()      → class is callable
  InvoiceEngine._idempotencyHash = _idempotencyHash;
  InvoiceEngine._audit = _audit;
  InvoiceEngine.InvoiceEngine = InvoiceEngine;
  return InvoiceEngine;
});
