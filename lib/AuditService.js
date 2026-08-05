'use strict';

/**
 * AuditService — hash-chained, 7+ year retention (safety rail 10).
 * Falls back to console-based dev sink if PG not configured.
 */
const crypto = require('crypto');
const { Pool } = require('pg');

class AuditService {
  constructor(opts = {}) {
    this.pool = opts.pool || null;
    this.table = opts.table || 'audit_events';
    this.dryRun = opts.dryRun !== false; // default true for safety
    this._lastHashByTenant = new Map();
    this.chain = []; // in-memory hash chain (used by smoke; real PG is the durable sink)
  }

  async record(row) {
    const enriched = this._enrich(row);
    const safe = this._stripSecrets(enriched);

    // Chain entry (always, even in dryRun)
    const prev = this._lastHashByTenant.get(safe.tenantId) || '0'.repeat(64);
    const hash = this._sha(prev + JSON.stringify(safe));
    this.chain.push({ tenantId: safe.tenantId, prev, hash, payload: safe });
    this._lastHashByTenant.set(safe.tenantId, hash);
    if (this.chain.length > 5000) this.chain.shift();

    if (this.dryRun || !this.pool) {
      // dev sink — readable by ops but not stored in PG
      if (process.env.AUDIT_DEBUG === '1') {
        process.stdout.write('[AUDIT] ' + JSON.stringify(safe) + '\n');
      }
      return { ok: true, sink: 'dev' };
    }

    if (this._lastHashByTenant.get(safe.tenantId)) {
      // already chained above; fast-path no-op PG sink
    }
    const sql = `INSERT INTO ${this.table}
      (tenant_id, provider_id, role, engine_id, engine_version, dept_id,
       safety_class, correlation_id, latency_ms, red_flag_fired,
       drug_block_fired, citation_count, confidence, payload, prev_hash, hash, ts)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16, now())`;
    try {
      await this.pool.query(sql, [
        safe.tenantId, safe.providerId, safe.role,
        safe.engineId, safe.engineVersion, safe.deptId,
        safe.safetyClass, safe.correlationId, safe.latencyMs,
        safe.redFlagFired, safe.drugBlockFired, safe.citationCount,
        safe.confidence, JSON.stringify(safe), hash, hash,
      ]);
      return { ok: true, sink: 'pg', hash };
    } catch (e) {
      // NEVER throw to caller; audit failure must not break workflow,
      // but it must still be visible somewhere.
      process.stderr.write('[AUDIT_ERROR] ' + e.message + ' for engine=' + safe.engineId + '\n');
      return { ok: false, sink: 'pg', error: e.message };
    }
  }

  _enrich(row) {
    return Object.assign({
      ts: new Date().toISOString(),
      hostname: process.env.HOSTNAME || require('os').hostname(),
    }, row);
  }

  _stripSecrets(row) {
    const blacklist = ['password', 'token', 'authorization', 'cookie', 'csrf'];
    function scrub(o) {
      if (!o || typeof o !== 'object') return o;
      if (Array.isArray(o)) return o.map(scrub);
      const r = {};
      for (const k of Object.keys(o)) {
        if (blacklist.includes(k.toLowerCase())) {
          r[k] = '<REDACTED>';
        } else if (o[k] && typeof o[k] === 'object') {
          r[k] = scrub(o[k]);
        } else {
          r[k] = o[k];
        }
      }
      return r;
    }
    return scrub(row);
  }

  _sha(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
  }

  verify() {
    // tamper-evident verify of in-memory chain
    const buckets = new Map();
    for (let i = 0; i < this.chain.length; i++) {
      const e = this.chain[i];
      const prev = buckets.get(e.tenantId) || '0'.repeat(64);
      if (e.prev !== prev) return false;
      const recomputed = this._sha(prev + JSON.stringify(e.payload));
      if (recomputed !== e.hash) return false;
      buckets.set(e.tenantId, e.hash);
    }
    return true;
  }
}

module.exports = AuditService;
