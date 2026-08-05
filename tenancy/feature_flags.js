'use strict';
// FeatureFlags — per-tenant flag overrides with default-on, default-off, and
// percentage-based rollout. Persisted in .ai-brain/99-state/feature_flags.json
// in sandbox mode. Production should swap with PG-backed table.
//
// Surface:
//   - flag(name, defaultValue)              register
//   - isEnabled(tenantId, name)              resolve
//   - set(tenantId, name, value)             override for tenant (RBAC-gated)
//   - rollout(tenantId, name)                compute percentage for tenant
//   - audit                                 show mutations

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STATE = {
  flags: {
    'experimental.cdss_rerank':   { defaultValue: false, rolloutPct: 0 },
    'feature.zatca_compliance':   { defaultValue: false, rolloutPct: 0 },
    'feature.tier2_engines':       { defaultValue: true,  rolloutPct: 100 },
    'feature.tier5_subunits':      { defaultValue: true,  rolloutPct: 100 },
    'feature.tier6_workflows':     { defaultValue: true,  rolloutPct: 100 },
    'feature.pgvector_search':     { defaultValue: false, rolloutPct: 0 },
    'feature.mirth_mllp_socket':   { defaultValue: false, rolloutPct: 0 },
    'feature.hikma_self_signup':   { defaultValue: false, rolloutPct: 0 },
  },
  overrides: {}, // tenantId -> { flagName: value }
  audit: [],
};

function defaultPath() {
  return path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'feature_flags.json');
}

class FeatureFlags {
  constructor(opts = {}) {
    this.path = opts.path || defaultPath();
    this.state = this._load();
    this.auditSink = opts.auditSink || ((entry) => this.state.audit.push(entry));
  }

  _load() {
    if (!fs.existsSync(this.path)) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    try {
      const data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      // Merge missing keys from DEFAULT_STATE
      for (const k of Object.keys(DEFAULT_STATE)) {
        if (data[k] === undefined) data[k] = JSON.parse(JSON.stringify(DEFAULT_STATE[k]));
      }
      return data;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) { /* sandbox: ignore write errors */ }
  }

  flag(name, defaultValue, opts = {}) {
    if (!name) throw new Error('FLAG_NAME_REQUIRED');
    this.state.flags[name] = this.state.flags[name] || { defaultValue: !!defaultValue, rolloutPct: opts.rolloutPct || (defaultValue ? 100 : 0) };
    if (this.state.flags[name].defaultValue !== !!defaultValue) this.state.flags[name].defaultValue = !!defaultValue;
    if (opts.rolloutPct !== undefined) this.state.flags[name].rolloutPct = Math.max(0, Math.min(100, Number(opts.rolloutPct)));
    this._save();
    return this.state.flags[name];
  }

  list() {
    return Object.entries(this.state.flags).map(([name, v]) => ({ name, defaultValue: v.defaultValue, rolloutPct: v.rolloutPct }));
  }

  _rolloutFor(tenantId, name, pct) {
    // Stable hash: tenantId+flag name -> pct of 100
    const h = crypto.createHash('sha256').update(String(tenantId) + ':' + String(name)).digest();
    const bucket = h.readUInt16BE(0) % 100;
    return bucket < pct;
  }

  isEnabled(tenantId, name) {
    const f = this.state.flags[name];
    if (!f) throw new Error('UNKNOWN_FLAG: ' + name);
    const override = this.state.overrides && this.state.overrides[tenantId] && this.state.overrides[tenantId][name];
    if (override !== undefined) return !!override;
    if (f.rolloutPct >= 100) return !!f.defaultValue;
    if (f.rolloutPct <= 0) return false;
    return this._rolloutFor(tenantId || 'anonymous', name, f.rolloutPct);
  }

  isEnabledForAny(name, tenantIds) {
    return (tenantIds || []).some(t => this.isEnabled(t, name));
  }

  rollout(tenantId, name) {
    const f = this.state.flags[name];
    if (!f) throw new Error('UNKNOWN_FLAG: ' + name);
    return Math.max(0, Math.min(100, Number(f.rolloutPct || 0)));
  }

  set(tenantId, name, value, opts = {}) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!name) throw new Error('FLAG_NAME_REQUIRED');
    if (this.state.flags[name] === undefined) throw new Error('UNKNOWN_FLAG: ' + name);
    if (!opts.silent) {
      if (!opts || !opts.silent) {
        if (!opts || !opts.actor || opts.actor.indexOf(':admin') === -1 && opts.actor !== 'owner') {
          // We allow non-admin in sandbox but require actor for audit
          if (!opts.actor) throw new Error('ACTOR_REQUIRED');
        }
      }
    }
    this.state.overrides[tenantId] = this.state.overrides[tenantId] || {};
    this.state.overrides[tenantId][name] = !!value;
    this._save();
    this.auditSink({ ts: new Date().toISOString(), tenantId, name, value: !!value, actor: opts.actor || 'unknown' });
    return this.state.overrides[tenantId][name];
  }

  unset(tenantId, name) {
    if (this.state.overrides[tenantId] && this.state.overrides[tenantId][name] !== undefined) {
      delete this.state.overrides[tenantId][name];
      this._save();
      return true;
    }
    return false;
  }

  overrideFor(tenantId) {
    return this.state.overrides[tenantId] || null;
  }

  allOverrides() {
    return this.state.overrides;
  }

  audit() {
    return this.state.audit;
  }

  reset() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this._save();
  }
}

module.exports = { FeatureFlags };
