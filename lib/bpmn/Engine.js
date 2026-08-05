// namaweb/lib/bpmn/Engine.js
// BPMN-lite token-saver engine. Pure JS, no npm install.
// Supports: start | end | task | gateway (XOR) | service
// SLA timers, tenant scoping (RAIL-5), hash-chained transitions (RAIL-10).
// Emit `sla:breach` on breach and call onSlaBreach handler.

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Flow registry
// ---------------------------------------------------------------------------
const flows = new Map();           // id -> flowDef
const tokens = new Map();          // caseId -> case handle
const handlers = new Map();        // eventName -> Set<fn>
const ENC = 'utf8';

function emit(evt, payload) {
  const set = handlers.get(evt);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (_) { /* swallow handler errors per RAIL-9 fail-open note */ }
  }
}

function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => handlers.get(evt).delete(fn);
}

// ---------------------------------------------------------------------------
// SLA parser: '5m' / '15m' / '90s' / '2h' -> ms (integer)
// ---------------------------------------------------------------------------
function parseSla(spec) {
  if (spec == null) return null;
  if (typeof spec === 'number') return spec;
  const m = String(spec).trim().match(/^(\d+)\s*(ms|s|m|h)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 'ms').toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's':  return n * 1000;
    case 'm':  return n * 60 * 1000;
    case 'h':  return n * 60 * 60 * 1000;
    default:   return null;
  }
}

// ---------------------------------------------------------------------------
// Hash chain — FIPS-180-4 SHA-256, includes previous hash (RAIL-10)
// ---------------------------------------------------------------------------
function sha256(s) {
  return crypto.createHash('sha256').update(s, ENC).digest('hex');
}
function chain(prev, record) {
  const prevHash = prev || 'GENESIS';
  const payload = JSON.stringify({ prevHash, record });
  return { prevHash, hash: sha256(payload), record };
}

// ---------------------------------------------------------------------------
// Case handle factory
// ---------------------------------------------------------------------------
function makeCase(flow, initial) {
  // Initial audit transition — anchored to the start event for traceability.
  const startNode = flow.nodes[flow.start];
  if (!startNode) throw new Error(`Flow ${flow.id}: start node "${flow.start}" missing`);

  const caseCtx = {
    id: initial.caseId || ('case_' + crypto.randomBytes(8).toString('hex')),
    flowId: flow.id,
    tenantId: initial.tenantId || null,
    patientId: initial.patientId || null,
    data: Object.assign({}, initial.data || {}),
    current: flow.start,
    assigned: Object.create(null),   // nodeId -> actor
    slaStartedAt: Object.create(null), // nodeId -> ms epoch
    slaDeadlineAt: Object.create(null),
    history: [],                     // [{prevHash, hash, record}]
    status: 'active',                // active | completed | escalated | aborted
    createdAt: Date.now(),
    onSlaBreach: flow.onSlaBreach || null,
  };

  // First chain entry: case creation anchored on start node.
  const first = chain('GENESIS', {
    kind: 'case.create',
    caseId: caseCtx.id,
    flowId: flow.id,
    node: flow.start,
    nodeType: startNode.type,
    tenantId: caseCtx.tenantId,
    patientId: caseCtx.patientId,
    ts: caseCtx.createdAt,
  });
  caseCtx.history.push(first);

  return caseCtx;
}

