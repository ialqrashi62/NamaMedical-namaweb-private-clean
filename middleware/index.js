'use strict';

// Soft middleware shim. In sandbox mode these return the wrapped
// next() so the engine can exercise the request flow without
// real auth/tenant wiring. Production owners wire these to the
// real `namaweb/middleware/auth.js`, `tenant.js`, etc.

function softPass(req, res, next) { next(); }

function requireAuth() {
  return function (req, res, next) {
    req.auth = req.auth || {};
    req.auth.user = req.auth.user || { id: 'dev-user-' + Math.random().toString(36).slice(2,6), role: 'doctor' };
    req.auth.tenantId = req.headers['x-tenant-id'] || 'dev-tenant';
    next();
  };
}

function requireTenantScope() {
  return function (req, res, next) {
    res.setHeader && res.setHeader('X-Tenant-Id', (req.auth && req.auth.tenantId) || '');
    next();
  };
}

function requireRole(role) {
  return function (req, res, next) {
    // sandbox: trust the role header
    (req.auth && (req.auth.user = req.auth.user || {})).role = (req.headers['x-user-role'] || 'doctor');
    next();
  };
}

function validateBody(name) {
  return softPass;
}

module.exports = {
  requireAuth,
  requireTenantScope,
  requireRole,
  validateBody,
  default: module.exports,
};
