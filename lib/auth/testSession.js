'use strict';
// Auth test session — login + cookie session for probe.
const http = require('http');
const querystring = require('querystring');

const TestSession = {};

TestSession.login = function ({ host = 'http://127.0.0.1:3000', user = 'admin', password = 'admin', tenantId = 'demo' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(host + '/api/login');
    const data = querystring.stringify({ username: user, password, tenantId });
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ cookies, body, status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

module.exports = TestSession;