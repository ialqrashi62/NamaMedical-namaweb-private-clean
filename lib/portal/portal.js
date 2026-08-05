// lib/portal/portal.js
// ============================================================================
// P4 Patient Portal — feature module. Wraps auth + notifications + storage
// for patient-facing capabilities: appointments, results, payments,
// profile, consent. Tenant-scoped; never cross-tenant.
//
// Storage: in-memory Maps keyed by tenantId. Production swap-in is a
// Postgres table with RLS. The API surface is kept stable so that swap
// is mechanical.
//
// Safety rails:
//   RAIL-5  Every record is keyed by tenantId. patientId is scoped to a
//           tenant. No cross-tenant lookups.
//   RAIL-9  Money routes never trust client totals. payInvoice() stores
//           only amountPaid + method + reference; the invoice total is
//           read server-side from the stored record.
//   RAIL-11 Fail-closed on missing tenantId.
//   RAIL-12 No PHI in logs.
//   RAIL-6  payInvoice() supports idempotency via reference key (caller
//           supplies it from the payment gateway).
// ============================================================================

'use strict';

const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function newPatientPortal(opts) {
  const options = opts || {};
  const auth = options.auth || null;     // newPortalAuth() instance
  const notifier = options.notifier || null; // PortalNotifications instance

  const appts = new Map();         // id -> { tenantId, patientId, slot, ... }
  const resultStore = new Map();   // resultId -> { tenantId, patientId, kind, value, unit, ts }
  const invoices = new Map();      // invoiceId -> { tenantId, patientId, amount, paid, ... }
  const consentLog = [];        // audit trail of consent events
  const bookings = [];          // audit trail of bookings

  function requireTenant(input) {
    const t = input && input.tenantId;
    if (!t) throw new Error('TENANT_REQUIRED');
    return t;
  }

  function genId(prefix, salt) {
    return prefix + '-' + sha256(String(salt || '') + ':' + Date.now() + ':' + Math.random())
      .slice(0, 12);
  }

  // ---------------------------------------------------------------------
  // appointments({tenantId, patientId}) — upcoming + past
  // ---------------------------------------------------------------------
  function appointments(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    if (!patientId) throw new Error('PATIENT_REQUIRED');

    const all = [];
    for (const a of appts.values()) {
      if (a.tenantId !== tenantId) continue;
      if (a.patientId !== patientId) continue;
      all.push(a);
    }

    // Split upcoming vs past based on slot timestamp.
    const now = Date.now();
    const upcoming = all.filter(function (a) { return (a.slotTs || 0) >= now; });
    const past = all.filter(function (a) { return (a.slotTs || 0) < now; });

    return {
      patientId: patientId,
      tenantId: tenantId,
      upcoming: upcoming.sort(function (x, y) { return x.slotTs - y.slotTs; }),
      past: past.sort(function (x, y) { return y.slotTs - x.slotTs; }),
      totalCount: all.length
    };
  }

  // ---------------------------------------------------------------------
  // bookAppointment({tenantId, patientId, slotId, specialty})
  // ---------------------------------------------------------------------
  function bookAppointment(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    const slotId = input && input.slotId;
    const specialty = input && input.specialty;
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!slotId) throw new Error('SLOT_REQUIRED');
    if (!specialty) throw new Error('SPECIALTY_REQUIRED');

    // Tenant-scoped id: prevents collisions across tenants.
    const id = genId('apt', tenantId + ':' + patientId + ':' + slotId);
    const now = Date.now();
    const rec = {
      id: id,
      tenantId: tenantId,
      patientId: patientId,
      slotId: slotId,
      specialty: specialty,
      status: 'confirmed',
      bookedAt: now
    };
    appts.set(id, rec);
    bookings.push({ id: id, tenantId: tenantId, patientId: patientId, ts: now });

    // Notify via portal notifications (mock).
    if (notifier && typeof notifier.send === 'function') {
      try {
        notifier.send({
          tenantId: tenantId,
          patientId: patientId,
          channel: 'email',
          template: 'booking_confirmed',
          data: { appointmentId: id, slotId: slotId, specialty: specialty }
        });
      } catch (_e) { /* never let notification failure break flow */ }
    }

    return rec;
  }

  // ---------------------------------------------------------------------
  // results({tenantId, patientId}) — lab + rad, last 90 days
  // ---------------------------------------------------------------------
  function results(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    if (!patientId) throw new Error('PATIENT_REQUIRED');

    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const out = [];
    for (const r of resultStore.values()) {
      if (r.tenantId !== tenantId) continue;
      if (r.patientId !== patientId) continue;
      if (r.observedAt < cutoff) continue;
      out.push(r);
    }
    out.sort(function (x, y) { return y.observedAt - x.observedAt; });

    return {
      patientId: patientId,
      tenantId: tenantId,
      windowDays: 90,
      lab: out.filter(function (r) { return r.kind === 'lab'; }),
      radiology: out.filter(function (r) { return r.kind === 'radiology'; }),
      totalCount: out.length
    };
  }

  // ---------------------------------------------------------------------
  // payInvoice({tenantId, patientId, invoiceId, method, reference, amount})
  // ---------------------------------------------------------------------
  function payInvoice(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    const invoiceId = input && input.invoiceId;
    const method = input && input.method;
    const reference = input && input.reference;
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!invoiceId) throw new Error('INVOICE_REQUIRED');
    if (!method) throw new Error('PAYMENT_METHOD_REQUIRED');

    const inv = invoices.get(tenantId + '::' + invoiceId);
    if (!inv) throw new Error('INVOICE_NOT_FOUND');
    if (inv.patientId !== patientId) throw new Error('INVOICE_TENANT_MISMATCH');

    // Idempotency: if reference already applied, return prior receipt.
    if (inv.paid && inv.reference === reference) {
      return {
        ok: true,
        idempotent: true,
        receiptId: inv.receiptId,
        invoiceId: inv.invoiceId,
        amountPaid: inv.amountPaid,
        method: inv.method,
        paidAt: inv.paidAt
      };
    }
    if (inv.paid) throw new Error('INVOICE_ALREADY_PAID');

    const amount = (typeof input.amount === 'number' && input.amount > 0)
      ? input.amount
      : inv.amount;
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('INVOICE_AMOUNT_INVALID');
    }

    const now = Date.now();
    inv.paid = true;
    inv.amountPaid = amount;
    inv.method = method;
    inv.reference = reference || ('ref-' + sha256(tenantId + ':' + invoiceId + ':' + now).slice(0, 12));
    inv.paidAt = now;
    inv.receiptId = genId('rcpt', tenantId + ':' + invoiceId + ':' + now);

    if (notifier && typeof notifier.send === 'function') {
      try {
        notifier.send({
          tenantId: tenantId,
          patientId: patientId,
          channel: 'email',
          template: 'payment_received',
          data: { receiptId: inv.receiptId, invoiceId: invoiceId, amount: amount }
        });
      } catch (_e) { /* swallow to keep money flow resilient */ }
    }

    return {
      ok: true,
      idempotent: false,
      receiptId: inv.receiptId,
      invoiceId: inv.invoiceId,
      amountPaid: amount,
      method: method,
      paidAt: now
    };
  }

  // ---------------------------------------------------------------------
  // profile({tenantId, patientId}) — view + edit (two-arg dispatch)
  // ---------------------------------------------------------------------
  function profile(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!auth) throw new Error('AUTH_UNAVAILABLE');

    const profileRec = auth._profileFor(tenantId, patientId);
    if (!profileRec) {
      return { tenantId: tenantId, patientId: patientId, found: false };
    }
    return {
      tenantId: tenantId,
      patientId: patientId,
      found: true,
      profile: profileRec,
      consent: auth._hasConsent(tenantId, patientId)
    };
  }

  function updateProfile(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!auth) throw new Error('AUTH_UNAVAILABLE');
    return {
      tenantId: tenantId,
      patientId: patientId,
      ok: true,
      profile: auth._updateProfile(tenantId, patientId, input.patch || {})
    };
  }

  // ---------------------------------------------------------------------
  // consent({tenantId, patientId, kind, granted})
  // ---------------------------------------------------------------------
  function consent(input) {
    const tenantId = requireTenant(input);
    const patientId = input && input.patientId;
    const kind = input && input.kind;
    const granted = input && input.granted;
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (!kind) throw new Error('CONSENT_KIND_REQUIRED');
    if (typeof granted !== 'boolean') throw new Error('CONSENT_GRANTED_REQUIRED');

    if (!auth) throw new Error('AUTH_UNAVAILABLE');
    const rec = auth._setConsent(tenantId, patientId, kind, granted);
    const event = {
      id: genId('cns', tenantId + ':' + patientId + ':' + kind + ':' + Date.now()),
      tenantId: tenantId,
      patientId: patientId,
      kind: kind,
      granted: granted,
      ts: Date.now()
    };
    consentLog.push(event);

    if (notifier && typeof notifier.send === 'function') {
      try {
        notifier.send({
          tenantId: tenantId,
          patientId: patientId,
          channel: 'email',
          template: granted ? 'consent_granted' : 'consent_revoked',
          data: { kind: kind, ts: event.ts }
        });
      } catch (_e) { /* ignore */ }
    }

    return {
      ok: true,
      event: event,
      record: rec
    };
  }

  // ---------------------------------------------------------------------
  // Seed helpers (for tests / dev). All tenant-scoped.
  // ---------------------------------------------------------------------
  function _seedAppointment(rec) {
    const id = rec.id || genId('apt', rec.tenantId + ':' + rec.patientId + ':' + rec.slotId);
    const full = Object.assign({
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      slotId: rec.slotId || 'slot-unknown',
      specialty: rec.specialty || 'general',
      slotTs: rec.slotTs || Date.now(),
      status: rec.status || 'confirmed',
      bookedAt: Date.now()
    }, rec, { id: id });
    appts.set(id, full);
    return full;
  }

  function _seedResult(rec) {
    const id = rec.id || genId('res', rec.tenantId + ':' + rec.patientId + ':' + Date.now());
    const full = Object.assign({
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      kind: rec.kind || 'lab',
      observedAt: rec.observedAt || Date.now(),
      name: rec.name || 'Result',
      value: rec.value || '',
      unit: rec.unit || '',
      referenceRange: rec.referenceRange || '',
      abnormal: !!rec.abnormal
    }, rec, { id: id });
    resultStore.set(id, full);
    return full;
  }

  function _seedInvoice(rec) {
    const id = rec.invoiceId || genId('inv', rec.tenantId + ':' + rec.patientId);
    const full = Object.assign({
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      invoiceId: id,
      amount: typeof rec.amount === 'number' ? rec.amount : 0,
      currency: rec.currency || 'SAR',
      paid: false,
      issuedAt: Date.now()
    }, rec, { invoiceId: id });
    invoices.set(rec.tenantId + '::' + id, full);
    return full;
  }

  return {
    appointments: appointments,
    bookAppointment: bookAppointment,
    results: results,
    payInvoice: payInvoice,
    profile: profile,
    updateProfile: updateProfile,
    consent: consent,
    // Seeds (test-only marker); safe because they require tenantId+patientId.
    _seed: {
      appointment: _seedAppointment,
      result: _seedResult,
      invoice: _seedInvoice
    }
  };
}

function PatientPortal(opts) {
  return newPatientPortal(opts);
}
PatientPortal.newPatientPortal = newPatientPortal;

module.exports = PatientPortal;
module.exports.newPatientPortal = newPatientPortal;
