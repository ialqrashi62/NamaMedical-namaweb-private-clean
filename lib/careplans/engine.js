// lib/careplans/engine.js
// Care-plan + order-set orchestration. Apply a bundle to a patient,
// track per-item progress, compute adherence, list active plans.
// Tenant-scoped (RAIL-5) — tenantId is REQUIRED on every public method.
// Each item completion is appended to a hash-chained audit log
// (RAIL-10). Default actor gate: doctor / nurse (the route layer
// enforces, but the engine double-checks for defense-in-depth).

'use strict';

const ORDER_SETS = require('./orderSets');
const storageMod = require('./storage');

const ALLOWED_ACTORS = ['doctor', 'nurse'];
const TERMINAL_ITEM_STATUSES = ['completed', 'skipped'];

function CarePlanEngine(opts) {
  const storage = (opts && opts.storage) || storageMod.shared();
  const allowedActors = (opts && Array.isArray(opts.allowedActors))
    ? opts.allowedActors : ALLOWED_ACTORS;

  // ---- internal helpers -------------------------------------------------

  function _ensureTenant(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('TENANT_REQUIRED');
    }
  }

  function _ensureActor(actorId, actorRoles) {
    if (!actorId) throw new Error('ACTOR_REQUIRED');
    if (!Array.isArray(actorRoles) || actorRoles.length === 0) {
      throw new Error('ROLE_REQUIRED');
    }
    let ok = false;
    for (let i = 0; i < actorRoles.length; i++) {
      if (allowedActors.indexOf(actorRoles[i]) !== -1) { ok = true; break; }
    }
    if (!ok) throw new Error('ROLE_REQUIRED');
  }

  function _normalizeItem(template) {
    // Each item gets a stable status + an attached timeWindow (if not
    // already present from the bundle). Status defaults to 'pending'.
    return {
      code: template.code,
      type: template.type || null,
      priority: template.priority || null,
      timeWindow: template.timeWindow || null,
      dose: template.dose || null,
      route: template.route || null,
      freq: template.freq || null,
      conditional: template.conditional || null,
      status: 'pending',
      completedAt: null,
      completedBy: null,
      note: null
    };
  }

  // ---- public API -------------------------------------------------------

  function apply(args) {
    args = args || {};
    _ensureTenant(args.tenantId);
    _ensureActor(args.actorId, args.actorRoles || (args.user && args.user.roles));
    if (!args.patientId) throw new Error('PATIENT_REQUIRED');
    if (!args.setId) throw new Error('SET_ID_REQUIRED');

    const set = ORDER_SETS.get(args.setId);
    if (!set) throw new Error('ORDER_SET_UNKNOWN');

    const planId = storage._genPlanId();
    const startedAt = storage._nowIso();

    const items = (set.items || []).map(_normalizeItem);

    const plan = {
      planId: planId,
      tenantId: args.tenantId,
      patientId: args.patientId,
      setId: set.id,
      setName: set.name,
      setNameAr: set.nameAr,
      timeCritical: set.timeCritical || null,
      status: 'active',
      startedAt: startedAt,
      appliedBy: args.actorId,
      items: items,
      chain: [],
      genesisHash: '',
      lastChainHash: ''
    };

    // Genesis chain entry — unique hash for the act of "applying" the
    // bundle, anchored to (tenant, plan, set, actor, ts).
    storage.appendChain(plan, {
      itemCode: '__plan_apply__',
      status: 'applied',
      actorId: args.actorId,
      ts: startedAt,
      note: 'Applied bundle ' + set.id
    });

    storage.save(plan);
    return {
      planId: plan.planId,
      tenantId: plan.tenantId,
      patientId: plan.patientId,
      setId: plan.setId,
      setName: plan.setName,
      setNameAr: plan.setNameAr,
      timeCritical: plan.timeCritical,
      status: plan.status,
      startedAt: plan.startedAt,
      appliedBy: plan.appliedBy,
      items: items.map(function (i) {
        return {
          code: i.code,
          status: i.status,
          timeWindow: i.timeWindow,
          priority: i.priority
        };
      }),
      chainHead: plan.lastChainHash
    };
  }

  function progress(args) {
    args = args || {};
    _ensureTenant(args.tenantId);
    if (!args.planId) throw new Error('PLAN_ID_REQUIRED');
    if (!args.itemCode) throw new Error('ITEM_CODE_REQUIRED');
    if (!args.status) throw new Error('STATUS_REQUIRED');
    if (TERMINAL_ITEM_STATUSES.indexOf(args.status) === -1) {
      throw new Error('STATUS_INVALID');
    }
    _ensureActor(args.actorId, args.actorRoles || (args.user && args.user.roles));

    const plan = storage.find(args.planId);
    if (!plan) throw new Error('PLAN_NOT_FOUND');
    if (plan.tenantId !== args.tenantId) throw new Error('TENANT_SCOPE_MISMATCH');
    if (plan.status !== 'active') throw new Error('PLAN_INACTIVE');

    let target = null;
    for (let i = 0; i < plan.items.length; i++) {
      if (plan.items[i].code === args.itemCode) {
        target = plan.items[i];
        break;
      }
    }
    if (!target) throw new Error('ITEM_NOT_FOUND');

    target.status = args.status;
    target.completedAt = storage._nowIso();
    target.completedBy = args.actorId;
    target.note = args.note || null;

    storage.appendChain(plan, {
      itemCode: target.code,
      status: target.status,
      actorId: args.actorId,
      ts: target.completedAt,
      note: target.note
    });

    // If every item is terminal, close the plan.
    let allDone = true;
    for (let i = 0; i < plan.items.length; i++) {
      if (TERMINAL_ITEM_STATUSES.indexOf(plan.items[i].status) === -1) {
        allDone = false;
        break;
      }
    }
    if (allDone) {
      plan.status = 'completed';
      plan.completedAt = target.completedAt;
      storage.appendChain(plan, {
        itemCode: '__plan_close__',
        status: 'completed',
        actorId: args.actorId,
        ts: plan.completedAt,
        note: 'All items terminal'
      });
    }
    storage.save(plan);

    return {
      planId: plan.planId,
      itemCode: target.code,
      status: target.status,
      completedAt: target.completedAt,
      completedBy: target.completedBy,
      planStatus: plan.status,
      chainHead: plan.lastChainHash
    };
  }

  function adherence(args) {
    args = args || {};
    _ensureTenant(args.tenantId);
    if (!args.planId) throw new Error('PLAN_ID_REQUIRED');
    const plan = storage.find(args.planId);
    if (!plan) throw new Error('PLAN_NOT_FOUND');
    if (plan.tenantId !== args.tenantId) throw new Error('TENANT_SCOPE_MISMATCH');

    const stats = storage._stats(plan);
    // Adherence = completed / total (skipped does not count toward or
    // against the numerator), expressed as 0..100 rounded to 1 decimal.
    const denom = stats.total || 1;
    const pct = Math.round((stats.completed / denom) * 1000) / 10;
    return {
      planId: plan.planId,
      tenantId: plan.tenantId,
      patientId: plan.patientId,
      setId: plan.setId,
      planStatus: plan.status,
      stats: stats,
      adherencePct: pct,
      chainHead: plan.lastChainHash,
      chainLength: (plan.chain || []).length
    };
  }

  function list(args) {
    args = args || {};
    _ensureTenant(args.tenantId);
    const active = storage.listActive(args.tenantId);
    return {
      tenantId: args.tenantId,
      count: active.length,
      plans: active.map(function (p) {
        const stats = storage._stats(p);
        return {
          planId: p.planId,
          patientId: p.patientId,
          setId: p.setId,
          setName: p.setName,
          setNameAr: p.setNameAr,
          status: p.status,
          startedAt: p.startedAt,
          appliedBy: p.appliedBy,
          stats: stats,
          chainHead: p.lastChainHash
        };
      })
    };
  }

  // Expose ORDER_SETS read-only — routes may want to list available sets.
  function bundle(setId) {
    return setId ? ORDER_SETS.get(setId) : ORDER_SETS.ORDER_SETS;
  }

  return {
    apply: apply,
    progress: progress,
    adherence: adherence,
    list: list,
    bundle: bundle,
    allowedActors: allowedActors
  };
}

module.exports = CarePlanEngine;
