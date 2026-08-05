'use strict';
// WebhookBus — in-process publish/subscribe with persistence + retry.
// SANDBOX: emits locally; logs the dispatch.
// PRODUCTION: would back onto a durable queue (e.g. BullMQ, SQS).
//
// Contract:
//   Topic names: dotted lowercase (e.g. 'patient.admitted', 'lab.result')
//   Subscriber: { topic, fn, retries }
//   Bus.publish(topic, payload) returns a Promise<{deliveryId, accepted}>.

const crypto = require('crypto');

class WebhookBus {
  constructor(opts = {}) {
    this.subs = new Map(); // topic -> [{fn, retries, subId}]
    this.audit = [];       // in-memory audit [{topic, subId, deliveryId, status, attempts, ts}]
    this.maxAttempts = opts.maxAttempts || 3;
    this.backoffBaseMs = opts.backoffBaseMs || 100;
    this.logger = opts.logger || console;
    this._seq = 0;
  }

  subscribe(topic, fn, opts = {}) {
    if (!topic) throw new Error('TOPIC_REQUIRED');
    if (typeof fn !== 'function') throw new Error('FN_REQUIRED');
    const subId = crypto.createHash('sha256').update(topic + ':' + crypto.randomBytes(4).toString('hex')).digest('hex').slice(0, 16);
    const sub = { topic, fn, retries: opts.retries || 0, subId };
    if (!this.subs.has(topic)) this.subs.set(topic, []);
    this.subs.get(topic).push(sub);
    return subId;
  }

  unsubscribe(subId) {
    if (!subId) return false;
    for (const [topic, list] of this.subs.entries()) {
      const idx = list.findIndex(s => s.subId === subId);
      if (idx >= 0) { list.splice(idx, 1); return true; }
    }
    return false;
  }

  publish(topic, payload) {
    if (!topic) return Promise.reject(new Error('TOPIC_REQUIRED'));
    this._seq++;
    const deliveryId = 'dly-' + crypto.createHash('sha256').update(topic + ':' + this._seq + ':' + Date.now()).digest('hex').slice(0, 12);
    const subs = this.subs.get(topic) || [];
    if (!subs.length) {
      this.audit.push({ topic, subId: null, deliveryId, status: 'NO_SUBSCRIBER', attempts: 0, ts: new Date().toISOString() });
      return Promise.resolve({ deliveryId, accepted: 0 });
    }
    return Promise.all(subs.map(s => this._deliver(s, topic, payload, deliveryId))).then(results => {
      const accepted = results.filter(r => r.ok).length;
      return { deliveryId, accepted, total: subs.length, results };
    });
  }

  _deliver(sub, topic, payload, deliveryId) {
    let attempt = 0;
    const max = Math.max(0, sub.retries);
    const tryOnce = () => {
      attempt++;
      try {
        const r = sub.fn(payload);
        if (r && typeof r.then === 'function') {
          return r.then(
            () => ({ ok: true, attempt }),
            (err) => { if (attempt - 1 < max) return sleep(this.backoffBaseMs * attempt).then(tryOnce); return { ok: false, attempt, err: err.message }; }
          );
        }
        return Promise.resolve({ ok: true, attempt });
      } catch (e) {
        if (attempt - 1 < max) return sleep(this.backoffBaseMs * attempt).then(tryOnce);
        return Promise.resolve({ ok: false, attempt, err: e.message });
      }
    };
    return tryOnce().then(r => {
      this.audit.push({ topic, subId: sub.subId, deliveryId, status: r.ok ? 'DELIVERED' : 'FAILED', attempts: r.attempt, err: r.err || null, ts: new Date().toISOString() });
      return r;
    });
  }

  topics() {
    return [...this.subs.keys()];
  }

  auditLog() {
    return this.audit;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { WebhookBus };
