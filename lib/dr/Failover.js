'use strict';
// lib/dr/failover.js
// P26 — orchestrates a planned (or reactive) failover between regions.
// Pure JS, no npm install. Every state transition is recorded in an
// in-memory history keyed by planId and tenantId.
//
// Compatibility: keeps the legacy `newFailover({ replica, onPromote })`
// factory that has been wired into existing scripts, and ADDS the new
// `FailoverController` class used by routes/dr.js.
//
// Class: FailoverController
//   detect({ region, checks })
//   plan({ fromRegion, toRegion })
//   execute({ planId, approvedBy, approvalToken, tenantId })
//   rollback({ planId, reason })
//   history({ tenantId })

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FailoverController = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const { REGIONS, failoverPlan } = require('./regions');

  function _now() { return Date.now(); }

  function _missingRegion(region) {
    return !region || !REGIONS[region];
  }

  // --------------------------------------------------------------------------
  // Legacy factory: promote-on-unhealthy. Preserved verbatim for compatibility
  // with existing callers (Failover.js tests, prior scripts).
  // --------------------------------------------------------------------------
  function newFailover({ replica, onPromote }) {
    let primary = true;
    function check({ primaryHealthy }) {
      if (primaryHealthy) return { promoted: false, primary };
      if (primary) {
        primary = false;
        replica.replay(replica.status().primary);
        onPromote && onPromote({ primary: false, lag: replica.lag() });
        return { promoted: true, primary: false };
      }
      return { promoted: false, primary };
    }
    function isPrimary() { return primary; }
    return { check, isPrimary, _replica: replica };
  }

  // --------------------------------------------------------------------------
  // P26 FailoverController — used by routes/dr.js.
  // --------------------------------------------------------------------------
  class FailoverController {
    constructor(opts) {
      opts = opts || {};
      this._replication = opts.replication || null;
      this._plans = Object.create(null);
      this._executions = Object.create(null);
      this._tenantHistory = Object.create(null);
    }

    detect({ region, checks } = {}) {
      if (_missingRegion(region)) {
        return { ok: false, error: 'REGION_NOT_FOUND', msg: 'Unknown region' };
      }
      const list = Array.isArray(checks) ? checks : [];
      if (list.length === 0) {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'checks must be a non-empty array' };
      }
      let failed = 0;
      let latencyMs = 0;
      for (var i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c || c.ok === false) failed++;
        if (c && typeof c.latencyMs === 'number') latencyMs += c.latencyMs;
      }
      const failedRatio = failed / list.length;
      const healthy = failedRatio < 0.5;
      let severity = 'ok';
      if (failedRatio >= 0.5 && failedRatio < 0.8) severity = 'degraded';
      if (failedRatio >= 0.8) severity = 'down';
      const result = {
        ok: true,
        region: region,
        healthy: healthy,
        severity: severity,
        failedChecks: failed,
        totalChecks: list.length,
        latencyMsAvg: list.length ? Math.round(latencyMs / list.length) : 0,
        ts: _now(),
        recommendation: healthy ? 'monitor' : 'consider-failover',
      };
      if (this._replication && typeof this._replication.status === 'function') {
        result.replication = this._replication.status({ region: region });
      }
      return result;
    }

    plan({ fromRegion, toRegion } = {}) {
      const fp = failoverPlan({ fromRegion: fromRegion, toRegion: toRegion });
      if (!fp.ok) return fp;
      const stored = {
        planId: fp.planId,
        fromRegion: fp.from,
        toRegion: fp.to,
        expectedRpoSec: fp.expectedRpoSec,
        expectedRtoSec: fp.expectedRtoSec,
        steps: fp.steps,
        createdAt: _now(),
        status: 'planned',
      };
      this._plans[stored.planId] = stored;
      return { ok: true, plan: stored };
    }

    execute({ planId, approvedBy, approvalToken, tenantId } = {}) {
      if (!planId || !this._plans[planId]) {
        return { ok: false, error: 'PLAN_NOT_FOUND', msg: 'Unknown planId' };
      }
      if (!approvedBy || typeof approvedBy !== 'string') {
        return { ok: false, error: 'APPROVAL_REQUIRED', msg: 'approvedBy is required' };
      }
      if (!approvalToken || typeof approvalToken !== 'string') {
        return { ok: false, error: 'APPROVAL_TOKEN_REQUIRED', msg: 'approvalToken is required' };
      }
      const plan = this._plans[planId];
      if (plan.status === 'executed') {
        return { ok: false, error: 'PLAN_ALREADY_EXECUTED', msg: 'Plan has already been executed' };
      }
      if (plan.status === 'rolled-back') {
        return { ok: false, error: 'PLAN_ROLLED_BACK', msg: 'Plan was rolled back' };
      }
      let promotion = null;
      if (this._replication && typeof this._replication.promote === 'function') {
        promotion = this._replication.promote({ region: plan.toRegion });
      }
      plan.status = 'executed';
      plan.executedAt = _now();
      plan.executedBy = approvedBy;
      plan.approvalToken = approvalToken;
      const execution = {
        planId: planId,
        fromRegion: plan.fromRegion,
        toRegion: plan.toRegion,
        approvedBy: approvedBy,
        approvalToken: approvalToken,
        tenantId: tenantId ? String(tenantId) : null,
        executedAt: plan.executedAt,
        promotion: promotion,
        auditHash: 'audit-' + Math.random().toString(36).slice(2, 10),
      };
      this._executions[planId] = execution;
      if (tenantId) {
        const tid = String(tenantId);
        if (!this._tenantHistory[tid]) this._tenantHistory[tid] = [];
        this._tenantHistory[tid].push({
          type: 'execute',
          planId: planId,
          fromRegion: plan.fromRegion,
          toRegion: plan.toRegion,
          approvedBy: approvedBy,
          ts: plan.executedAt,
        });
      }
      return { ok: true, execution: execution, plan: plan };
    }

    rollback({ planId, reason } = {}) {
      if (!planId || !this._plans[planId]) {
        return { ok: false, error: 'PLAN_NOT_FOUND', msg: 'Unknown planId' };
      }
      if (!reason || typeof reason !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'reason is required for rollback' };
      }
      const plan = this._plans[planId];
      if (plan.status !== 'executed') {
        return { ok: false, error: 'NOT_EXECUTED', msg: 'Only executed plans can be rolled back' };
      }
      plan.status = 'rolled-back';
      plan.rolledBackAt = _now();
      plan.rollbackReason = reason;
      const execution = this._executions[planId] || {};
      return { ok: true, plan: plan, previousExecution: execution };
    }

    history({ tenantId } = {}) {
      if (!tenantId) {
        return { ok: false, error: 'TENANT_REQUIRED' };
      }
      const tid = String(tenantId);
      const events = (this._tenantHistory[tid] || []).slice();
      return { ok: true, tenantId: tid, events: events };
    }
  }

  return {
    newFailover: newFailover,
    FailoverController: FailoverController,
  };
});

