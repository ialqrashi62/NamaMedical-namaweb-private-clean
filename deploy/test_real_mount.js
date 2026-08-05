// Test the EXACT pattern used in autowire genMount
try {
  const express = require('express');
  const app = express();
  const r = require('./routes/pgx');
  const i = r.newPgxRouter();
  // Same as genMount
  const _base = '/api/v4/pgx';
  const _cloned = express.Router();
  i.stack.forEach((layer) => {
    if (!layer.route) return;
    const methods = Object.keys(layer.route.methods);
    let p = layer.route.path;
    if (p.indexOf(_base) === 0) {
      p = p.slice(_base.length) || '/';
    }
    if (p.charAt(0) !== '/') p = '/' + p;
    methods.forEach((m) => {
      if (m === '_all') return;
      _cloned[m](p, layer.handle);
    });
  });
  // The auth guard
  function _guard(req, res, next) {
    if (!req.tenantId) return res.status(401).json({ error: 'TENANT_REQUIRED' });
    if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    next();
  }
  app.use(_base, _cloned); // no _ctx
  // Test
  const srv = app.listen(3210, () => {
    const http = require('http');
    http.get('http://127.0.0.1:3210/api/v4/pgx/pairs', (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        console.log('no ctx:', res.statusCode, d.slice(0, 200));
        srv.close();
        process.exit(0);
      });
    });
  });
} catch (e) {
  console.log('ERR:', e.message);
}