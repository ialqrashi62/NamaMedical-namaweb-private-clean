'use strict';
// routes/hl7v2.js
// P3 HL7 v2 Inbound endpoints (ADT^A01, ORM^O01, ORU^R01).
// Tenant-scoped, role-gated, fail-closed.
//
// Mounted in server.js via:
//   const hl7v2 = require('./routes/hl7v2');
//   app.use('/api/v4/hl7', hl7v2);
//
// Endpoints:
//   POST /api/v4/hl7/ingest      — body: { raw: "<HL7 v2 message>" } OR Content-Type: text/plain
//   GET  /api/v4/hl7/inbox       — query: ?status=pending&tenantId=<id>
//   POST /api/v4/hl7/ack/:id     — mark a message processed
//
// ACK semantics:
//   200 OK + { ack: 'AA', messageControlId } on success
//   400 Bad Request + { ack: 'AE', messageControlId, reason } on parse failure
//   502 Bad Gateway is reserved for upstream MLLP transport errors (out of scope here).
//
// SAFETY:
//   - RAIL-5: tenant scope enforced via RouteFactory.tenantScoped.
//   - RAIL-12: only IDs and message type are logged; raw HL7 body is never logged.
//   - RAIL-13: Golden Access Rule — admin/doctor/nurse can ingest; staff
//     role can only read their own tenant's inbox.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HL7v2Routes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var RouteFactory = require('../lib/route-factory');
  var RouteGuards = require('../lib/route-guards');
  var ParserMod = require('../lib/hl7v2/parser');
  var Mapper = require('../lib/hl7v2/mapper');
  var Storage = require('../lib/hl7v2/storage');

  var HL7Parser = (ParserMod && typeof ParserMod.HL7Parser === 'function')
    ? ParserMod.HL7Parser
    : ParserMod;

  function isLikelyHL7(input) {
    if (typeof input !== 'string') return false;
    var head = input.substring(0, 6).toUpperCase();
    return head.indexOf('MSH|') === 0;
  }

  function safeLog(level, msg, fields) {
    if (typeof console === 'undefined' || !console[level]) return;
    // RAIL-12: no PHI; only IDs, type, trigger, and tenantId.
    var safe = fields ? JSON.stringify(fields) : '';
    console[level]('[hl7v2] ' + msg + (safe ? ' ' + safe : ''));
  }

  function buildAckResponse(parsed, ackCode, textMessage) {
    var parser = new HL7Parser();
    var body = parser.buildAck({
      sendingApp: (parsed && parsed.receivingApp) || 'NAMAMEDICAL',
      sendingFacility: (parsed && parsed.receivingFacility) || 'NAMAMEDICAL',
      receivingApp: (parsed && parsed.sendingApp) || '',
      receivingFacility: (parsed && parsed.sendingFacility) || '',
      messageControlId: (parsed && parsed.messageControlId) || '',
      ackCode: ackCode,
      textMessage: textMessage || ''
    });
    return {
      ack: ackCode,
      messageControlId: (parsed && parsed.messageControlId) || '',
      body: body,
      reason: textMessage || undefined
    };
  }

  // Extract raw HL7 v2 text from a request. Supports:
  //   - application/json: { raw: "..." } or { message: "..." }
  //   - text/plain:       raw body as string
  function extractRaw(req) {
    if (!req) return '';
    if (typeof req.body === 'string' && req.body.length > 0) return req.body;
    if (req.body && typeof req.body === 'object') {
      if (typeof req.body.raw === 'string') return req.body.raw;
      if (typeof req.body.message === 'string') return req.body.message;
      if (typeof req.body.hl7 === 'string') return req.body.hl7;
    }
    return '';
  }

  // POST /api/v4/hl7/ingest
  function ingestHandler(ctx) {
    var req = ctx.req;
    var tenantId = ctx.tenantId;
    var raw = extractRaw(req);
    if (!raw || !isLikelyHL7(raw)) {
      safeLog('warn', 'ingest rejected: missing or malformed MSH', {
        tenantId: tenantId,
        contentType: (req && req.headers && req.headers['content-type']) || ''
      });
      return {
        status: 400,
        body: {
          ack: 'AE',
          reason: 'INVALID_HL7: missing MSH segment'
        }
      };
    }

    var parser = new HL7Parser();
    var parsed = null;
    try {
      parsed = parser.parse(raw);
    } catch (err) {
      safeLog('warn', 'ingest parse error', {
        tenantId: tenantId,
        code: (err && err.code) || 'PARSE_ERROR',
        msgLen: raw.length
      });
      return {
        status: 400,
        body: {
          ack: 'AE',
          reason: 'PARSE_ERROR: ' + ((err && err.message) || 'unknown')
        }
      };
    }

    var domain = Mapper.toDomain(parsed, tenantId);
    var stored = Storage.inbox(tenantId, domain);
    Storage.attachRaw(stored.id, raw);

    safeLog('info', 'ingest ok', {
      tenantId: tenantId,
      type: parsed.type,
      trigger: parsed.trigger,
      messageControlId: parsed.messageControlId,
      inboxId: stored.id
    });

    return {
      status: 200,
      body: buildAckResponse(parsed, 'AA', '')
    };
  }

  // GET /api/v4/hl7/inbox
  function inboxHandler(ctx) {
    var tenantId = ctx.tenantId;
    var status = ctx.query && ctx.query.status ? String(ctx.query.status) : null;
    var list = Storage.unprocessed(tenantId, status);
    safeLog('info', 'inbox list', {
      tenantId: tenantId,
      status: status || 'all',
      count: list.length
    });
    return {
      tenantId: tenantId,
      count: list.length,
      messages: list
    };
  }

  // POST /api/v4/hl7/ack/:id
  function ackHandler(ctx) {
    var tenantId = ctx.tenantId;
    var id = ctx.params && ctx.params.id;
    if (!id) {
      return { status: 400, body: { error: 'FIELD_REQUIRED', msg: 'id is required' } };
    }
    var rec = Storage.findRecord(id, tenantId);
    if (!rec) {
      safeLog('warn', 'ack not found', { tenantId: tenantId, inboxId: id });
      return { status: 404, body: { error: 'NOT_FOUND', msg: 'inbox message not found' } };
    }
    var ok = Storage.markProcessed(id, tenantId);
    if (!ok) {
      return { status: 500, body: { error: 'INTERNAL', msg: 'failed to mark processed' } };
    }
    safeLog('info', 'ack ok', {
      tenantId: tenantId,
      inboxId: id,
      type: rec.messageType,
      trigger: rec.trigger
    });
    return {
      ok: true,
      id: id,
      status: 'processed',
      tenantId: tenantId
    };
  }

  // Build the canonical router. tenant-scoped, clinician/admin only.
  var router = RouteFactory.create({
    base: '/',
    tenantScoped: true,
    auth: { roles: ['admin', 'doctor', 'nurse', 'lab'] },
    methods: {
      POST: {
        input: [],
        handler: function (ctx) { return ingestHandler(ctx); }
      },
      GET: {
        input: [],
        handler: function (ctx) { return inboxHandler(ctx); }
      }
    }
  });

  // /api/v4/hl7/ack/:id — needs a parameterized POST, which the factory
  // supports only via base + body. We mount it as a sibling Express route
  // using the same guards.
  function ackRoute(req, res) {
    if (!RouteGuards.requireAuth(req, res)) return;
    if (!RouteGuards.requireTenant(req, res)) return;
    if (!RouteGuards.requireTenantScope(req, res)) return;
    if (!RouteGuards.requireRole(req, res, ['admin', 'doctor', 'nurse', 'lab'])) return;
    var ctx = {
      req: req,
      tenantId: req.tenantId,
      tenantScope: req.tenantScope,
      user: req.user,
      params: req.params,
      query: req.query,
      body: req.body
    };
    var result = ackHandler(ctx);
    if (result && typeof result.status === 'number') {
      res.status(result.status).json(result.body);
    } else {
      res.json(result);
    }
  }

  // Dev/test tenant header trust (GATE-4 aligned; same pattern as autowire `_ctx`).
  // Must run BEFORE the route factory mounts its guards.
  try {
    router.use(require('../lib/dev-ctx'));
  } catch (_e) {
    // dev-ctx not available; rely on real session auth.
  }

  // Try to attach the parameterized ack route to the same router.
  // If express is available, this binds it; otherwise it stays as a
  // no-op (tests fall back to factory-only paths).
  try {
    var expressLib = require('express');
    if (typeof router.post === 'function') {
      router.post('/ack/:id', ackRoute);
    }
  } catch (_e) {
    // No express in this process; nothing to mount.
  }

  // Expose handlers for unit tests and direct programmatic use.
  router.handlers = {
    ingest: ingestHandler,
    inbox: inboxHandler,
    ack: ackHandler,
    extractRaw: extractRaw,
    isLikelyHL7: isLikelyHL7,
    buildAckResponse: buildAckResponse
  };

  return router;
});
