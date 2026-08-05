// Mini test: simulate the actual production flow
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

// load same modules
const r = require('../routes/pgx');
const i = r.newPgxRouter();
console.log('pgx inst:', typeof i, i.stack.length);

// Simulate genMount output
const _base = '/api/v4/pgx';
const _ctx = function (req, _res, next) {
  if (!req.tenantId) req.tenantId = 'tnt-demo';
  next();
};
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
app.use(_base, _ctx, _cloned);

// Catch-all
app.use((req, res) => res.status(404).json({ error: 'catch-all:' + req.path }));

app.listen(3210, () => {
  const http = require('http');
  http.get('http://127.0.0.1:3210/api/v4/pgx/pairs', (res) => {
    let d = '';
    res.on('data', (c) => d += c);
    res.on('end', () => {
      console.log('status:', res.statusCode, d.slice(0, 200));
      process.exit(0);
    });
  });
});