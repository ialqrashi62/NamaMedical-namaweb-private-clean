// lib/dev-ctx.js
// Dev/test tenant context injector — matches the autowire `_ctx` pattern.
// In production this is a no-op when behind requireAuth (real session wins);
// in dev/test/sandbox it accepts x-tenant-id + x-user-id + x-user-role headers.
// RAIL-5: tenant still required; RAIL-13: role still checked downstream.
'use strict';

module.exports = function devCtx(req, _res, next) {
  if (!req.tenantId) {
    const h = req.headers['x-tenant-id'];
    if (h) req.tenantId = String(h);
  }
  if (!req.user) {
    const uid = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'doctor';
    if (uid) {
      req.user = { id: String(uid), roles: [String(role)], display_name: String(uid) };
      req.auth = { user: req.user };
    }
  }
  // Set a default tenant + scope so dev probes don't crash (matches autowire `_ctx`)
  if (!req.tenantId) req.tenantId = 'tnt-demo';
  if (!req.tenantScope) req.tenantScope = { id: req.tenantId, source: 'dev-ctx' };
  // Project tenant into req.body so RouteFactory body validators see it (RAIL-5).
  // Production callers set req.body.tenantId explicitly; this only fills when missing.
  if (req.body && typeof req.body === 'object' && !req.body.tenantId && req.tenantId) {
    req.body.tenantId = req.tenantId;
  }
  next();
};