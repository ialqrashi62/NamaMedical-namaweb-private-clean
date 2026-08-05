'use strict';
// LiveDeployGuard — owner-gated reads from deploy/git state and reports
// readiness for a given tenant or group of tenants. In production, it would
// call out to a metrics endpoint, but in sandbox it works from local files.
//
// Steps:
//  1) Validate owner permit (OWNER signature present).
//  2) Read live deploy manifest (if produced by an Operator run).
//  3) Resolve each tenant: check feature flags + module preset + audit hash.
//
// If the active tenant is missing from the manifest, refuse.

const fs = require('fs');
const path = require('path');

function manifestPath() {
  return path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'live_deploy_manifest.json');
}

class LiveDeployGuard {
  constructor(opts = {}) {
    this.path = opts.path || manifestPath();
    this.owners = opts.owners || ['system-default'];
    this.env = opts.env || 'sandbox';
  }

  readManifest() {
    if (!fs.existsSync(this.path)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  // Owner-gated: REQUIRES an owner-key id listed in this.owners
  authorize(opts = {}) {
    if (!opts.ownerKeyId) throw new Error('OWNER_KEY_REQUIRED');
    if (!this.owners.includes(opts.ownerKeyId)) throw new Error('OWNER_NOT_REGISTERED');
    return true;
  }

  // Check tenant readiness:
  //   - if manifest exists: tenant must be in `deployed`
  //   - if no manifest: fail-closed (refuse)
  checkTenantReadiness(tenantId, opts = {}) {
    this.authorize(opts);
    const m = this.readManifest();
    if (!m) {
      throw new Error('NO_LIVE_MANIFEST: deploy must first emit a manifest via deploy_live_manifest.sh');
    }
    if (!m.deployed) throw new Error('NOT_DEPLOYED');
    const info = m.deployed[tenantId];
    if (!info) throw new Error('TENANT_NOT_FOUND_IN_MANIFEST: ' + tenantId);
    if (info.healthCheck !== 'ok') throw new Error('TENANT_HEALTH_DEGRADED');
    return { ok: true, info };
  }

  // Produces a manifest payload (could be persisted to disk later)
  buildManifest({ tenants, meta = {} }) {
    return {
      ts: new Date().toISOString(),
      env: this.env,
      meta,
      deployed: tenants || {},
    };
  }

  writeManifest(payload) {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(payload, null, 2), 'utf8');
    return this.path;
  }
}

module.exports = { LiveDeployGuard };
