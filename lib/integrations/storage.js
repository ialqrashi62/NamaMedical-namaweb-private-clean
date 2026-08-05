'use strict';
// Tenant-scoped Salesforce config + sync log store.
// Pure JS, no npm install. In-memory (production: replace with DB adapter).

function newSalesforceStorage() {
  const configs = {}; // tenantId -> { instanceUrl, tokenFingerprint, connectedAt }
  const logs = []; // append-only

  function setConfig(tenantId, cfg) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!cfg || !cfg.instanceUrl) return { ok: false, error: 'FIELD_REQUIRED' };
    configs[tenantId] = {
      instanceUrl: cfg.instanceUrl,
      tokenFingerprint: cfg.tokenFingerprint || null,
      connectedAt: cfg.connectedAt || new Date().toISOString(),
      mappingVersion: cfg.mappingVersion || 'v1.0'
    };
    return { ok: true, tenantId: tenantId };
  }

  function getConfig(tenantId) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const c = configs[tenantId];
    if (!c) return { ok: false, error: 'NOT_CONNECTED' };
    return { ok: true, tenantId: tenantId, config: c };
  }

  function appendSyncLog(tenantId, entry) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const row = {
      tenantId: tenantId,
      ts: new Date().toISOString(),
      op: (entry && entry.op) || 'unknown',
      hash: (entry && entry.hash) || null
    };
    logs.push(row);
    return { ok: true, tenantId: tenantId, count: logs.length };
  }

  function getSyncLog(tenantId, limit) {
    if (!tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const lim = typeof limit === 'number' && limit > 0 ? limit : 50;
    const out = [];
    for (let i = logs.length - 1; i >= 0 && out.length < lim; i--) {
      if (logs[i].tenantId === tenantId) out.push(logs[i]);
    }
    return { ok: true, tenantId: tenantId, count: out.length, log: out };
  }

  function listConnected() {
    const ids = Object.keys(configs);
    return { ok: true, count: ids.length, tenantIds: ids };
  }

  return {
    setConfig: setConfig,
    getConfig: getConfig,
    appendSyncLog: appendSyncLog,
    getSyncLog: getSyncLog,
    listConnected: listConnected
  };
}

module.exports = {
  newSalesforceStorage: newSalesforceStorage,
  SalesforceStorage: newSalesforceStorage
};
