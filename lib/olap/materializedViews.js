// lib/olap/materializedViews.js
// P6 OLAP + Reporting — materialized view catalog.
// Pure JS, no npm install. Defines 5 pre-computed views used by the
// queryRunner + refresh scheduler. No PHI is stored in any aggregate
// (RAIL-12). Tenant scoping is enforced at the query layer (RAIL-5).
//
// Schema field types are hints for explain() + the synthetic data
// generator in queryRunner.js.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OlapMaterializedViews = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var VIEWS = {
    mv_daily_admissions: {
      description: 'Daily admission counts by department',
      descriptionAr: 'عدد الدخول اليومي حسب القسم',
      refresh: 'daily',
      grain: 'daily',
      schema: {
        agg_date: 'date',
        department: 'string',
        count: 'number',
        avg_los: 'number'
      }
    },
    mv_revenue_by_payer: {
      description: 'Revenue aggregated by payer',
      descriptionAr: 'الإيرادات حسب الجهة الدافعة',
      refresh: 'daily',
      grain: 'daily',
      schema: {
        agg_date: 'date',
        payer: 'string',
        currency: 'string',
        amount: 'number',
        count: 'number'
      }
    },
    mv_top_diagnoses: {
      description: 'Top ICD-10 diagnoses',
      descriptionAr: 'أكثر التشخيصات شيوعاً',
      refresh: 'weekly',
      grain: 'weekly',
      schema: {
        icd10: 'string',
        description: 'string',
        count: 'number',
        avg_los: 'number'
      }
    },
    mv_icu_occupancy: {
      description: 'ICU bed occupancy hourly',
      descriptionAr: 'إشغال أسرة العناية المركزة',
      refresh: 'hourly',
      grain: 'hourly',
      schema: {
        hour: 'timestamp',
        unit: 'string',
        occupied: 'number',
        available: 'number'
      }
    },
    mv_er_wait_times: {
      description: 'ER wait time by ESI level',
      descriptionAr: 'أوقات انتظار الطوارئ',
      refresh: 'hourly',
      grain: 'hourly',
      schema: {
        hour: 'timestamp',
        esi: 'number',
        avg_wait_min: 'number',
        p95_wait_min: 'number'
      }
    }
  };

  function list() {
    return Object.keys(VIEWS);
  }

  function get(name) {
    if (!name || typeof name !== 'string') return null;
    return Object.prototype.hasOwnProperty.call(VIEWS, name) ? VIEWS[name] : null;
  }

  function columnsFor(name) {
    var view = get(name);
    if (!view) return [];
    return Object.keys(view.schema);
  }

  // Explain-plan metadata: cheap, deterministic, no DB access.
  function explain(name) {
    var view = get(name);
    if (!view) {
      return { error: 'VIEW_NOT_FOUND', view: name };
    }
    return {
      view: name,
      description: view.description,
      refresh: view.refresh,
      grain: view.grain,
      columns: view.columns || columnsFor(name),
      cost_units: 10,
      uses_index: true,
      // Symbolic plan — the runner is mock; the shape mirrors a real
      // Postgres EXPLAIN so the consumer can rely on it.
      plan: [
        { op: 'Aggregate', strategy: 'hash', keys: Object.keys(view.schema).slice(0, 2) },
        { op: 'Scan', relation: name, index: 'idx_' + name + '_tenant_ts' }
      ],
      // No PHI in aggregates — RAIL-12.
      contains_phi: false
    };
  }

  return {
    VIEWS: VIEWS,
    list: list,
    get: get,
    columnsFor: columnsFor,
    explain: explain
  };
});
