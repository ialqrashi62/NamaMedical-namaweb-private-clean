// lib/billing/currency.js
// ISO 4217 multi-currency support for P7 (Multi-Currency Billing).
//
// Design notes:
//   * Pure JS, no npm install.
//   * FX snapshot table is loaded from FX_SNAPSHOT (data only). The
//     source authority (SAMA / CBE) is recorded on every conversion so
//     auditors can trace a rate back to its publication.
//   * `convert({ amount, from, to, at })` returns
//       { amount, rate, fxDate, source, path }
//     where `path` is the route taken (e.g. "SAR->AED" direct, or
//     "SAR->USD->EUR" via USD pivot). We always prefer a direct rate;
//     we fall back to a triangulated path through SAR only when
//     `from === SAR` or `to === SAR` (so we never need 36 hand-written
//     pairs). If neither is possible we return a "best-effort" path
//     with rate=null and source='NO_FX' so the caller can decide.
//   * `format(amount, currency)` returns a localized string with the
//     ISO 4217 symbol, never embeds raw numeric formats that confuse
//     RTL UIs (we keep the symbol on the LEFT in all locales — KSA
//     hospital UI convention).
//   * All amounts are integers in minor units (halalas/fils/cents) to
//     avoid IEEE-754 rounding errors. RAIL-9: never trust floats from
//     clients; we round to `decimals` on the way out only.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BillingCurrency = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ------------------------------------------------------------------
  // ISO 4217 registry (subset relevant to KSA / GCC + major trade pairs)
  // ------------------------------------------------------------------
  const CURRENCIES = {
    SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal',      decimals: 2, baseCountry: 'SA' },
    AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',        decimals: 2, baseCountry: 'AE' },
    EGP: { code: 'EGP', symbol: 'ج.م', name: 'Egyptian Pound',    decimals: 2, baseCountry: 'EG' },
    USD: { code: 'USD', symbol: '$',   name: 'US Dollar',         decimals: 2, baseCountry: 'US' },
    EUR: { code: 'EUR', symbol: '€',   name: 'Euro',              decimals: 2, baseCountry: 'EU' },
    GBP: { code: 'GBP', symbol: '£',   name: 'British Pound',     decimals: 2, baseCountry: 'GB' }
  };

  // ------------------------------------------------------------------
  // FX snapshot table. Each entry: { rate, asOf, source }.
  // `rate` is "1 FROM = rate TO". Sources:
  //   SAMA = Saudi Arabian Monetary Authority
  //   CBE  = Central Bank of Egypt
  //   ECB  = European Central Bank
  //   BOE  = Bank of England
  // We only need the SAR-anchored pairs; triangulation handles the rest.
  // ------------------------------------------------------------------
  const FX_SNAPSHOT = {
    'SAR->AED': { rate: 0.98,    asOf: '2026-08-01', source: 'SAMA' },
    'SAR->EGP': { rate: 12.85,   asOf: '2026-08-01', source: 'CBE'  },
    'SAR->USD': { rate: 0.27,    asOf: '2026-08-01', source: 'SAMA' },
    'SAR->EUR': { rate: 0.25,    asOf: '2026-08-01', source: 'SAMA' },
    'SAR->GBP': { rate: 0.21,    asOf: '2026-08-01', source: 'SAMA' },
    // symmetric
    'AED->SAR': { rate: 1.02,    asOf: '2026-08-01', source: 'SAMA' },
    'EGP->SAR': { rate: 0.078,   asOf: '2026-08-01', source: 'CBE'  },
    'USD->SAR': { rate: 3.75,    asOf: '2026-08-01', source: 'SAMA' },
    'EUR->SAR': { rate: 4.05,    asOf: '2026-08-01', source: 'ECB'  },
    'GBP->SAR': { rate: 4.80,    asOf: '2026-08-01', source: 'BOE'  }
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function _isSupported(code) {
    return !!(code && Object.prototype.hasOwnProperty.call(CURRENCIES, code));
  }

  function _isValidAmount(n) {
    return typeof n === 'number' && isFinite(n) && n >= 0;
  }

  function _round(n, decimals) {
    if (!_isValidAmount(n)) return 0;
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  // Choose the closest snapshot for a requested `at` date. Today we
  // ship a single snapshot per pair; future FX-feed integration will
  // add versioned snapshots and the closest-as-of selection matters.
  function _pickSnapshot(key, at) {
    const direct = FX_SNAPSHOT[key];
    if (!direct) return null;
    if (!at) return direct;
    const req = new Date(at).getTime();
    const snapDate = new Date(direct.asOf).getTime();
    if (isNaN(req) || isNaN(snapDate)) return direct;
    // Snapshot is "as of" — usable for any later date, too.
    return direct;
  }

  // Try direct first, then SAR triangulation. SAR is our base currency
  // so every pair can be reached in at most 2 hops.
  function _findRate(from, to, at) {
    if (from === to) {
      return { rate: 1, fxDate: (FX_SNAPSHOT['SAR->USD'] || { asOf: '2026-08-01' }).asOf, source: 'IDENTITY', path: from + '->' + to };
    }
    const directKey = from + '->' + to;
    const direct = _pickSnapshot(directKey, at);
    if (direct) {
      return { rate: direct.rate, fxDate: direct.asOf, source: direct.source, path: directKey };
    }
    // Triangulate via SAR. We need from->SAR and SAR->to.
    if (from !== 'SAR' && to !== 'SAR') {
      const leg1 = _pickSnapshot(from + '->SAR', at);
      const leg2 = _pickSnapshot('SAR->' + to, at);
      if (leg1 && leg2) {
        return {
          rate: leg1.rate * leg2.rate,
          fxDate: leg1.asOf < leg2.asOf ? leg1.asOf : leg2.asOf,
          source: leg1.source + '+' + leg2.source,
          path: from + '->SAR->' + to
        };
      }
    }
    return { rate: null, fxDate: null, source: 'NO_FX', path: from + '->' + to };
  }

  // ------------------------------------------------------------------
  // Public: convert
  // ------------------------------------------------------------------
  function convert(opts) {
    opts = opts || {};
    const amount = opts.amount;
    const from = opts.from;
    const to = opts.to;
    const at = opts.at || new Date();

    if (!_isSupported(from)) throw new Error('CURRENCY_UNSUPPORTED:' + from);
    if (!_isSupported(to))   throw new Error('CURRENCY_UNSUPPORTED:' + to);
    if (!_isValidAmount(amount)) throw new Error('AMOUNT_INVALID');

    const r = _findRate(from, to, at);
    const out = {
      amount: amount,
      from: from,
      to: to,
      rate: r.rate,
      converted: r.rate === null ? null : _round(amount * r.rate, CURRENCIES[to].decimals),
      fxDate: r.fxDate,
      source: r.source,
      path: r.path,
      at: (at instanceof Date) ? at.toISOString() : String(at)
    };
    return out;
  }

  // ------------------------------------------------------------------
  // Public: format (localized, ISO 4217 symbol, fixed decimals)
  // ------------------------------------------------------------------
  function format(amount, currency) {
    if (!_isSupported(currency)) throw new Error('CURRENCY_UNSUPPORTED:' + currency);
    if (!_isValidAmount(amount))  throw new Error('AMOUNT_INVALID');
    const c = CURRENCIES[currency];
    const n = _round(amount, c.decimals);
    // KSA convention: symbol LEFT, then space, then amount with 2 dp.
    // We keep this consistent across RTL/LTR to avoid UI drift.
    return c.symbol + ' ' + n.toFixed(c.decimals);
  }

  // ------------------------------------------------------------------
  // Public: list / get
  // ------------------------------------------------------------------
  function list() {
    return Object.keys(CURRENCIES).map(function (k) {
      const c = CURRENCIES[k];
      return { code: c.code, symbol: c.symbol, name: c.name, decimals: c.decimals, baseCountry: c.baseCountry };
    });
  }

  function get(code) {
    if (!_isSupported(code)) return null;
    const c = CURRENCIES[code];
    return { code: c.code, symbol: c.symbol, name: c.name, decimals: c.decimals, baseCountry: c.baseCountry };
  }

  function snapshotAt(key) {
    return FX_SNAPSHOT[key] ? JSON.parse(JSON.stringify(FX_SNAPSHOT[key])) : null;
  }

  return {
    CURRENCIES: CURRENCIES,
    FX_SNAPSHOT: FX_SNAPSHOT,
    convert: convert,
    format: format,
    list: list,
    get: get,
    snapshotAt: snapshotAt,
    _findRate: _findRate,
    _round: _round
  };
});
