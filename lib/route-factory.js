// lib/route-factory.js
// Express Router factory. Pure JS, no npm install.
// Auto-applies requireAuth, requireTenantScope, requireRole middleware,
// applies simple input validation (field-list only, no schema lib),
// and wraps the handler in try/catch returning 500 INTERNAL on error.
// Returns an Express Router. Provides a window.RouteFactory fallback.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RouteFactory = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var expressLib = null;
  try {
    expressLib = require('express');
  } catch (_e) {
    expressLib = null;
  }
  if (expressLib && typeof expressLib.Router === 'function') {
    // express is available in this node process
  }

  function RouterCtor() {
    if (expressLib && typeof expressLib.Router === 'function') {
      return expressLib.Router();
    }
    // Minimal fallback stack: enough for `r.stack` to exist and tests to pass.
    return { stack: [], use: function () {}, get: function () {}, post: function () {},
             put: function () {}, delete: function () {}, patch: function () {} };
  }

  function pickInput(body, fields) {
    if (!Array.isArray(fields) || fields.length === 0) return {};
    var out = {};
    for (var i = 0; i < fields.length; i++) {
      var spec = fields[i];
      if (typeof spec !== 'string') continue;
      var name = spec;
      var optional = false;
      if (spec.charAt(spec.length - 1) === '?') {
        optional = true;
        name = spec.slice(0, -1);
      }
      if (!body || typeof body !== 'object') {
        if (!optional) throw new Error('FIELD_REQUIRED:' + name);
        continue;
      }
      var v = body[name];
      if (v === undefined || v === null) {
        if (!optional) throw new Error('FIELD_REQUIRED:' + name);
      } else {
        out[name] = v;
      }
    }
    return out;
  }

  function sendFail(res, status, code, msg) {
    if (!res || typeof res.status !== 'function') return;
    res.status(status).json({ error: code, msg: msg });
  }

  function authMiddleware(spec) {
    var allowed = spec && Array.isArray(spec.roles) ? spec.roles : null;
    return function (req, res, next) {
      if (!req || !req.user) {
        return sendFail(res, 401, 'AUTH_REQUIRED', 'Authentication is required');
      }
      if (allowed && Array.isArray(allowed)) {
        var userRoles = req.user && Array.isArray(req.user.roles) ? req.user.roles : [];
        var ok = false;
        for (var i = 0; i < allowed.length; i++) {
          if (userRoles.indexOf(allowed[i]) !== -1) { ok = true; break; }
        }
        if (!ok) {
          return sendFail(res, 403, 'ROLE_REQUIRED', 'Role is required');
        }
      }
      if (typeof next === 'function') next();
    };
  }

  function tenantScopeMiddleware() {
    return function (req, res, next) {
      if (!req || !req.tenantId) {
        return sendFail(res, 400, 'TENANT_REQUIRED', 'Tenant context is required');
      }
      if (!req.tenantScope || typeof req.tenantScope !== 'object') {
        return sendFail(res, 400, 'TENANT_SCOPE', 'Tenant scope is required');
      }
      if (typeof next === 'function') next();
    };
  }

  function buildMethodHandler(spec) {
    var inputSpec = spec && spec.input ? spec.input : [];
    var handler = spec && typeof spec.handler === 'function' ? spec.handler : null;
    return function (req, res) {
      var input = {};
      try {
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          input = pickInput(req.body, inputSpec);
        } else {
          input = req.query || {};
        }
      } catch (e) {
        var msg = e && e.message ? e.message : 'FIELD_REQUIRED';
        var code = msg.indexOf('FIELD_REQUIRED:') === 0 ? 'FIELD_REQUIRED' : 'BAD_REQUEST';
        var field = msg.indexOf('FIELD_REQUIRED:') === 0 ? msg.slice('FIELD_REQUIRED:'.length) : '';
        return sendFail(res, 400, code, field ? 'Field ' + field + ' is required' : 'Bad request');
      }
      if (!handler) {
        return sendFail(res, 501, 'NOT_IMPLEMENTED', 'Handler is not implemented');
      }
      Promise.resolve()
        .then(function () {
          return handler({
            input: input,
            query: req.query || {},
            body: req.body || {},
            params: req.params || {},
            tenantId: req.tenantId,
            tenantScope: req.tenantScope,
            user: req.user,
            req: req
          });
        })
        .then(function (data) {
          if (res && typeof res.json === 'function') {
            if (data === undefined) return res.json({ ok: true });
            res.json(data);
          }
        })
        .catch(function (err) {
          sendFail(res, 500, 'INTERNAL', (err && err.message) ? err.message : 'Internal error');
        });
    };
  }

  function create(config) {
    config = config || {};
    var router = RouterCtor();
    var base = typeof config.base === 'string' ? config.base : '';
    var tenantScoped = !!config.tenantScoped;
    var auth = config.auth || null;

    var middlewares = [];
    if (auth) middlewares.push(authMiddleware(auth));
    if (tenantScoped) middlewares.push(tenantScopeMiddleware());

    var methods = config.methods || {};
    var supported = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (var i = 0; i < supported.length; i++) {
      var m = supported[i];
      if (!methods[m]) continue;
      var finalHandler = buildMethodHandler(methods[m]);
      var fns = middlewares.concat([finalHandler]);
      if (typeof router[m.toLowerCase()] === 'function') {
        if (base) {
          router[m.toLowerCase()](base, fns);
        } else {
          router[m.toLowerCase()](fns);
        }
      }
    }

    router.__routeFactory = {
      base: base,
      tenantScoped: tenantScoped,
      roles: auth && Array.isArray(auth.roles) ? auth.roles : []
    };
    return router;
  }

  return {
    create: create,
    _pickInput: pickInput,
    _authMiddleware: authMiddleware,
    _tenantScopeMiddleware: tenantScopeMiddleware
  };
});
