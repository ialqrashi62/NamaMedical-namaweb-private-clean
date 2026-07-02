const { runWithTenant } = require('./tenant_context');

function tenantMiddleware(req, res, next) {
  // Extract tenant ID from request headers
  let tenantId = req.headers['x-tenant-id'] || req.headers['x-tenant-id-key'];
  
  // Fallback to host-based subdomain if header is not present
  if (!tenantId && req.headers.host) {
    const hostParts = req.headers.host.split('.');
    if (hostParts.length > 2) {
      const subdomain = hostParts[0];
      // If subdomain is not 'www' or a common system subdomain, check if it maps to a tenant ID
      // For development, if subdomain is a number, treat it as the tenant ID.
      if (subdomain !== 'www' && !isNaN(subdomain)) {
        tenantId = parseInt(subdomain);
      }
    }
  }

  // Parse to integer or default to 1 (development fallback)
  const parsedTenantId = parseInt(tenantId) || 1;

  // Wrap request execution in the AsyncLocalStorage context
  runWithTenant({ tenantId: parsedTenantId }, () => {
    next();
  });
}

module.exports = tenantMiddleware;
