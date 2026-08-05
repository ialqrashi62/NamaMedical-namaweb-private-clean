'use strict';
// RBAC middleware factory. Refuses requests without the required role on
// `req.context.roles`. Replaces the legacy requireRole() pattern.

function rbacGuard(opts) {
  if (!opts || !opts.role) throw new Error('ROLE_REQUIRED');
  const required = opts.role;
  const scopes = opts.scopes || [];   // optional list of accepted roles
  const roles = Array.isArray(opts.roles) ? opts.roles : [required];

  return function check(req, res, next) {
    const t = req.context && req.context.tenantId;
    if (!t) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'tenant context missing' });
    const ctxRoles = (req.context && req.context.roles) || [];
    const hasAny = roles.some(r => ctxRoles.indexOf(r) >= 0);
    if (!hasAny) return res.status(403).json({ error: 'FORBIDDEN', required: roles.join(','), tenantId: t });
    // Optional scope: each entry must be in ctxRoles when required
    for (const sc of scopes) {
      if (ctxRoles.indexOf(sc) < 0) {
        return res.status(403).json({ error: 'MISSING_SCOPE', scope: sc });
      }
    }
    next();
  };
}

// Demo/claim extraction: useful for tests
function attachContext(claims) {
  return function (req, _res, next) {
    req.context = req.context || {};
    req.context.tenantId = claims.tenantId;
    req.context.roles = claims.roles || [];
    req.context.providerId = claims.providerId;
    next();
  };
}

module.exports = { rbacGuard, attachContext };
