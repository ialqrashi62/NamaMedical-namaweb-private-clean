'use strict';
// AuthProbe — batch test endpoints with admin session.
const http = require('http');
const TestSession = require('./testSession');

const AuthProbe = {};

AuthProbe.probe = async function ({ host = 'http://127.0.0.1:3000', user = 'admin', password = 'admin', tenantId = 'demo', endpoints = [] } = {}) {
  let session;
  try {
    session = await TestSession.login({ host, user, password, tenantId });
  } catch (e) {
    return { ok: 0, authFail: 0, serverErr: 0, other: 0, endpoints: [], error: 'LOGIN_FAILED:' + e.message };
  }
  const cookies = session.cookies;
  const out = [];
  for (const ep of endpoints) {
    try {
      const r = await AuthProbe._fetch(host + ep.path, ep.method || 'GET', cookies, ep.body || null);
      out.push({ path: ep.path, method: ep.method || 'GET', status: r.status });
    } catch (e) {
      out.push({ path: ep.path, method: ep.method || 'GET', error: e.message });
    }
  }
  const counts = { ok: 0, authFail: 0, serverErr: 0, other: 0 };
  for (const r of out) {
    if (!r.status) counts.other++;
    else if (r.status >= 200 && r.status < 300) counts.ok++;
    else if (r.status === 401 || r.status === 403) counts.authFail++;
    else if (r.status >= 500) counts.serverErr++;
    else counts.other++;
  }
  return Object.assign(counts, { endpoints: out, sessionStatus: session.status });
};

AuthProbe._fetch = function (urlStr, method, cookies, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + (url.search || ''),
      method,
      headers: { Cookie: cookies },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
};

AuthProbe.report = function (r) {
  if (!r) return 'invalid';
  if (r.error) return 'ERR: ' + r.error;
  return `ok=${r.ok} authFail=${r.authFail} serverErr=${r.serverErr} other=${r.other}`;
};

module.exports = AuthProbe;