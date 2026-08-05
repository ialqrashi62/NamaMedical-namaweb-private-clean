'use strict';
// Tracing.js — minimal OpenTelemetry-style tracer (no external deps).
// Tracks spans in-memory; emits structured log per span.
// In production, swap with @opentelemetry/api via ports.js.
//
// Concepts:
//   - spanId: per-operation
//   - traceId: per root request, propagated across calls
//   - correlationId: derived from traceId
//   - parentSpanId: forming the tree

const crypto = require('crypto');

class Span {
  constructor(opts) {
    this.traceId = opts.traceId || crypto.randomBytes(8).toString('hex');
    this.spanId = crypto.createHash('sha256').update(this.traceId + ':' + crypto.randomBytes(2).toString('hex')).digest('hex').slice(0, 16);
    this.parentSpanId = opts.parentSpanId || null;
    this.name = opts.name || 'span';
    this.kind = opts.kind || 'internal';
    this.startTs = Date.now();
    this.endTs = null;
    this.attrs = Object.assign({}, opts.attrs || {});
    this.status = 'OK';
    this.events = [];
    this._ended = false;
  }
  setAttribute(k, v) { this.attrs[k] = v; return this; }
  setStatus(s, msg) { this.status = s; if (msg) this.attrs.statusMessage = msg; return this; }
  addEvent(name, attrs) { this.events.push({ name, ts: Date.now(), attrs: attrs || {} }); return this; }
  end() {
    if (this._ended) return;
    this._ended = true;
    this.endTs = Date.now();
  }
  durationMs() { return (this.endTs || Date.now()) - this.startTs; }
  child(name, attrs) {
    return new Span({
      traceId: this.traceId,
      parentSpanId: this.spanId,
      name,
      kind: 'internal',
      attrs: attrs || {},
    });
  }
}

class Tracer {
  constructor(opts = {}) {
    this.spans = [];
    this.logger = opts.logger || null;
    this.service = opts.service || 'nama-medical';
  }
  startSpan(name, attrs) {
    return new Span({ name, kind: 'SERVER', attrs: attrs || {} });
  }
  finishSpan(span) {
    if (!span) return null;
    span.end();
    const d = span.durationMs();
    const record = {
      service: this.service,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind,
      attrs: span.attrs,
      status: span.status,
      durationMs: d,
      events: span.events,
      ts: new Date(span.startTs).toISOString(),
      endTs: span.endTs ? new Date(span.endTs).toISOString() : null,
    };
    this.spans.push(record);
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info('trace.span', record);
    }
    return record;
  }

  // middleware: ensures each request has a traceId + emits one span
  middleware(opts) {
    const self = this;
    return function tracedHandler(req, res, next) {
      let traceId = (req && req.headers && (req.headers['x-trace-id'] || req.headers['x-request-id'])) || null;
      if (!traceId) traceId = crypto.randomBytes(8).toString('hex');
      const span = self.startSpan('http.' + ((req && req.method) || 'GET'), {
        method: req && req.method,
        url: (req && (req.originalUrl || req.url)) || '',
      });
      span.traceId = traceId;
      if (req) {
        req.context = req.context || {};
        req.context.traceId = traceId;
        req.context.span = span;
      }
      if (res && typeof res.setHeader === 'function') {
        try { res.setHeader('X-Trace-Id', traceId); } catch (_) {}
      }
      const finishHandler = () => {
        if (res && typeof res.statusCode === 'number') {
          span.setAttribute('statusCode', res.statusCode);
          if (res.statusCode >= 500) span.setStatus('ERROR', 'http_5xx');
        }
        self.finishSpan(span);
      };
      if (res && typeof res.on === 'function') {
        res.on('finish', finishHandler);
        res.on('close', finishHandler);
      }
      // CRITICAL: must invoke next() to continue chain. If none provided, no-op.
      if (typeof next === 'function') {
        try { return next(); } catch (e) { /* swallow middleware errors */ }
      }
    };
  }

  // Helper: run a callback inside a child span, end span automatically
  inSpan(parent, name, fn, attrs) {
    const child = (parent && parent.child) ? parent.child(name, attrs) : this.startSpan(name, attrs);
    try {
      const out = fn(child);
      if (out && typeof out.then === 'function') {
        return out.then((v) => { this.finishSpan(child); return v; }, (e) => { child.setStatus('ERROR', e.message); this.finishSpan(child); throw e; });
      }
      this.finishSpan(child);
      return out;
    } catch (e) {
      child.setStatus('ERROR', e.message);
      this.finishSpan(child);
      throw e;
    }
  }

  recent(limit) {
    const n = limit || 50;
    return this.spans.slice(-n).reverse();
  }
}

module.exports = { Tracer, Span };
