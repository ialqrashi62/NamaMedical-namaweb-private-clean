'use strict';

const crypto = require('crypto');

// canonicalize keys so {a:1,b:2} === {b:2,a:1}
function canonicalize(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(canonicalize);
  const sorted = {};
  for (const k of Object.keys(o).sort()) sorted[k] = canonicalize(o[k]);
  return sorted;
}

class IdempotencyGuard {
  constructor(opts = {}) {
    this.salt = opts.salt || process.env.IDEMPOTENCY_SALT || 'nama-medical-default-salt';
  }
  sign({ tenantId, route, body, actor, ts }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!route) throw new Error('ROUTE_REQUIRED');
    const payload = canonicalize({ tenantId, route, body: body || {}, actor: actor || 'anon', ts: ts || null });
    const h = crypto.createHash('sha256');
    h.update(this.salt);
    h.update('|');
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  }
}

// Soft idempotency middleware — sandbox echoes key, never blocks.
// In production, this would check the request signature against the
// PG-backed idempotency_key table (rail 6).
const idempotencyGuard = function idempotencyGuard(req, res, next) {
  const k = req.headers['idempotency-key'] || '';
  res.setHeader && res.setHeader('X-Idempotency-Key', k);
  next();
};

module.exports = idempotencyGuard;
module.exports.IdempotencyGuard = IdempotencyGuard;
module.exports.canonicalize = canonicalize;
