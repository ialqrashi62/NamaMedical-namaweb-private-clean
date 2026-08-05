'use strict';
// lib/bi/storage.js
// P27 — tenant-scoped Power BI workspace mapping. In-memory, pure JS.
// Keeps a strict tenantId -> { workspaceIds[] } map so a BI route can
// refuse to enumerate workspaces for any tenant the caller doesn't own
// (RAIL-5 + fail-closed RAIL-11).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BIStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function newBIStorage() {
    // tenantId -> { workspaces: [{ workspaceId, name, role }] }
    const _byTenant = Object.create(null);

    function _gid(tenantId) {
      if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('TENANT_REQUIRED');
      }
      return String(tenantId);
    }

    function attach({ tenantId, workspaceId, name, role }) {
      const tid = _gid(tenantId);
      if (!workspaceId || typeof workspaceId !== 'string') {
        return { ok: false, error: 'FIELD_REQUIRED', msg: 'workspaceId is required' };
      }
      if (!_byTenant[tid]) _byTenant[tid] = { workspaces: [] };
      // De-dup by workspaceId.
      const exists = _byTenant[tid].workspaces.some(function (w) { return w.workspaceId === workspaceId; });
      if (!exists) {
        _byTenant[tid].workspaces.push({
          workspaceId: workspaceId,
          name: name || null,
          role: role || 'Viewer',
          attachedAt: Date.now(),
        });
      }
      return { ok: true, tenantId: tid, workspaceId: workspaceId };
    }

    function detach({ tenantId, workspaceId }) {
      const tid = _gid(tenantId);
      const w = _byTenant[tid];
      if (!w) return { ok: false, error: 'NOT_FOUND', msg: 'Tenant has no workspaces' };
      const before = w.workspaces.length;
      w.workspaces = w.workspaces.filter(function (x) { return x.workspaceId !== workspaceId; });
      return { ok: true, removed: before - w.workspaces.length };
    }

    function listWorkspaces({ tenantId } = {}) {
      const tid = _gid(tenantId);
      const w = _byTenant[tid] || { workspaces: [] };
      return { ok: true, tenantId: tid, workspaces: w.workspaces.slice() };
    }

    function hasWorkspace({ tenantId, workspaceId }) {
      const tid = _gid(tenantId);
      const w = _byTenant[tid];
      if (!w) return false;
      return w.workspaces.some(function (x) { return x.workspaceId === workspaceId; });
    }

    function get({ tenantId, workspaceId }) {
      const tid = _gid(tenantId);
      const w = _byTenant[tid];
      if (!w) return { ok: false, error: 'NOT_FOUND', msg: 'Tenant not found' };
      const found = w.workspaces.find(function (x) { return x.workspaceId === workspaceId; });
      if (!found) return { ok: false, error: 'NOT_FOUND', msg: 'Workspace not attached' };
      return { ok: true, tenantId: tid, workspace: found };
    }

    return {
      attach: attach,
      detach: detach,
      listWorkspaces: listWorkspaces,
      hasWorkspace: hasWorkspace,
      get: get,
    };
  }

  return { newBIStorage: newBIStorage };
});
