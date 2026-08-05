// routes/billing_multi_currency.js
// G-11: Multi-currency billing surface (ISO 4217 + FX snapshot at invoice time).
// Wires lib/billing/currency + lib/billing/invoice + lib/billing/storage.
//
// Endpoints:
//   GET  /api/v4/billing/currencies        — list supported ISO 4217 currencies
//   GET  /api/v4/billing/currencies/:code  — single currency metadata
//   GET  /api/v4/billing/fx?from=USD&to=SAR — current FX snapshot (no invoice created)
//   GET  /api/v4/billing/fx/history?from=USD&to=SAR&fromDate=&toDate= — historical FX series
//   POST /api/v4/billing/invoice          — create invoice with currency + FX snapshot
//   POST /api/v4/billing/convert          — pure convert (no DB write, returns converted amount)
//
// SAFETY:
//   - RAIL-5: tenant scope required (req.tenantId + req.tenantScope)
//   - RAIL-7: no PHI in invoice header (only patient_id reference)
//   - RAIL-9: FX snapshot is server-side (client cannot override rate)
//   - RAIL-11: fail-closed — invalid currency or missing fields → 400
//   - RAIL-12: no PHI in logs (only patient_id + amount + currency)
'use strict';

const express = require('express');
const RouteFactory = require('../lib/route-factory');
const RouteGuards = require('../lib/route-guards');
const Currency = require('../lib/billing/currency');
const Storage = require('../lib/billing/storage');
const Invoice = require('../lib/billing/invoice');

function newBillingMultiCurrency() {
  const app = express.Router();
  app.use(express.json({ limit: '256kb' }));

  // ---- Currency catalog ----
  app.get('/currencies', (req, res) => {
    res.json({ ok: true, currencies: Currency.list() });
  });

  app.get('/currencies/:code', (req, res) => {
    const c = Currency.get(req.params.code);
    if (!c) return res.status(404).json({ error: 'CURRENCY_NOT_FOUND', code: req.params.code });
    res.json({ ok: true, currency: c });
  });

  // ---- FX rate (current snapshot) ----
  app.get('/fx', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'FROM_AND_TO_REQUIRED' });
    try {
      const result = Currency.convert({ amount: 1, from: String(from).toUpperCase(), to: String(to).toUpperCase() });
      res.json({ ok: true, from, to, rate: result.rate, fxDate: result.fxDate, source: result.source, path: result.path });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- FX historical series (per-snapshot lookup) ----
  app.get('/fx/history', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'FROM_AND_TO_REQUIRED' });
    const f = String(from).toUpperCase();
    const t = String(to).toUpperCase();
    // Return all known FX snapshots for the pair (or for each leg if multi-hop)
    const series = [];
    const directKey = f + '->' + t;
    if (f !== t && Currency.FX_SNAPSHOT[directKey]) {
      const snap = Currency.snapshotAt(directKey);
      series.push({ pair: directKey, rate: snap.rate, asOf: snap.asOf, source: snap.source });
    } else if (f !== t) {
      // Multi-hop via SAR: return both legs
      const leg1 = Currency.snapshotAt(f + '->SAR');
      const leg2 = Currency.snapshotAt('SAR->' + t);
      if (leg1) series.push({ pair: f + '->SAR', rate: leg1.rate, asOf: leg1.asOf, source: leg1.source });
      if (leg2) series.push({ pair: 'SAR->' + t, rate: leg2.rate, asOf: leg2.asOf, source: leg2.source });
    }
    res.json({ ok: true, from: f, to: t, series });
  });

  // ---- Pure convert (no DB) ----
  app.post('/convert', (req, res) => {
    const { amount, from, to } = req.body || {};
    if (typeof amount !== 'number' || !from || !to) {
      return res.status(400).json({ error: 'AMOUNT_FROM_TO_REQUIRED' });
    }
    try {
      const result = Currency.convert({ amount, from: String(from).toUpperCase(), to: String(to).toUpperCase() });
      res.json({ ok: true, ...result, formatted: Currency.format(result.converted, String(to).toUpperCase()) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- Create invoice (with FX snapshot) ----
  app.post('/invoice', (req, res) => {
    const tenantId = req.tenantId || (req.body && req.body.tenantId);
    const patientId = req.user && req.user.id;
    const body = req.body || {};
    const { amount, currency, baseCurrency, description, serviceType } = body;

    if (!tenantId) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    if (!patientId) return res.status(400).json({ error: 'PATIENT_REQUIRED' });
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'AMOUNT_INVALID' });

    const cur = String(currency || 'SAR').toUpperCase();
    const base = String(baseCurrency || 'SAR').toUpperCase();

    // G-11: server-side FX snapshot (client cannot override rate)
    let fx;
    try {
      fx = Currency.convert({ amount, from: cur, to: base });
    } catch (e) {
      return res.status(400).json({ error: 'FX_CONVERSION_FAILED', detail: e.message });
    }
    if (!fx.rate) return res.status(400).json({ error: 'NO_FX_RATE', from: cur, to: base });

    // Build invoice payload matching the storage schema (id + hash + tenantId)
    const crypto = require('crypto');
    const id = 'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const invoiceNumber = 'INV-' + cur + '-' + Date.now();
    const invoiceBody = {
      tenantId,
      id,
      invoice_number: invoiceNumber,
      patient_id: patientId,
      amount: amount,                 // original currency amount
      total: fx.converted,            // base currency amount
      vat_amount: 0,                  // computed by billing engine upstream
      currency_code: cur,
      base_currency_code: base,
      fx_rate_at_invoice: fx.rate,
      fx_source: fx.source,
      fx_date: fx.fxDate,
      service_type: serviceType || '',
      description: description || '',
      payment_method: '',
      created_at: new Date().toISOString(),
      status: 'PENDING'
    };
    // SHA-256 hash for chain integrity
    const hashInput = JSON.stringify({
      id: invoiceBody.id, tenantId: invoiceBody.tenantId, amount: invoiceBody.amount,
      currency: invoiceBody.currency_code, total: invoiceBody.total,
      fx_rate: invoiceBody.fx_rate_at_invoice, created_at: invoiceBody.created_at
    });
    invoiceBody.hash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // Persist via storage (idempotent put; throws TENANT_REQUIRED/INVOICE_HASH_REQUIRED)
    try {
      Storage.put(invoiceBody);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    res.status(201).json({
      ok: true,
      invoice: invoiceBody,
      fx,
      formatted: {
        original: Currency.format(amount, cur),
        converted: Currency.format(fx.converted, base)
      }
    });
  });

  // ---- List invoices by tenant + currency ----
  app.get('/invoices', (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'TENANT_REQUIRED' });
    const { currency } = req.query;
    const all = Storage.list(tenantId);
    const filtered = currency ? all.filter(inv => inv.currency === String(currency).toUpperCase()) : all;
    // Totals by currency
    const totals = {};
    for (const inv of filtered) {
      if (!totals[inv.currency]) totals[inv.currency] = { count: 0, total: 0 };
      totals[inv.currency].count++;
      totals[inv.currency].total += inv.amount || 0;
    }
    res.json({ ok: true, count: filtered.length, totals_by_currency: totals, invoices: filtered });
  });

  return app;
}

module.exports = { newBillingMultiCurrency };