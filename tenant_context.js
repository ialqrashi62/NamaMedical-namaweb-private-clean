const { AsyncLocalStorage } = require('async_hooks');
const tenantStore = new AsyncLocalStorage();

function runWithTenant(context, fn) {
  return tenantStore.run(context || {}, fn);
}

function getCurrentTenantId() {
  const s = tenantStore.getStore();
  return s && s.tenantId ? s.tenantId : null;
}

module.exports = {
  tenantStore,
  runWithTenant,
  getCurrentTenantId
};
