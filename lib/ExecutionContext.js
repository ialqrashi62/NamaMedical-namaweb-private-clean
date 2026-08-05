'use strict';

/**
 * ExecutionContext — passed to every clinical engine.
 * Carries tenant + provider + role + correlation id + timing.
 * Enforces fail-closed on missing tenantId (safety rail 11).
 */
class ExecutionContext {
  constructor(opts) {
    if (!opts || !opts.tenantId) {
      throw new Error('ExecutionContext: tenantId required (safety rail 11)');
    }
    this.tenantId = String(opts.tenantId);
    this.providerId = opts.providerId ? String(opts.providerId) : null;
    this.role = opts.role || 'doctor';
    this.correlationId = opts.correlationId || ExecutionContext._cid();
    this.requestedAt = new Date();
    this.start = process.hrtime.bigint();
    this.scopes = Array.isArray(opts.scopes) ? opts.scopes : [];
    this.ip = opts.ip || null;
    this.userAgent = opts.userAgent || null;
    this.lang = opts.lang || 'ar-SA';
    this.facilityType = opts.facilityType || null;
    this._ledger = [];
  }

  static _cid() {
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  elapsedMs() {
    const ns = process.hrtime.bigint();
    return Number(ns - this.start) / 1e6;
  }

  requireTenantScope() {
    return this.tenantId; // Always returns; absence already thrown in ctor.
  }

  appendLedger(entry) {
    this._ledger.push(Object.assign({ ts: new Date().toISOString() }, entry));
  }

  ledgerSnapshot() {
    return this._ledger.slice();
  }
}

module.exports = { ExecutionContext };
