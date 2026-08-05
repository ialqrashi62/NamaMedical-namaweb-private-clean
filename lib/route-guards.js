// lib/route-guards.js
// Centralized API guard helpers. Pure JS, no npm install.
// All guards return true on pass, false on fail.
// Tenant-scoped, fail-closed, no PHI in error messages.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RouteGuards = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function fail(res, code, msg, status) {
    if (!res || typeof res.status !== 'function' || typeof res.json !== 'function') {
      return false;
    }
    var s = status || 400;
    if (code === 'AUTH_REQUIRED') s = 401;
    else if (code === 'ROLE_REQUIRED') s = 403;
    res.status(s).json({ error: code, msg: msg });
    return false;
  }

  function requireTenant(req, res) {
    if (!req || !req.tenantId) {
      return fail(res, 'TENANT_REQUIRED', 'Tenant context is required');
    }
    return true;
  }

  function requireAuth(req, res) {
    if (!req || !req.user) {
      return fail(res, 'AUTH_REQUIRED', 'Authentication is required');
    }
    return true;
  }

  function requireRole(req, res, allowed) {
    if (!req || !req.user || !Array.isArray(req.user.roles) || !Array.isArray(allowed)) {
      return fail(res, 'ROLE_REQUIRED', 'Role is required');
    }
    var hasRole = false;
    for (var i = 0; i < allowed.length; i++) {
      if (req.user.roles.indexOf(allowed[i]) !== -1) {
        hasRole = true;
        break;
      }
    }
    if (!hasRole) {
      return fail(res, 'ROLE_REQUIRED', 'Role is required');
    }
    return true;
  }

  function requireField(req, res, field) {
    if (!req || !field) {
      return fail(res, 'FIELD_REQUIRED', 'Field is required');
    }
    var v = req[field];
    if (v === undefined || v === null || v === '') {
      return fail(res, 'FIELD_REQUIRED', 'Field ' + field + ' is required');
    }
    return true;
  }

  function requireTenantScope(req, res) {
    if (!req) {
      return fail(res, 'TENANT_SCOPE', 'Tenant scope is required');
    }
    var scope = req.tenantScope || req.scope;
    if (!scope || typeof scope !== 'object') {
      return fail(res, 'TENANT_SCOPE', 'Tenant scope is required');
    }
    return true;
  }

  function tenantErrorCode(field) {
    if (!field || typeof field !== 'string') {
      return 'TENANT_';
    }
    return 'TENANT_' + field.toUpperCase();
  }

  return {
    fail: fail,
    requireTenant: requireTenant,
    requireAuth: requireAuth,
    requireRole: requireRole,
    requireField: requireField,
    requireTenantScope: requireTenantScope,
    tenantErrorCode: tenantErrorCode
  };
});
