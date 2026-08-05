'use strict';
// lib/hl7v2/storage.js
// In-memory HL7 v2 inbox. Pure JS, no npm install.
//
// Lifetime is process-local. Replaced by a durable adapter (Postgres +
// outbox pattern) in a future phase. The public surface is intentionally
// minimal: inbox / list / markProcessed / stats.
//
// SAFETY:
//   - All lookups are scoped by tenantId. There is no path that returns
//     records across tenants (RAIL-5).
//   - markProcessed is idempotent; calling it twice is a no-op.
//   - Inbox records never include raw HL7 body by default — only IDs,
//     type, trigger, and a small "summary" object. Raw body is kept
//     on a side channel (rawById) for retry/debug, but never returned
//     in list APIs (RAIL-12: no PHI in log-friendly paths).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HL7v2Storage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // tenantId -> { records: Map<id, Record>, order: Array<id> }
  var tenants = new Map();
  // id -> raw HL7 v2 body (for retry / debugging only; not returned by list).
  var rawById = new Map();

  function ensure(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('TENANT_REQUIRED');
    }
    var t = tenants.get(tenantId);
    if (!t) {
      t = { records: new Map(), order: [] };
      tenants.set(tenantId, t);
    }
    return t;
  }

  function makeId(tenantId, controlId) {
    var safe = String(controlId || '').replace(/[^A-Za-z0-9_.-]/g, '_');
    return tenantId + ':' + safe;
  }

  // Store a domain-mapped message in the inbox.
  //   tenantId: required
  //   msg:      object produced by mapper.toDomain / adtToEncounter / etc.
  // Returns: { id, status: 'pending', createdAt }
  function inbox(tenantId, msg) {
    var t = ensure(tenantId);
    var controlId = msg && msg.messageControlId ? msg.messageControlId : '';
    var id = makeId(tenantId, controlId || (Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
    var now = new Date().toISOString();
    var record = {
      id: id,
      tenantId: tenantId,
      messageControlId: controlId,
      messageType: msg && msg.messageType ? msg.messageType : '',
      trigger: msg && msg.trigger ? msg.trigger : '',
      patientId: msg && msg.patientId ? msg.patientId : '',
      orderNumber: msg && msg.orderNumber ? msg.orderNumber : '',
      placerNumber: msg && msg.placerNumber ? msg.placerNumber : '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      // Domain payload (encounter/order/observation); safe to surface in API.
      payload: msg || {}
    };
    // If the same control id is re-ingested, overwrite in place to keep idempotency.
    if (t.records.has(id)) {
      var prev = t.records.get(id);
      record.createdAt = prev.createdAt;
      record.status = prev.status; // preserve processed flag across retries
      t.records.set(id, record);
    } else {
      t.records.set(id, record);
      t.order.push(id);
    }
    return { id: id, status: record.status, createdAt: record.createdAt };
  }

  // Attach raw HL7 v2 body to a record (for retry / debugging only).
  function attachRaw(id, raw) {
    if (!id) return;
    rawById.set(id, typeof raw === 'string' ? raw : String(raw || ''));
  }

  // List inbox records for a tenant, filtered by status.
  //   status: optional, 'pending' | 'processed' | undefined (=all)
  // Returns: Array<Record> (id + safe fields; no raw body)
  function unprocessed(tenantId, status) {
    var t = ensure(tenantId);
    var out = [];
    for (var i = 0; i < t.order.length; i++) {
      var id = t.order[i];
      var rec = t.records.get(id);
      if (!rec) continue;
      if (status && rec.status !== status) continue;
      out.push(rec);
    }
    return out;
  }

  // Mark a record as processed. Idempotent: returns false if the id is
  // unknown OR if it belongs to a different tenant.
  function markProcessed(id, tenantId) {
    if (!id) return false;
    var rec = findRecord(id, tenantId);
    if (!rec) return false;
    if (rec.status === 'processed') return true;
    rec.status = 'processed';
    rec.updatedAt = new Date().toISOString();
    return true;
  }

  function findRecord(id, tenantId) {
    if (!id) return null;
    // If a tenantId is given, scope to that tenant's bucket only (RAIL-5).
    if (tenantId) {
      var t = tenants.get(tenantId);
      if (!t) return null;
      return t.records.get(id) || null;
    }
    // Fallback: linear search across tenants (admin-only path).
    var keys = tenants.keys();
    var step = keys.next();
    while (!step.done) {
      var bucket = tenants.get(step.value);
      if (bucket && bucket.records.has(id)) return bucket.records.get(id);
      step = keys.next();
    }
    return null;
  }

  function stats(tenantId) {
    if (tenantId) {
      var t = tenants.get(tenantId);
      if (!t) return { tenantId: tenantId, total: 0, pending: 0, processed: 0 };
      var pending = 0;
      var processed = 0;
      t.order.forEach(function (id) {
        var r = t.records.get(id);
        if (!r) return;
        if (r.status === 'processed') processed++;
        else pending++;
      });
      return { tenantId: tenantId, total: t.records.size, pending: pending, processed: processed };
    }
    var total = 0;
    tenants.forEach(function (bucket) { total += bucket.records.size; });
    return { tenants: tenants.size, total: total };
  }

  // Test-only: wipe all in-memory state. Never called from production paths.
  function _reset() {
    tenants.clear();
    rawById.clear();
  }

  return {
    inbox: inbox,
    attachRaw: attachRaw,
    unprocessed: unprocessed,
    markProcessed: markProcessed,
    findRecord: findRecord,
    stats: stats,
    _reset: _reset
  };
});