function appendHistory(caseCtx, record) {
  const prev = caseCtx.history.length
    ? caseCtx.history[caseCtx.history.length - 1].hash
    : null;
  const entry = chain(prev, Object.assign({ ts: Date.now(), caseId: caseCtx.id }, record));
  caseCtx.history.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Tick logic — advances one node and resolves the next.
// ---------------------------------------------------------------------------
async function tick(caseId) {
  const c = tokens.get(caseId);
  if (!c) throw new Error(`Unknown caseId: ${caseId}`);
  if (c.status !== 'active') {
    return { caseId: c.id, node: c.current, type: c.status, halted: true };
  }

  const flow = flows.get(c.flowId);
  const node = c.flow_id ? null : flow.nodes[c.current];
  const nodeDef = flow.nodes[c.current];
  if (!nodeDef) throw new Error(`Flow ${c.flowId}: node "${c.current}" missing`);

  // SLA breach check (only for task/service nodes with a known deadline).
  if (nodeDef.sla) {
    const ms = parseSla(nodeDef.sla);
    if (ms != null && c.slaDeadlineAt[c.current] != null) {
      const now = Date.now();
      if (now > c.slaDeadlineAt[c.current]) {
        const breach = { caseId: c.id, node: c.current, actor: nodeDef.actor, sla: nodeDef.sla };
        appendHistory(c, { kind: 'sla.breach', node: c.current, actor: nodeDef.actor, slaMs: ms });
        emit('sla:breach', breach);
        if (typeof c.onSlaBreach === 'function') {
          try { c.onSlaBreach(breach, c); } catch (_) {}
        }
        // mark case escalated — caller can restart() to resume.
        c.status = 'escalated';
        return Object.assign({ caseId: c.id }, breach, { halted: true, status: c.status });
      }
    }
  }

  // Append transition record.
  appendHistory(c, { kind: 'node.enter', node: c.current, type: nodeDef.type });

  // End node — terminate.
  if (nodeDef.type === 'end') {
    c.status = 'completed';
    appendHistory(c, { kind: 'case.complete', node: c.current });
    return { caseId: c.id, node: c.current, type: 'end', halted: true, status: c.status };
  }

  // Start node — fall through to .next; start does not consume SLA of itself.
  if (nodeDef.type === 'start') {
    if (!nodeDef.next) {
      c.status = 'completed';
      return { caseId: c.id, node: c.current, type: 'start', halted: true, status: c.status };
    }
    c.current = nodeDef.next;
  } else if (nodeDef.type === 'gateway') {
    // XOR gateway: branches = { conditionKey: nextNodeId }
    const branches = nodeDef.branches || {};
    let chosen = null;
    let chosenKey = null;
    // Resolution order:
    //   1. data[branchKey] matches a known branch
    //   2. next() function over data
    //   3. default branch ('default')
    if (c.data && c.data.gatewayChoice && branches[c.data.gatewayChoice]) {
      chosenKey = c.data.gatewayChoice;
      chosen = branches[chosenKey];
    } else if (typeof nodeDef.next === 'function') {
      chosenKey = nodeDef.next(c.data, branches) || 'default';
      chosen = branches[chosenKey] || branches.default || null;
    } else if (branches.default) {
      chosenKey = 'default';
      chosen = branches.default;
    }
    if (!chosen) {
      // Fail-closed: no safe branch.
      c.status = 'escalated';
      appendHistory(c, { kind: 'gateway.no_branch', node: c.current });
      return { caseId: c.id, node: c.current, type: 'gateway', halted: true, status: c.status };
    }
    appendHistory(c, { kind: 'gateway.choose', node: c.current, branch: chosenKey });
    c.current = chosen;
  } else {
    // task | service — apply SLA timer, advance to .next
    if (nodeDef.sla && c.slaDeadlineAt[c.current] == null) {
      const ms = parseSla(nodeDef.sla);
      if (ms != null) {
        c.slaStartedAt[c.current] = Date.now();
        c.slaDeadlineAt[c.current] = Date.now() + ms;
      }
    }
    if (!nodeDef.next) {
      // task with no explicit next defaults to end if defined, else halt.
      const fallback = flow.nodes.end ? 'end' : null;
      if (!fallback) {
        c.status = 'completed';
        return { caseId: c.id, node: c.current, type: nodeDef.type, halted: true, status: c.status };
      }
      c.current = fallback;
    } else if (typeof nodeDef.next === 'function') {
      c.current = nodeDef.next(c.data, flow.nodes) || c.current;
    } else {
      c.current = nodeDef.next;
    }
  }

  // Look up next node to start its SLA timer (for task/service).
  const nextDef = flow.nodes[c.current];
  if (nextDef && (nextDef.type === 'task' || nextDef.type === 'service') && nextDef.sla && c.slaDeadlineAt[c.current] == null) {
    const ms = parseSla(nextDef.sla);
    if (ms != null) {
      c.slaStartedAt[c.current] = Date.now();
      c.slaDeadlineAt[c.current] = Date.now() + ms;
    }
  }

  // Return the now-active node (post-advance). If it is a gateway, resolve it immediately.
  if (nextDef && nextDef.type === 'gateway') {
    return tick(c.id);
  }
  return {
    caseId: c.id,
    node: c.current,
    type: nextDef ? nextDef.type : null,
    actor: nextDef ? nextDef.actor : null,
    sla: nextDef ? nextDef.sla : null,
    halted: false,
    status: c.status,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const BPMN = {
  define(flow) {
    if (!flow || !flow.id) throw new Error('BPMN.define: id required');
    if (!flow.nodes || typeof flow.nodes !== 'object') throw new Error('BPMN.define: nodes required');
    if (!flow.start || !flow.nodes[flow.start]) throw new Error('BPMN.define: start node missing');
    flows.set(flow.id, flow);
    return flow.id;
  },

  start(flowId, initial = {}) {
    const flow = flows.get(flowId);
    if (!flow) throw new Error(`BPMN.start: unknown flow ${flowId}`);
    // Tenant scope guard (RAIL-5). Fail-closed: reject anonymous cross-tenant use.
    if (!initial.tenantId) {
      throw new Error('BPMN.start: tenantId required (RAIL-5)');
    }
    const c = makeCase(flow, initial);
    tokens.set(c.id, c);
    // Initialize SLA of the node immediately after start, if it has one.
    const firstReal = flow.nodes[flow.start];
    if (firstReal && firstReal.sla) {
      const ms = parseSla(firstReal.sla);
      if (ms != null) {
        c.slaStartedAt[flow.start] = Date.now();
        c.slaDeadlineAt[flow.start] = Date.now() + ms;
      }
    }
    return {
      id: c.id,
      flowId: c.flowId,
      current: c.current,
      status: c.status,
      assign(actor, name) {
        if (!actor || !name) throw new Error('assign: actor & name required');
        c.assigned[c.current] = { actor, name, at: Date.now() };
        appendHistory(c, { kind: 'node.assign', node: c.current, actor, name });
        return c.assigned[c.current];
      },
      tick() { return tick(c.id); },
      audit() { return c.history.slice(); },
      history: c.history,
      data: c.data,
      tenantId: c.tenantId,
      patientId: c.patientId,
    };
  },

  // Awaitable tick for async pipelines.
  tick(caseId) { return Promise.resolve(tick(caseId)); },

  assign(caseId, actor, name) {
    const c = tokens.get(caseId);
    if (!c) throw new Error(`Unknown caseId: ${caseId}`);
    c.assigned[c.current] = { actor, name, at: Date.now() };
    appendHistory(c, { kind: 'node.assign', node: c.current, actor, name });
    return c.assigned[c.current];
  },

  audit(caseId) {
    const c = tokens.get(caseId);
    if (!c) return [];
    return c.history.slice();
  },

  list() {
    return Array.from(tokens.values()).map(c => ({
      caseId: c.id,
      flowId: c.flowId,
      tenantId: c.tenantId,
      patientId: c.patientId,
      status: c.status,
      current: c.current,
    }));
  },

  // Exposed for tests / skill use:
  parseSla,
  on,
};

// Static helpers used internally + re-exported for tests.
BPMN._internal = { flows, tokens, emit, sha256, chain };

module.exports = { BPMN };
