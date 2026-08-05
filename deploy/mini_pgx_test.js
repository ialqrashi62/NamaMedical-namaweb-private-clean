// mini-test: replicate exact genMount code from autowire.js
const express = require('express');
const http = require('http');
const app = express();

// Mimic autowire pattern (level 3 path)
const pgx = require('../routes/pgx');  // {newPgxRouter: function}
console.log('pgx module:', typeof pgx, Object.keys(pgx));

var _m = pgx;
var _express = require('express');
var _base = '/api/v4/pgx';

function _ctx(req, _res, next) {
  if (!req.tenantId) req.tenantId = req.headers['x-tenant-id'] || 'tnt-demo';
  if (!req.user) {
    var uid = req.headers['x-user-id'];
    var role = req.headers['x-user-role'] || 'doctor';
    var userObj = { id: uid || 'dev-doctor', roles: [role], display_name: uid || 'dev-doctor' };
    req.user = userObj; req.auth = { user: userObj };
  }
  next();
}

function _doMount(target) {
  if (!target || typeof target !== 'function' || !target.stack) return false;
  console.log('doMount: target stack length:', target.stack.length);
  var _cloned = _express.Router();
  target.stack.forEach(function (layer) {
    if (!layer.route) return;
    var methods = Object.keys(layer.route.methods);
    var p = layer.route.path;
    console.log('  layer path:', p, 'methods:', methods);
    if (p.indexOf(_base) === 0) {
      p = p.slice(_base.length) || '/';
    }
    if (p.charAt(0) !== '/') p = '/' + p;
    methods.forEach(function (m) {
      if (m === '_all') return;
      var handler = layer.handle;
      if (layer.route.stack && layer.route.stack.length) {
        handler = function (req, res, next) {
          var i = 0;
          function run(err) {
            if (err) return next(err);
            var l = layer.route.stack[i++];
            if (!l) return next();
            l.handle(req, res, run);
          }
          run();
        };
      }
      _cloned[m](p, handler);
    });
  });
  console.log('cloned stack length:', _cloned.stack.length);
  app.use(_base, _ctx, _cloned);
  return true;
}

// Level 3: factory constructor newXxx*
var _ctor = null;
for (var _k in _m) {
  if (typeof _m[_k] === 'function' && /^new/i.test(_k)) {
    _ctor = _m[_k]; break;
  }
}
if (_ctor) {
  console.log('ctor found:', _ctor.name);
  var _opts = {};
  var _inst = (_ctor.prototype && Object.keys(_ctor.prototype).length) ? new _ctor(_opts) : _ctor(_opts);
  console.log('inst type:', typeof _inst, 'has stack:', !!(typeof _inst === 'function' && _inst.stack), 'stack len:', _inst.stack && _inst.stack.length);
  if (_inst) {
    var _mw = (_inst.router || _inst.app || _inst.handle) || (typeof _inst === 'function' && _inst.stack ? _inst : null);
    if (_mw) {
      _doMount(_mw);
    }
  }
}

// Catch-all
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const srv = app.listen(3941, () => {
  http.get('http://127.0.0.1:3941/api/v4/pgx/pairs', (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      console.log('status:', r.statusCode, 'body:', d);
      srv.close();
    });
  });
});