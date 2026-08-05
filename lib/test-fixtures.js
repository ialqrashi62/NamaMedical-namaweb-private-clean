// lib/test-fixtures.js
// In-memory test fixture helpers for unit + integration tests.
// Pure JS, no npm install. All fixtures are tenant-scoped and audit-logged
// via a hash-chained journal. No real DB; reset on process restart.
//
// Usage (Node):
//   const F = require('./lib/test-fixtures');
//   F.setup({ tenantId: 'demo', users: ['patient','doctor','nurse'] });
//   const p = F.testPatient({ tenantId: 'demo', mrn: 'P-001', name: 'Ahmed' });
//   F.withTenantClient('demo', async (client) => { /* tenant-scoped reads */ });
//   F.cleanup({ tenantId: 'demo' });
//
// Usage (Browser, fallback):
//   window.TestFixtures.setup({ tenantId: 'demo' });
//   window.TestFixtures.testPatient({ tenantId: 'demo', mrn: 'P-001' });

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TestFixtures = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Tenant-scoped in-memory stores. { [tenantId]: { patients:[], doctors:[], ... } }
  var stores = Object.create(null);
  // Audit journal: { [tenantId]: [ { hash, prev, action, ... } ] }
  var auditJournal = Object.create(null);
  // Monotonic counters per tenant per kind for id generation.
  var idCounters = Object.create(null);

  // -------------------------- helpers --------------------------

  function nowIso() {
    return new Date().toISOString();
  }

  function requireTenantId(opts) {
    if (!opts || typeof opts.tenantId !== 'string' || opts.tenantId === '') {
      throw new Error('TENANT_REQUIRED: tenantId is required');
    }
  }

  function ensureTenant(tenantId, users) {
    if (!stores[tenantId]) {
      stores[tenantId] = {
        patients: [],
        doctors: [],
        nurses: [],
        encounters: [],
        orders: [],
        users: Array.isArray(users) ? users.slice() : []
      };
      auditJournal[tenantId] = [];
      idCounters[tenantId] = Object.create(null);
    } else if (Array.isArray(users)) {
      // Merge user roles idempotently.
      var existing = stores[tenantId].users;
      for (var i = 0; i < users.length; i++) {
        if (existing.indexOf(users[i]) === -1) {
          existing.push(users[i]);
        }
      }
    }
  }

  function nextId(tenantId, kind) {
    if (!idCounters[tenantId][kind]) {
      idCounters[tenantId][kind] = 0;
    }
    idCounters[tenantId][kind] += 1;
    return kind + '-' + tenantId + '-' + String(idCounters[tenantId][kind]);
  }

  // FNV-1a 32-bit hex hash for the audit chain. Deterministic + tamper-evident.
  function fnv1a(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function auditAppend(tenantId, action, payload) {
    var journal = auditJournal[tenantId];
    var prev = journal.length > 0 ? journal[journal.length - 1].hash : '00000000';
    var entry = {
      tenantId: tenantId,
      action: action,
      payload: payload || {},
      prev: prev,
      at: nowIso()
    };
    // Hash chains prev + action + canonical payload + at.
    var canonical =
      prev + '|' + action + '|' +
      JSON.stringify(entry.payload) + '|' + entry.at;
    entry.hash = fnv1a(canonical);
    journal.push(entry);
    return entry;
  }

  function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  // -------------------------- public API --------------------------

  function setup(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId, opts.users);
    auditAppend(opts.tenantId, 'setup', { users: stores[opts.tenantId].users.slice() });
    return { tenantId: opts.tenantId, ok: true };
  }

  function testPatient(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    var id = nextId(opts.tenantId, 'patient');
    var fixture = {
      id: id,
      tenantId: opts.tenantId,
      mrn: opts.mrn || 'MRN-' + id,
      name: opts.name || 'Patient ' + id,
      kind: 'patient',
      createdAt: nowIso()
    };
    stores[opts.tenantId].patients.push(fixture);
    auditAppend(opts.tenantId, 'create:patient', { id: id, mrn: fixture.mrn });
    return clone(fixture);
  }

  function testDoctor(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    var id = nextId(opts.tenantId, 'doctor');
    var fixture = {
      id: id,
      tenantId: opts.tenantId,
      specialty: opts.specialty || 'general',
      name: opts.name || 'Doctor ' + id,
      kind: 'doctor',
      createdAt: nowIso()
    };
    stores[opts.tenantId].doctors.push(fixture);
    auditAppend(opts.tenantId, 'create:doctor', { id: id, specialty: fixture.specialty });
    return clone(fixture);
  }

  function testNurse(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    var id = nextId(opts.tenantId, 'nurse');
    var fixture = {
      id: id,
      tenantId: opts.tenantId,
      ward: opts.ward || 'general',
      name: opts.name || 'Nurse ' + id,
      kind: 'nurse',
      createdAt: nowIso()
    };
    stores[opts.tenantId].nurses.push(fixture);
    auditAppend(opts.tenantId, 'create:nurse', { id: id, ward: fixture.ward });
    return clone(fixture);
  }

  function testEncounter(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    if (!opts.patientId) {
      throw new Error('PATIENT_REQUIRED: patientId is required for encounter');
    }
    var id = nextId(opts.tenantId, 'enc');
    var fixture = {
      id: id,
      tenantId: opts.tenantId,
      patientId: opts.patientId,
      kind: opts.kind || 'outpatient',
      status: 'open',
      createdAt: nowIso()
    };
    stores[opts.tenantId].encounters.push(fixture);
    auditAppend(opts.tenantId, 'create:encounter', {
      id: id, patientId: opts.patientId, kind: fixture.kind
    });
    return clone(fixture);
  }

  function testOrder(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    if (!opts.patientId) {
      throw new Error('PATIENT_REQUIRED: patientId is required for order');
    }
    var id = nextId(opts.tenantId, 'order');
    var fixture = {
      id: id,
      tenantId: opts.tenantId,
      patientId: opts.patientId,
      kind: opts.kind || 'med',
      status: 'pending',
      createdAt: nowIso()
    };
    stores[opts.tenantId].orders.push(fixture);
    auditAppend(opts.tenantId, 'create:order', {
      id: id, patientId: opts.patientId, kind: fixture.kind
    });
    return clone(fixture);
  }

  // Runs `fn(client)` with a tenant-scoped mock client. Async-safe; returns a Promise.
  function withTenantClient(tenantId, fn) {
    requireTenantId({ tenantId: tenantId });
    ensureTenant(tenantId);
    var bucket = stores[tenantId];
    var client = {
      tenantId: tenantId,
      listPatients: function () { return clone(bucket.patients); },
      listDoctors: function () { return clone(bucket.doctors); },
      listNurses: function () { return clone(bucket.nurses); },
      listEncounters: function () { return clone(bucket.encounters); },
      listOrders: function () { return clone(bucket.orders); },
      auditTrail: function () { return clone(auditJournal[tenantId]); }
    };
    auditAppend(tenantId, 'client:open', {});
    return Promise.resolve()
      .then(function () { return fn(client); })
      .then(function (res) {
        auditAppend(tenantId, 'client:close', {});
        return res;
      })
      .catch(function (err) {
        auditAppend(tenantId, 'client:error', { message: String(err && err.message || err) });
        throw err;
      });
  }

  function seed(opts) {
    requireTenantId(opts);
    ensureTenant(opts.tenantId);
    var n = (typeof opts.count === 'number' && opts.count > 0) ? opts.count : 10;
    var created = { patients: [], doctors: [], nurses: [] };
    for (var i = 0; i < n; i++) {
      created.patients.push(testPatient({ tenantId: opts.tenantId, mrn: 'P-' + String(i + 1).padStart(3, '0') }));
    }
    var specialties = ['cardiology', 'pediatrics', 'surgery'];
    for (var d = 0; d < 3; d++) {
      created.doctors.push(testDoctor({ tenantId: opts.tenantId, specialty: specialties[d] }));
    }
    var wards = ['ICU', 'ER', 'Ward-A', 'Ward-B', 'Ward-C'];
    for (var nd = 0; nd < 5; nd++) {
      created.nurses.push(testNurse({ tenantId: opts.tenantId, ward: wards[nd] }));
    }
    auditAppend(opts.tenantId, 'seed', { patients: created.patients.length, doctors: created.doctors.length, nurses: created.nurses.length });
    return created;
  }

  function cleanup(opts) {
    requireTenantId(opts);
    if (!stores[opts.tenantId]) {
      return { tenantId: opts.tenantId, removed: 0 };
    }
    var total =
      stores[opts.tenantId].patients.length +
      stores[opts.tenantId].doctors.length +
      stores[opts.tenantId].nurses.length +
      stores[opts.tenantId].encounters.length +
      stores[opts.tenantId].orders.length;
    // Final audit entry before wipe (preserves chain integrity for the session).
    auditAppend(opts.tenantId, 'cleanup', { removed: total });
    delete stores[opts.tenantId];
    delete idCounters[opts.tenantId];
    // Note: auditJournal is intentionally retained so the chain is auditable post-cleanup.
    return { tenantId: opts.tenantId, removed: total };
  }

  return {
    setup: setup,
    testPatient: testPatient,
    testDoctor: testDoctor,
    testNurse: testNurse,
    testEncounter: testEncounter,
    testOrder: testOrder,
    withTenantClient: withTenantClient,
    seed: seed,
    cleanup: cleanup,
    // Inspection helpers (handy for assertions):
    _stores: stores,
    _audit: auditJournal
  };
});
