'use strict';
// TokenBucketLimiter — per-tenant + per-actor token bucket.
// In-memory sandbox-grade limiter. Production should swap with Redis-backed
// token bucket (rate-limit-redis) and metrics emission.

class TokenBucketLimiter {
  constructor(opts = {}) {
    this.capacity = opts.capacity !== undefined ? opts.capacity : 60;
    this.refillPerSec = opts.refillPerSec !== undefined ? opts.refillPerSec : 1;
    this.buckets = new Map(); // key -> { tokens, last }
    this.now = opts.now || (() => Date.now());
  }

  _key(tenantId, actor) {
    return (tenantId || '_') + '|' + (actor || '_');
  }

  _refill(b) {
    const dt = (this.now() - b.last) / 1000;
    if (dt > 0) {
      b.tokens = Math.min(this.capacity, b.tokens + dt * this.refillPerSec);
      b.last = this.now();
    }
  }

  take(input = {}) {
    const k = this._key(input.tenantId, input.actor);
    let b = this.buckets.get(k);
    if (!b) {
      b = { tokens: this.capacity, last: this.now() };
      this.buckets.set(k, b);
    } else {
      this._refill(b);
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  reset() { this.buckets.clear(); }

  // Middleware factory
  middleware() {
    return (req, res, next) => {
      const tenantId = (req && req.context && req.context.tenantId) || (req.headers && req.headers['x-tenant']);
      const actor = (req && req.context && req.context.providerId) || (req.headers && req.headers['x-actor']);
      if (this.take({ tenantId, actor })) return next();
      const retry = (req && req.headers && req.headers['retry-after']) || 1;
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ error: 'RATE_LIMITED', retryAfter: retry });
    };
  }
}

module.exports = { TokenBucketLimiter };
