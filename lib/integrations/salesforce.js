'use strict';
// Salesforce integration client. Mock-only (no real SF API call).
// RAIL-5 (tenant-scoped), RAIL-12 (HIPAA-strip before export), RAIL-10 (hash audit).

const crypto = require('crypto');

const FIELD_MAP_VERSION = 'v1.0';

function applyMapping(obj, side) {
  // side = 'ns->sf' | 'sf->ns'
  if (!obj || typeof obj !== 'object') return obj;
  const strip = ['mrn', 'national_id', 'iqama', 'dob', 'address', 'phone', 'email'];
  const out = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let v = obj[k];
    // HIPAA-strip: any key that looks like PHI MUST be hashed or removed (RAIL-12).
    if (strip.indexOf(k) !== -1) {
      const h = crypto.createHash('sha256');
      h.update(String(v) + '|' + (obj._salt || ''));
      v = 'sha256:' + h.digest('hex').slice(0, 24);
    }
    if (side === 'ns->sf') {
      // map NS -> SF
      if (k === 'firstName') out.FirstName = v;
      else if (k === 'lastName') out.LastName = v;
      else if (k === 'gender') out.NS_Gender__c = v;
      else out[k] = v;
    } else {
      // SF -> NS
      if (k === 'FirstName') out.firstName = v;
      else if (k === 'LastName') out.lastName = v;
      else if (k === 'NS_Gender__c') out.gender = v;
      else out[k] = v;
    }
  }
  out._mappingVersion = FIELD_MAP_VERSION;
  return out;
}

function newSalesforceClient(opts) {
  opts = opts || {};
  const mock = opts.mock !== false;
  const baa = opts.baa || null;
  const log = [];
  let head = 'GENESIS';

  function hash(payload) {
    const h = crypto.createHash('sha256');
    h.update(String(head));
    h.update('|');
    h.update(JSON.stringify(payload));
    const digest = h.digest('hex');
    head = digest;
    return digest;
  }

  function ensureBAA(tenantId, vendor) {
    if (!baa || typeof baa._has !== 'function') {
      return { ok: false, error: 'BAA_MISSING' };
    }
    if (!baa._has(tenantId, vendor || 'salesforce')) {
      return { ok: false, error: 'BAA_REQUIRED' };
    }
    return { ok: true };
  }

  function connect(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.instanceUrl || !ctx.accessToken) return { ok: false, error: 'FIELD_REQUIRED' };
    const baaCheck = ensureBAA(ctx.tenantId, 'salesforce');
    if (!baaCheck.ok) return baaCheck;
    const payload = {
      op: 'connect',
      tenantId: ctx.tenantId,
      instanceUrl: ctx.instanceUrl,
      // access token never stored or returned in full (RAIL-12)
      tokenFingerprint: crypto.createHash('sha256').update(String(ctx.accessToken)).digest('hex').slice(0, 12),
      ts: new Date().toISOString(),
      mock: mock
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    return { ok: true, tenantId: ctx.tenantId, instanceUrl: ctx.instanceUrl, hash: h, mock: mock };
  }

  function upsertContact(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.contact || typeof ctx.contact !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
    const mapped = applyMapping(ctx.contact, 'ns->sf');
    const payload = {
      op: 'upsertContact',
      tenantId: ctx.tenantId,
      contact: mapped,
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    const id = '003' + crypto.randomBytes(6).toString('hex').toUpperCase();
    return { ok: true, tenantId: ctx.tenantId, sfId: id, mappingVersion: FIELD_MAP_VERSION, hash: h };
  }

  function upsertAccount(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.account || typeof ctx.account !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
    const mapped = applyMapping(ctx.account, 'ns->sf');
    const payload = {
      op: 'upsertAccount',
      tenantId: ctx.tenantId,
      account: mapped,
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    const id = '001' + crypto.randomBytes(6).toString('hex').toUpperCase();
    return { ok: true, tenantId: ctx.tenantId, sfId: id, mappingVersion: FIELD_MAP_VERSION, hash: h };
  }

  function createOpportunity(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.opp || typeof ctx.opp !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
    const mapped = applyMapping(ctx.opp, 'ns->sf');
    const payload = {
      op: 'createOpportunity',
      tenantId: ctx.tenantId,
      opp: mapped,
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    const id = '006' + crypto.randomBytes(6).toString('hex').toUpperCase();
    return { ok: true, tenantId: ctx.tenantId, sfId: id, mappingVersion: FIELD_MAP_VERSION, hash: h };
  }

  function query(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    if (!ctx.soql || typeof ctx.soql !== 'string') return { ok: false, error: 'FIELD_REQUIRED' };
    // tenantGuard: ensure soql touches THIS tenant only (RAIL-5)
    if (ctx.soql.indexOf("TenantId__c='" + ctx.tenantId + "'") === -1) {
      return { ok: false, error: 'CROSS_TENANT_QUERY_REJECTED' };
    }
    const payload = {
      op: 'query',
      tenantId: ctx.tenantId,
      soql: ctx.soql,
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    // Mock result set
    return {
      ok: true,
      tenantId: ctx.tenantId,
      totalSize: 0,
      records: [],
      hash: h
    };
  }

  function sync(ctx) {
    if (!ctx || !ctx.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
    const since = ctx.since || null;
    const payload = {
      op: 'sync',
      tenantId: ctx.tenantId,
      since: since,
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    return {
      ok: true,
      tenantId: ctx.tenantId,
      since: since,
      pushed: { contacts: 0, accounts: 0, opps: 0 },
      pulled: { contacts: 0, accounts: 0, opps: 0 },
      hash: h
    };
  }

  function webhook(ctx) {
    if (!ctx || !ctx.event || typeof ctx.event !== 'object') return { ok: false, error: 'FIELD_REQUIRED' };
    const tenantId = ctx.event.TenantId__c || null;
    const payload = {
      op: 'webhook',
      tenantId: tenantId,
      type: ctx.event.type || 'unknown',
      ts: new Date().toISOString()
    };
    const h = hash(payload);
    log.push(Object.assign({}, payload, { hash: h }));
    return { ok: true, accepted: true, tenantId: tenantId, hash: h };
  }

  return {
    FIELD_MAP_VERSION: FIELD_MAP_VERSION,
    connect: connect,
    upsertContact: upsertContact,
    upsertAccount: upsertAccount,
    createOpportunity: createOpportunity,
    query: query,
    sync: sync,
    webhook: webhook,
    _log: function () { return log; },
    _head: function () { return head; }
  };
}

module.exports = {
  newSalesforceClient: newSalesforceClient,
  SalesforceClient: newSalesforceClient,
  FIELD_MAP_VERSION: FIELD_MAP_VERSION,
  _applyMapping: applyMapping
};
