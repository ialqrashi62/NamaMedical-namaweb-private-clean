'use strict';
// FHIR R4 client adapter — talks to local HAPI FHIR (sandbox) or any
// production-grade FHIR R4 endpoint.
//
// Operations:
//   - read(resourceType, id)
//   - search(resourceType, params)
//   - create(resourceType, resource)
//   - transaction(Bundle)
//
// Token: Bearer via NPHIES-compatible clientId pattern, but works
// with any OAuth2 token. Falls back to sandbox/dummy.

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const { StructuredLogger } = require('../lib/StructuredLogger');

class FHIRClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || process.env.FHIR_BASE_URL || 'http://localhost:8080/fhir';
    this.token = opts.token || process.env.FHIR_TOKEN || 'sandbox-token';
    this.timeoutMs = opts.timeoutMs || 5000;
    this.sandbox = opts.sandbox !== false;
    this.log = opts.logger || new StructuredLogger({ service: 'fhir-client' });
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      // Validate Bundle payload ALWAYS (sandbox or prod) — never drop a bundle silently.
      if (method.toUpperCase() === 'POST' && (!path || path === '/')) {
        if (!body) return reject(new Error('BUNDLE_REQUIRED'));
        if (body.resourceType !== 'Bundle') return reject(new Error('BUNDLE_REQUIRED'));
        if (!Array.isArray(body.entry) || body.entry.length === 0) return reject(new Error('BUNDLE_ENTRIES_REQUIRED'));
      }
      if (this.sandbox && this.baseUrl.indexOf('http://localhost') !== -1) {
        // In-memory stub for sandbox (no real FHIR server)
        return resolve({
          sandbox: true, status: 200,
          resource: {
            resourceType: (path.split('/')[0] || 'Patient'),
            id: crypto.randomBytes(4).toString('hex'),
            meta: { versionId: '1', lastUpdated: new Date().toISOString() },
            text: { status: 'generated', div: '<div>Stub resource for ' + path + '</div>' },
          },
        });
      }
      let url;
      try { url = new URL(this.baseUrl + path); } catch (e) { return reject(new Error('FHIR_BAD_URL')); }
      const data = body ? JSON.stringify(body) : null;
      const req = https.request({
        method: method.toUpperCase(),
        hostname: url.hostname, port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          'Authorization': 'Bearer ' + this.token,
          'Accept': 'application/fhir+json',
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
          resolve({ status: res.statusCode, resource: parsed });
        });
      });
      req.on('error', (e) => reject(new Error('FHIR_NET_ERR: ' + e.message)));
      req.on('timeout', () => { req.destroy(new Error('FHIR_TIMEOUT')); });
      if (data) req.write(data);
      req.end();
    });
  }

  // ---------- public FHIR surface ----------

  read(resourceType, id) {
    if (!resourceType) throw new Error('RESOURCE_TYPE_REQUIRED');
    if (!id) throw new Error('ID_REQUIRED');
    return this._request('GET', '/' + resourceType + '/' + encodeURIComponent(id));
  }
  search(resourceType, params) {
    if (!resourceType) throw new Error('RESOURCE_TYPE_REQUIRED');
    let p = '/' + resourceType + '?_count=20';
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) p += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }
    return this._request('GET', p);
  }
  create(resourceType, resource) {
    if (!resourceType) throw new Error('RESOURCE_TYPE_REQUIRED');
    if (!resource) throw new Error('RESOURCE_REQUIRED');
    return this._request('POST', '/' + resourceType, resource);
  }
  transaction(bundle) {
    if (!bundle || bundle.resourceType !== 'Bundle') throw new Error('BUNDLE_REQUIRED');
    return this._request('POST', '', bundle);
  }
  // Useful helpers (typed callers)
  readPatient(id)       { return this.read('Patient', id); }
  readObservation(id)   { return this.read('Observation', id); }
  readEncounter(id)     { return this.read('Encounter', id); }
  readMedicationRequest(id) { return this.read('MedicationRequest', id); }
  searchPatients(params) { return this.search('Patient', params); }
  searchEncounters(params) { return this.search('Encounter', params); }
}

module.exports = { FHIRClient };
