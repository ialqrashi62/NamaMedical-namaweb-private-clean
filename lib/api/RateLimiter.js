'use strict';
// Per-partner rate limiter. Token bucket per partner.

function newRateLimiter() {
  const buckets = new Map(); // partnerId → { tokens, refill, capacity, last }
  function configure({ partnerId, capacity, refillPerSec }) {
    if (!partnerId) throw new Error('PARTNER_ID_REQUIRED');
    buckets.set(partnerId, { tokens: capacity, capacity, refill: refillPerSec, last: Date.now() });
  }
  function take({ partnerId, cost }) {
    const b = buckets.get(partnerId);
    if (!b) return { ok: false, reason: 'PARTNER_NOT_CONFIGURED' };
    const now = Date.now();
    const elapsed = (now - b.last) / 1000;
    b.tokens = Math.min(b.capacity, b.tokens + elapsed * b.refill);
    b.last = now;
    if (b.tokens < cost) return { ok: false, tokens: b.tokens };
    b.tokens -= cost;
    return { ok: true, tokens: b.tokens };
  }
  return { configure, take, _buckets: buckets };
}

module.exports = { newRateLimiter };
