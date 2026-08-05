'use strict';
// lib/dr/regions.js
// P26 — Multi-region disaster recovery topology.
// Pure JS, no npm install. Region descriptors are static + immutable.
// Each region declares RPO/RTO targets and replica fan-out for
// active/active or active/passive failover.
//
// Functions exported:
//   REGIONS        : canonical 4-region topology (sa-central, sa-south,
//                    me-central, eu-west). Loaded by replication.js and
//                    failover.js — single source of truth.
//   regions()      : deep clone (safe for callers to mutate).
//   activeActive({ tenantId, primary })
//                  : returns topology in active/active mode.
//   failoverPlan({ fromRegion, toRegion })
//                  : returns a 6-step plan for moving traffic.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DRRegions = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Canonical topology. sa-central-1 is the authoritative primary.
  const REGIONS = Object.freeze({
    'sa-central-1': Object.freeze({
      name: 'Riyadh',
      country: 'SA',
      primary: true,
      replica: Object.freeze(['sa-south-1', 'me-central-1']),
      // RPO 60s = at most 60s of committed PHI writes lost.
      rpoSec: 60,
      // RTO 300s = worst-case 5 min to bring replica online as new primary.
      rtoSec: 300,
      complianceZones: Object.freeze(['SA-NDH', 'PDPL-SA', 'CBAHI']),
    }),
    'sa-south-1': Object.freeze({
      name: 'Jeddah',
      country: 'SA',
      primary: false,
      replica: Object.freeze(['sa-central-1']),
      rpoSec: 120,
      rtoSec: 600,
      complianceZones: Object.freeze(['SA-NDH', 'PDPL-SA']),
    }),
    'me-central-1': Object.freeze({
      name: 'UAE-DXB',
      country: 'AE',
      primary: false,
      replica: Object.freeze(['sa-central-1']),
      rpoSec: 120,
      rtoSec: 600,
      complianceZones: Object.freeze(['UAE-DHA', 'PDPL-UAE']),
    }),
    'eu-west-1': Object.freeze({
      name: 'EU',
      country: 'IE',
      primary: false,
      replica: Object.freeze(['me-central-1']),
      rpoSec: 300,
      rtoSec: 1800,
      complianceZones: Object.freeze(['EU-GDPR', 'HIPAA']),
    }),
  });

  function _clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // Return a deep copy of all region descriptors.
  // Safe for callers to mutate; downstream views do not mutate the source.
  function regions() {
    return _clone(REGIONS);
  }

  // Build an active/active topology for a tenant: every region is alive
  // and read-traffic is dual-served. The `primary` argument is the
  // preferred write target; replicas are still receiving WAL in parallel.
  function activeActive({ tenantId, primary } = {}) {
    if (!tenantId) {
      return { ok: false, error: 'TENANT_REQUIRED' };
    }
    const tid = String(tenantId);
    const pref = primary && REGIONS[primary] ? primary : 'sa-central-1';
    const list = [];
    for (const code of Object.keys(REGIONS)) {
      const r = REGIONS[code];
      list.push({
        region: code,
        name: r.name,
        primary: code === pref,
        writeable: code === pref || (r.replica && r.replica.indexOf(pref) !== -1),
        replicas: (r.replica || []).slice(),
        rpoSec: r.rpoSec,
        rtoSec: r.rtoSec,
      });
    }
    return { ok: true, tenantId: tid, mode: 'active-active', regions: list };
  }

  // Generate a 6-step failover plan (RAIL-10: every step is auditable).
  function failoverPlan({ fromRegion, toRegion } = {}) {
    if (!fromRegion || !toRegion) {
      return { ok: false, error: 'FIELD_REQUIRED', msg: 'fromRegion and toRegion are required' };
    }
    if (!REGIONS[fromRegion]) {
      return { ok: false, error: 'REGION_NOT_FOUND', msg: 'Unknown source region ' + fromRegion };
    }
    if (!REGIONS[toRegion]) {
      return { ok: false, error: 'REGION_NOT_FOUND', msg: 'Unknown target region ' + toRegion };
    }
    if (fromRegion === toRegion) {
      return { ok: false, error: 'SAME_REGION', msg: 'Source and target must differ' };
    }
    const src = REGIONS[fromRegion];
    const dst = REGIONS[toRegion];
    return {
      ok: true,
      planId: 'dr-plan-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      from: fromRegion,
      to: toRegion,
      expectedRpoSec: src.rpoSec,
      expectedRtoSec: Math.max(src.rtoSec, dst.rtoSec),
      steps: [
        { n: 1, label: 'snapshot-primary',    action: 'Freeze primary writes (read-only mode)' },
        { n: 2, label: 'measure-lag',         action: 'Read lag from replication.status; abort if > src.rpoSec' },
        { n: 3, label: 'drain-replica',       action: 'Promote ' + toRegion + ' to writable primary' },
        { n: 4, label: 'switch-app-route',    action: 'Update connection pool to point at new primary' },
        { n: 5, label: 'verify-health',       action: 'Run synthetic checks: login + read one chart' },
        { n: 6, label: 'release-write-lock',  action: 'Resume normal writes; old primary is now a replica' },
      ],
    };
  }

  return {
    REGIONS: REGIONS,
    regions: regions,
    activeActive: activeActive,
    failoverPlan: failoverPlan,
  };
});
