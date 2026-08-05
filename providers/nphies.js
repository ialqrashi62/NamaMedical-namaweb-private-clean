'use strict';
// NPHIES Adapter — Saudi national insurance gateway.
// Features:
//   - eligibilityCheck
//   - priorAuthRequest
//   - bundleClaim (Bundle resource submission)
//   - claimStatus
// All calls require NPHIES_CLIENT_ID + NPHIES_CLIENT_SECRET in .env.
// Sandbox mode uses dummy endpoint + logs locally.

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const { StructuredLogger } = require('../lib/StructuredLogger');

class NPHIESAdapter {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || process.env.NPHIES_BASE_URL || 'https://nphies.sa/api/v1';
    this.clientId = opts.clientId || process.env.NPHIES_CLIENT_ID || 'sandbox-client';
    this.clientSecret = opts.clientSecret || process.env.NPHIES_CLIENT_SECRET || 'sandbox-secret';
    this.sandbox = opts.sandbox !== false;
    this.timeoutMs = opts.timeoutMs || 5000;
    this.log = opts.logger || new StructuredLogger({ service: 'nphies-adapter' });
    this.chainHead = 'NPHIES_' + crypto.randomBytes(4).toString('hex');
  }

  // ---------- HMAC-style signature (callers send Authorization: Bearer + Signature header) ----------
  _sign(method, path, body) {
    const payload = `${method.toUpperCase()}\n${path}\n${JSON.stringify(body || {})}\n${this.chainHead}`;
    const h = crypto.createHmac('sha256', this.clientSecret);
    h.update(payload);
    this.chainHead = h.digest('hex').slice(0, 16);
    return h.digest('hex');
  }

  // ---------- transport ----------
  _request(method, path, body, idempotencyKey) {
    return new Promise((resolve, reject) => {
      if (this.sandbox) {
        // Sandbox never hits NPHIES — return deterministic stub
        const stub = {
          ok: true, sandbox: true, method, path,
          status: 202, correlationId: 'sb-' + crypto.randomBytes(6).toString('hex'),
          bundleId: 'B-' + crypto.randomBytes(4).toString('hex'),
          issuedAt: new Date().toISOString(),
          message: 'NPHIES sandbox accepted; idempotencyKey=' + (idempotencyKey || 'none'),
        };
        return resolve(stub);
      }
      let url;
      try { url = new URL(this.baseUrl + path); } catch (e) { return reject(new Error('NPHIES_BAD_URL')); }
      const data = body ? JSON.stringify(body) : null;
      const req = https.request({
        method: method.toUpperCase(),
        hostname: url.hostname, port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          'Authorization': 'Bearer ' + this.clientId,
          'X-Idempotency-Key': idempotencyKey || ('auto-' + crypto.randomBytes(8).toString('hex')),
          'X-Signature': this._sign(method, path, body),
          'Content-Type': 'application/fhir+json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: this.timeoutMs,
      });
      let buf = '';
      req.on('response', (res) => {
        res.setEncoding('utf8');
        res.on('data', (c) => buf += c);
        res.on('end', () => {
          let parsed = buf;
          try { parsed = JSON.parse(buf); } catch (e) { /* keep raw */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', (e) => reject(new Error('NPHIES_NET_ERR: ' + e.message)));
      req.on('timeout', () => { req.destroy(new Error('NPHIES_TIMEOUT')); });
      if (data) req.write(data);
      req.end();
    });
  }

  // ---------- public API ----------

  // FHIR Coverage/$eligibility-check style call
  async eligibilityCheck({ tenantId, patient, coverage }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!patient) throw new Error('PATIENT_REQUIRED');
    if (!coverage) throw new Error('COVERAGE_REQUIRED');
    const req = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'patient', valueReference: { reference: patient } },
        { name: 'coverage', valueReference: { reference: coverage } },
        { name: 'provider', valueString: 'nama-medical' },
        { name: 'tenantId', valueString: tenantId },
      ],
    };
    const resp = await this._request('POST', '/Coverage/eligibility-check', req, 'elig-' + tenantId);
    this.log.info('nphies.eligibility', { tenantId, status: resp.status, sandbox: resp.sandbox });
    return resp;
  }

  // FHIR Claim/$submit with attached Bundle of supporting docs
  async bundleClaim({ tenantId, claim, supporting = [], idempotencyKey }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!claim) throw new Error('CLAIM_REQUIRED');
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        { resource: claim, request: { method: 'POST', url: 'Claim' } },
        ...supporting.map(r => ({ resource: r, request: { method: 'POST', url: r.resourceType } })),
      ],
    };
    const idKey = idempotencyKey || ('claim-' + tenantId + '-' + crypto.randomBytes(6).toString('hex'));
    const resp = await this._request('POST', '/Claim/$submit', bundle, idKey);
    this.log.info('nphies.bundleClaim', { tenantId, status: resp.status, sandbox: resp.sandbox });
    return resp;
  }

  // FHIR Claim/$prior-auth
  async priorAuthRequest({ tenantId, claim, idempotencyKey }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!claim) throw new Error('CLAIM_REQUIRED');
    const resp = await this._request('POST', '/Claim/$prior-auth', claim, idempotencyKey || ('pa-' + tenantId));
    this.log.info('nphies.priorAuth', { tenantId, status: resp.status, sandbox: resp.sandbox });
    return resp;
  }

  // FHIR Claim/$claim-status
  async claimStatus({ tenantId, claimId }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    if (!claimId) throw new Error('CLAIM_ID_REQUIRED');
    const resp = await this._request('GET', '/Claim/' + encodeURIComponent(claimId) + '/$status', null, 'st-' + claimId);
    this.log.info('nphies.claimStatus', { tenantId, claimId, status: resp.status, sandbox: resp.sandbox });
    return resp;
  }
}

module.exports = { NPHIESAdapter };
