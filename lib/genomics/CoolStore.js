'use strict';
// CoolStore — cold-tier storage abstraction. In production: writes to S3 Glacier
// or local tape. Sandbox: counts bytes per tenant.

function newCoolStore() {
  const stats = new Map(); // tenantId → bytes
  function put({ tenantId, bytes }) {
    if (!tenantId || typeof bytes !== 'number') throw new Error('TENANT_AND_BYTES_REQUIRED');
    stats.set(tenantId, (stats.get(tenantId) || 0) + bytes);
    return { tenantId, total: stats.get(tenantId) };
  }
  function stat(tenantId) { return stats.get(tenantId) || 0; }
  return { put, stat, _stats: stats };
}

module.exports = { newCoolStore };
