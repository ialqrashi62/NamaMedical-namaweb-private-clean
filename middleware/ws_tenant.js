'use strict';
// WebSocket tenant scope guard. Validates that the upgrade request carries a
// tenant context (header or query). Used by the realtime bus to refuse
// cross-tenant subscriptions.

function wsTenantGuard(opts) {
  const extracted = opts.context || {};
  return function guard(req, socket, head) {
    const t = req.headers['x-tenant'] || new URL(req.url, 'http://x').searchParams.get('tenantId');
    if (!t) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    if (extracted.tenantId && extracted.tenantId !== t) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    req.context = req.context || {};
    req.context.tenantId = t;
    opts.onAccept && opts.onAccept(req, socket, head);
  };
}

module.exports = { wsTenantGuard };
