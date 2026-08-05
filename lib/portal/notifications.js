// lib/portal/notifications.js
// ============================================================================
// P4 Patient Portal — Email/SMS notifications for portal events.
//
// Mock transport: stores a structured log of (tenantId, patientId,
// channel, template, data, ts). Production swap-in is email_service.js /
// sms_service.js — the API surface is kept stable for that.
//
// Templates supported:
//   booking_confirmed   — appointment booked or updated
//   result_ready        — new lab/rad result available
//   payment_received    — payment confirmed + receipt id
//   consent_granted     — patient granted a consent kind
//   consent_revoked     — patient revoked a consent kind
//   password_reset      — password reset link issued
//
// Safety rails:
//   RAIL-5  Tenant-scoped log. History filter is always tenantId+patientId.
//   RAIL-12 No PHI in the log payload. Captured `data` is structured and
//           scrubbed of full names/emails at write time.
// ============================================================================

'use strict';

const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

const ALLOWED_CHANNELS = ['email', 'sms', 'push'];
const ALLOWED_TEMPLATES = [
  'booking_confirmed',
  'result_ready',
  'payment_received',
  'consent_granted',
  'consent_revoked',
  'password_reset'
];

function scrub(data) {
  if (!data || typeof data !== 'object') return {};
  const copy = {};
  const blocked = ['name', 'fullName', 'email', 'phone', 'mobile', 'address', 'nationalId', 'mrn', 'dob'];
  for (const k of Object.keys(data)) {
    if (blocked.indexOf(k) !== -1) continue;
    const v = data[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      copy[k] = v;
    }
  }
  return copy;
}

function newPortalNotifications(opts) {
  const options = opts || {};
  const sink = options.sink || null; // optional external sink for tests
  const log = []; // tenantId + patientId scoped entries

  function pushEntry(entry) {
    log.push(entry);
    if (sink && typeof sink.send === 'function') {
      try { sink.send(entry); } catch (_e) { /* never let sink break flow */ }
    }
  }

  function send(input) {
    if (!input || typeof input !== 'object') throw new Error('INPUT_REQUIRED');
    const tenantId = input.tenantId;
    const patientId = input.patientId;
    const channel = input.channel;
    const template = input.template;
    const data = input.data || {};

    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!patientId) throw new Error('PATIENT_REQUIRED');
    if (ALLOWED_CHANNELS.indexOf(channel) === -1) throw new Error('CHANNEL_NOT_ALLOWED');
    if (ALLOWED_TEMPLATES.indexOf(template) === -1) throw new Error('TEMPLATE_NOT_ALLOWED');

    const id = 'ntf-' + sha256(tenantId + ':' + patientId + ':' + template + ':' + Date.now())
      .slice(0, 12);

    const entry = {
      id: id,
      tenantId: tenantId,
      patientId: patientId,
      channel: channel,
      template: template,
      data: scrub(data),
      sentAt: Date.now(),
      status: 'mock-sent'
    };
    pushEntry(entry);
    return entry;
  }

  function history(input) {
    const tenantId = input && input.tenantId;
    const patientId = input && input.patientId;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!patientId) throw new Error('PATIENT_REQUIRED');

    const out = [];
    for (const e of log) {
      if (e.tenantId !== tenantId) continue;
      if (e.patientId !== patientId) continue;
      out.push(e);
    }
    out.sort(function (a, b) { return b.sentAt - a.sentAt; });
    return {
      tenantId: tenantId,
      patientId: patientId,
      count: out.length,
      entries: out
    };
  }

  function recentForTenant(input) {
    const tenantId = input && input.tenantId;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const out = [];
    for (const e of log) {
      if (e.tenantId === tenantId) out.push(e);
    }
    out.sort(function (a, b) { return b.sentAt - a.sentAt; });
    return { tenantId: tenantId, count: out.length, entries: out };
  }

  return {
    send: send,
    history: history,
    recentForTenant: recentForTenant,
    _constants: {
      ALLOWED_CHANNELS: ALLOWED_CHANNELS,
      ALLOWED_TEMPLATES: ALLOWED_TEMPLATES
    }
  };
}

module.exports = { newPortalNotifications, ALLOWED_CHANNELS, ALLOWED_TEMPLATES, scrub };
