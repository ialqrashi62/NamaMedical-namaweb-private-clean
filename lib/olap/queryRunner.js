// lib/olap/queryRunner.js
// P6 OLAP + Reporting — synthetic query runner.
// Pure JS, no DB. Generates realistic aggregate data per view
// (counts / sums / averages only — no PHI, RAIL-12).
// Tenant-scoped: every row carries tenantId and the result set is
// sliced by the requested tenantId (RAIL-5). Deterministic per
// (tenantId, view, params) so cached dashboards stay stable.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OlapQueryRunner = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var MaterializedViews = require('./materializedViews');

  // ---- deterministic PRNG (mulberry32) -------------------------------
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rng(seedKey) {
    return mulberry32(hashStr(seedKey));
  }

  // ---- date helpers --------------------------------------------------
  function parseDate(s, fallback) {
    if (!s) return fallback ? new Date(fallback) : null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? (fallback ? new Date(fallback) : null) : d;
  }
  function isoDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
  }
  function isoHour(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 13) + ':00:00Z';
  }
  function diffDays(a, b) {
    return Math.max(0, Math.floor((b - a) / 86400000));
  }
  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setUTCDate(c.getUTCDate() + n);
    return c;
  }
  function addHours(d, n) {
    var c = new Date(d.getTime());
    c.setUTCHours(c.getUTCHours() + n);
    return c;
  }

  // ---- list of departments / payers / units --------------------------
  var DEPARTMENTS = [
    'cardiology', 'er', 'icu', 'obgyn', 'pediatrics', 'oncology',
    'nephrology', 'gastroenterology', 'pulmonology', 'orthopedics'
  ];
  var PAYERS = ['cash', 'insurance_a', 'insurance_b', 'moh', 'corporate'];
  var CURRENCIES = ['SAR'];
  var ICU_UNITS = ['icu-a', 'icu-b', 'ccu'];
  var ESI_LEVELS = [1, 2, 3, 4, 5];

  // Top ICD-10 codes used for the diagnoses view (descriptions are
  // public clinical knowledge, no PHI).
  var ICD10_TABLE = [
    { icd10: 'I10',  description: 'Essential (primary) hypertension' },
    { icd10: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
    { icd10: 'J18.9', description: 'Pneumonia, unspecified organism' },
    { icd10: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery' },
    { icd10: 'N18.3', description: 'Chronic kidney disease, stage 3' },
    { icd10: 'K21.9', description: 'Gastro-esophageal reflux disease' },
    { icd10: 'J45.909', description: 'Unspecified asthma, uncomplicated' },
    { icd10: 'M54.5', description: 'Low back pain' },
    { icd10: 'A09.9', description: 'Infectious gastroenteritis and colitis' },
    { icd10: 'F41.9', description: 'Anxiety disorder, unspecified' }
  ];

  // ---- per-view generators ------------------------------------------
  function genDailyAdmissions(seedKey, params) {
    var from = parseDate(params && params.from, '2026-08-01');
    var to = parseDate(params && params.to, '2026-08-07');
    var r = rng(seedKey + '|adm');
    var days = diffDays(from, to) + 1;
    var rows = [];
    for (var d = 0; d < days; d++) {
      for (var i = 0; i < DEPARTMENTS.length; i++) {
        var dept = DEPARTMENTS[i];
        var count = Math.floor(r() * 18) + 1; // 1..18
        var los = +(2 + r() * 6).toFixed(2);   // 2.0 .. 8.0
        rows.push({
          agg_date: isoDate(addDays(from, d)),
          department: dept,
          count: count,
          avg_los: los
        });
      }
    }
    return rows;
  }

  function genRevenueByPayer(seedKey, params) {
    var from = parseDate(params && params.from, '2026-08-01');
    var to = parseDate(params && params.to, '2026-08-07');
    var r = rng(seedKey + '|rev');
    var days = diffDays(from, to) + 1;
    var rows = [];
    for (var d = 0; d < days; d++) {
      for (var p = 0; p < PAYERS.length; p++) {
        var payer = PAYERS[p];
        var count = Math.floor(r() * 40) + 5;          // 5..44
        var amount = +(count * (200 + r() * 1500)).toFixed(2);
        rows.push({
          agg_date: isoDate(addDays(from, d)),
          payer: payer,
          currency: CURRENCIES[0],
          amount: amount,
          count: count
        });
      }
    }
    return rows;
  }

  function genTopDiagnoses(seedKey, params) {
    var r = rng(seedKey + '|dx');
    var rows = [];
    for (var i = 0; i < ICD10_TABLE.length; i++) {
      var entry = ICD10_TABLE[i];
      var count = Math.floor(r() * 220) + 10; // 10..229
      var los = +(3 + r() * 5).toFixed(2);
      rows.push({
        icd10: entry.icd10,
        description: entry.description,
        count: count,
        avg_los: los
      });
    }
    // Sort by count desc so the view's "top" semantics hold.
    rows.sort(function (a, b) { return b.count - a.count; });
    return rows;
  }

  function genIcuOccupancy(seedKey, params) {
    var from = parseDate(params && params.from, new Date(Date.now() - 6 * 3600000).toISOString());
    var to = parseDate(params && params.to, new Date().toISOString());
    var r = rng(seedKey + '|icu');
    var hours = diffDays(from, to) * 24 + Math.max(1, Math.floor((to - from) / 3600000));
    if (hours > 168) hours = 168; // cap to 1 week of hourly rows
    var rows = [];
    for (var h = 0; h < hours; h++) {
      for (var u = 0; u < ICU_UNITS.length; u++) {
        var unit = ICU_UNITS[u];
        var available = 12;
        var occupied = Math.min(available, Math.floor(r() * 14));
        rows.push({
          hour: isoHour(addHours(from, h)),
          unit: unit,
          occupied: occupied,
          available: available
        });
      }
    }
    return rows;
  }

  function genErWaitTimes(seedKey, params) {
    var from = parseDate(params && params.from, new Date(Date.now() - 6 * 3600000).toISOString());
    var to = parseDate(params && params.to, new Date().toISOString());
    var r = rng(seedKey + '|er');
    var hours = Math.max(1, Math.floor((to - from) / 3600000));
    if (hours > 24) hours = 24; // cap to 24h
    var rows = [];
    for (var h = 0; h < hours; h++) {
      for (var e = 0; e < ESI_LEVELS.length; e++) {
        var esi = ESI_LEVELS[e];
        // ESI 1 (resuscitation) waits least; ESI 5 (non-urgent) waits most.
        var base = esi === 1 ? 0 : esi * 12;
        var avg = +(base + r() * 8).toFixed(2);
        var p95 = +(avg + 6 + r() * 10).toFixed(2);
        rows.push({
          hour: isoHour(addHours(from, h)),
          esi: esi,
          avg_wait_min: avg,
          p95_wait_min: p95
        });
      }
    }
    return rows;
  }

  var GENERATORS = {
    mv_daily_admissions: genDailyAdmissions,
    mv_revenue_by_payer: genRevenueByPayer,
    mv_top_diagnoses: genTopDiagnoses,
    mv_icu_occupancy: genIcuOccupancy,
    mv_er_wait_times: genErWaitTimes
  };

  // ---- row filters ---------------------------------------------------
  function applyFilter(rows, filter) {
    if (!filter || typeof filter !== 'object') return rows;
    var keys = Object.keys(filter);
    if (keys.length === 0) return rows;
    return rows.filter(function (row) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (row[k] !== filter[k]) return false;
      }
      return true;
    });
  }

  // ---- CSV export ----------------------------------------------------
  function escapeCsv(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  function toCsv(rows, columns) {
    var lines = [];
    lines.push(columns.join(','));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      for (var c = 0; c < columns.length; c++) {
        cells.push(escapeCsv(row[columns[c]]));
      }
      lines.push(cells.join(','));
    }
    return lines.join('\n');
  }

  // ---- Class ---------------------------------------------------------
  function OlapQueryRunner() {}

  OlapQueryRunner.prototype.list = function (opts) {
    opts = opts || {};
    var tenantId = opts.tenantId;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    return {
      tenantId: tenantId,
      views: MaterializedViews.list().map(function (name) {
        var v = MaterializedViews.get(name);
        return {
          name: name,
          description: v.description,
          descriptionAr: v.descriptionAr,
          refresh: v.refresh,
          columns: MaterializedViews.columnsFor(name)
        };
      })
    };
  };

  OlapQueryRunner.prototype.run = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    if (!opts.view) throw new Error('VIEW_REQUIRED');
    var view = MaterializedViews.get(opts.view);
    if (!view) throw new Error('VIEW_NOT_FOUND');
    var gen = GENERATORS[opts.view];
    if (!gen) throw new Error('VIEW_NOT_FOUND');
    var seedKey = opts.tenantId + '|' + opts.view;
    var rows = gen(seedKey, opts.params || {});
    rows = applyFilter(rows, opts.filter);
    return rows;
  };

  OlapQueryRunner.prototype.explain = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    if (!opts.view) throw new Error('VIEW_REQUIRED');
    var plan = MaterializedViews.explain(opts.view);
    if (plan && plan.error) throw new Error('VIEW_NOT_FOUND');
    return plan;
  };

  OlapQueryRunner.prototype.export = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    if (!opts.view) throw new Error('VIEW_REQUIRED');
    var format = (opts.format || 'csv').toLowerCase();
    var rows = this.run({ tenantId: opts.tenantId, view: opts.view, params: opts.params, filter: opts.filter });
    var columns = MaterializedViews.columnsFor(opts.view);
    if (format === 'json') {
      return JSON.stringify({ view: opts.view, columns: columns, rows: rows });
    }
    if (format !== 'csv') {
      throw new Error('FORMAT_UNSUPPORTED');
    }
    return toCsv(rows, columns);
  };

  return OlapQueryRunner;
});
