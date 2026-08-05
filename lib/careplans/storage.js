// lib/careplans/storage.js
// In-memory plan storage, tenant-scoped, hash-chained audit per item
// completion (RAIL-10). NOT for production persistence — owns only the
// per-process state shape. A persistent backend would replicate the
// same interface (save / find / listActive / appendChain).
//
// Hash chain:
//   chain[i] = sha256( prevChain || tenantId || planId || itemCode ||
//                      status || actorId || timestamp || note )
// This gives tamper-evidence for the audit-trail requirement, and the
// "completed" chain head is included in every progress() / adherence()
// response so callers can verify locally.

'use strict';

const crypto = require('crypto');

function newStorage() {
  /** @type {Map<string, object>} planId -> plan */
  const plans = new Map();
  /** @type {Map<string, string>} tenantId -> planId[] */
  const byTenant = new Map();

  function _genPlanId() {
    // 24 hex chars, 96 bits — sufficient collision resistance for
    // single-process in-memory storage. NOT a UUID v4 — pure PRNG via
    // crypto.randomBytes for honesty about the scope.
    return 'cp_' + crypto.randomBytes(12).toString('hex');
  }

  function _nowIso() {
    return new Date().toISOString();
  }

  function _hashChain(prev, payload) {
    const h = crypto.createHash('sha256');
    h.update(String(prev || ''));
    h.update('|');
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  }

  function _tenantList(tenantId) {
    const key = String(tenantId);
    let arr = byTenant.get(key);
    if (!arr) {
      arr = [];
      byTenant.set(key, arr);
    }
    return arr;
  }

  function save(plan) {
    if (!plan || !plan.planId) throw new Error('STORAGE: plan.planId required');
    plans.set(plan.planId, plan);
    if (plan.tenantId) {
      const list = _tenantList(plan.tenantId);
      if (list.indexOf(plan.planId) === -1) list.push(plan.planId);
    }
    return plan;
  }

  function find(planId) {
    return plans.get(planId) || null;
  }

  function listActive(tenantId) {
    const ids = _tenantList(tenantId);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const p = plans.get(ids[i]);
      if (p && p.status !== 'completed' && p.status !== 'cancelled') {
        out.push(p);
      }
    }
    return out;
  }

  // Append a hash-chained audit entry to a plan. Pure data, no side-effects
  // on persistence beyond mutating the plan object.
  function appendChain(plan, entry) {
    if (!plan || !plan.planId) throw new Error('STORAGE: plan required');
    if (!entry || !entry.itemCode) throw new Error('STORAGE: entry.itemCode required');
    if (!plan.chain) plan.chain = [];
    const prev = plan.chain.length > 0
      ? plan.chain[plan.chain.length - 1].hash
      : (plan.genesisHash || '');
    const payload = {
      tenantId: plan.tenantId,
      planId: plan.planId,
      itemCode: entry.itemCode,
      status: entry.status,
      actorId: entry.actorId || null,
      ts: entry.ts || _nowIso(),
      note: entry.note || null
    };
    const hash = _hashChain(prev, payload);
    const rec = Object.assign({}, payload, { hash: hash, prev: prev });
    plan.chain.push(rec);
    if (!plan.genesisHash) plan.genesisHash = hash;
    plan.lastChainHash = hash;
    return rec;
  }

  function _stats(plan) {
    const total = (plan.items || []).length;
    let completed = 0, skipped = 0, pending = 0, overdue = 0;
    const now = Date.now();
    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i];
      if (it.status === 'completed') completed++;
      else if (it.status === 'skipped') skipped++;
      else {
        pending++;
        // crude overdue check: started + ISO-duration-ish
        if (plan.startedAt && it.timeWindow) {
          const winMin = _parseDurationMin(it.timeWindow);
          if (winMin && (now - new Date(plan.startedAt).getTime()) > winMin * 60000) {
            overdue++;
          }
        }
      }
    }
    return {
      total: total,
      completed: completed,
      skipped: skipped,
      pending: pending,
      overdue: overdue
    };
  }

  function _parseDurationMin(s) {
    if (!s || typeof s !== 'string') return 0;
    const m = /^\s*(\d+)\s*(min|h|d)\s*$/i.exec(s);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    if (m[2].toLowerCase() === 'min') return n;
    if (m[2].toLowerCase() === 'h') return n * 60;
    if (m[2].toLowerCase() === 'd') return n * 60 * 24;
    return 0;
  }

  return {
    save: save,
    find: find,
    listActive: listActive,
    appendChain: appendChain,
    _stats: _stats,           // exposed for engine.use
    _genPlanId: _genPlanId,
    _nowIso: _nowIso,
    _hashChain: _hashChain
  };
}

// Singleton-per-process (handy for route layer to share state).
let _singleton = null;
function shared() {
  if (!_singleton) _singleton = newStorage();
  return _singleton;
}

module.exports = {
  newStorage: newStorage,
  shared: shared
};
