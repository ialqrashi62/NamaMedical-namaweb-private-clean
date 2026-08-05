'use strict';
// lib/bi/dashboards.js
// P27 — curated starter dashboards (10) every new tenant gets on board.
// Each entry is a static descriptor: reportId, RLS roles, refresh cadence.
// Pure JS, no npm install.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Dashboards = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DASHBOARDS = Object.freeze([
    Object.freeze({
      id: 'exec-overview',
      name: 'Executive Overview',
      reportId: 'rpt-exec-overview',
      audience: ['admin', 'cmo', 'cfo'],
      refreshMin: 60,
      kpis: ['admissions', 'discharges', 'alos', 'bed-occupancy'],
      rlsRoles: ['TenantExec'],
    }),
    Object.freeze({
      id: 'admissions-by-dept',
      name: 'Daily Admissions by Dept',
      reportId: 'rpt-admissions-dept',
      audience: ['admin', 'doctor', 'nurse'],
      refreshMin: 30,
      kpis: ['admissions-24h', 'admissions-mtd', 'dept-mix'],
      rlsRoles: ['TenantClinician'],
    }),
    Object.freeze({
      id: 'revenue-cycle',
      name: 'Revenue Cycle KPIs',
      reportId: 'rpt-revenue-cycle',
      audience: ['admin', 'cfo', 'finance'],
      refreshMin: 60,
      kpis: ['dnr-days', 'clean-claim-rate', 'ar-over-90', 'cash-collection'],
      rlsRoles: ['TenantFinance'],
    }),
    Object.freeze({
      id: 'er-wait-times',
      name: 'ER Wait Times',
      reportId: 'rpt-er-wait',
      audience: ['admin', 'er-doctor', 'nurse'],
      refreshMin: 5,
      kpis: ['door-to-doc', 'lwbs-rate', 'esi-mix'],
      rlsRoles: ['TenantER'],
    }),
    Object.freeze({
      id: 'icu-occupancy',
      name: 'ICU Occupancy',
      reportId: 'rpt-icu-occupancy',
      audience: ['admin', 'icu-doctor', 'nurse'],
      refreshMin: 10,
      kpis: ['occupied-beds', 'vent-utilization', 'apache-mean'],
      rlsRoles: ['TenantICU'],
    }),
    Object.freeze({
      id: 'surgical-outcomes',
      name: 'Surgical Outcomes',
      reportId: 'rpt-surgical-outcomes',
      audience: ['admin', 'surgeon', 'anesthesiologist'],
      refreshMin: 60,
      kpis: ['case-volume', 'ssi-rate', 'readmit-30d'],
      rlsRoles: ['TenantSurgery'],
    }),
    Object.freeze({
      id: 'pharmacy-throughput',
      name: 'Pharmacy Throughput',
      reportId: 'rpt-pharma-throughput',
      audience: ['admin', 'pharmacist'],
      refreshMin: 15,
      kpis: ['rx-verified', 'dispense-time', 'bcma-rate'],
      rlsRoles: ['TenantPharmacy'],
    }),
    Object.freeze({
      id: 'lab-tat',
      name: 'Lab TAT',
      reportId: 'rpt-lab-tat',
      audience: ['admin', 'lab-tech', 'doctor'],
      refreshMin: 15,
      kpis: ['tat-stat', 'tat-routine', 'critical-values-mtd'],
      rlsRoles: ['TenantLab'],
    }),
    Object.freeze({
      id: 'patient-satisfaction',
      name: 'Patient Satisfaction',
      reportId: 'rpt-px-sat',
      audience: ['admin', 'cno'],
      refreshMin: 1440,
      kpis: ['nps', 'complaints', 'praise-rate'],
      rlsRoles: ['TenantExperience'],
    }),
    Object.freeze({
      id: 'provider-productivity',
      name: 'Provider Productivity',
      reportId: 'rpt-provider-prod',
      audience: ['admin', 'cmo'],
      refreshMin: 60,
      kpis: ['rvu-per-fte', 'encounter-load', 'note-completion'],
      rlsRoles: ['TenantOps'],
    }),
  ]);

  function list({ tenantId } = {}) {
    return {
      ok: true,
      tenantId: tenantId ? String(tenantId) : null,
      dashboards: DASHBOARDS.slice(),
    };
  }

  function findById(id) {
    for (let i = 0; i < DASHBOARDS.length; i++) {
      if (DASHBOARDS[i].id === id) return DASHBOARDS[i];
    }
    return null;
  }

  function get({ id, tenantId } = {}) {
    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'FIELD_REQUIRED', msg: 'id is required' };
    }
    const d = findById(id);
    if (!d) return { ok: false, error: 'NOT_FOUND', msg: 'Unknown dashboard ' + id };
    return {
      ok: true,
      tenantId: tenantId ? String(tenantId) : null,
      dashboard: d,
    };
  }

  return {
    DASHBOARDS: DASHBOARDS,
    list: list,
    findById: findById,
    get: get,
  };
});
