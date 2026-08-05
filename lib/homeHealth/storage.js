// lib/homeHealth/storage.js
// In-memory slot + visit store for Home Health Scheduling (P19).
// Tenant-scoped, no PHI, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeHealthStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function _id(prefix) {
    var r = Math.floor(Math.random() * 0xffffff).toString(16);
    var t = Date.now().toString(16);
    return (prefix || 'hh') + '-' + t + '-' + r;
  }

  function _nowIso() { return new Date().toISOString(); }

  function HomeHealthStorage(opts) {
    opts = opts || {};
    this._slotsByTenant = opts.slotsByTenant || {};
    this._visitsByTenant = opts.visitsByTenant || {};
    this._offlineQueueByTenant = opts.offlineQueueByTenant || {};
  }

  HomeHealthStorage.prototype.listSlots = function (tenantId) {
    if (!tenantId) return [];
    var slots = Object.values(this._slotsByTenant[tenantId] || {});
    slots.sort(function (a, b) { return (a.date + a.startTime).localeCompare(b.date + b.startTime); });
    return slots;
  };

  HomeHealthStorage.prototype.getSlot = function (slotId) {
    var tenants = Object.keys(this._slotsByTenant);
    for (var i = 0; i < tenants.length; i++) {
      var t = tenants[i];
      if (this._slotsByTenant[t][slotId]) return this._slotsByTenant[t][slotId];
    }
    return null;
  };

  HomeHealthStorage.prototype.upsertSlot = function (slot) {
    if (!slot || !slot.tenantId || !slot.slotId) return null;
    if (!this._slotsByTenant[slot.tenantId]) this._slotsByTenant[slot.tenantId] = {};
    this._slotsByTenant[slot.tenantId][slot.slotId] = slot;
    return slot;
  };

  HomeHealthStorage.prototype.removeSlot = function (slotId) {
    var tenants = Object.keys(this._slotsByTenant);
    for (var i = 0; i < tenants.length; i++) {
      var t = tenants[i];
      if (this._slotsByTenant[t][slotId]) {
        delete this._slotsByTenant[t][slotId];
        return true;
      }
    }
    return false;
  };

  HomeHealthStorage.prototype.listVisits = function (tenantId) {
    if (!tenantId) return [];
    var visits = Object.values(this._visitsByTenant[tenantId] || {});
    visits.sort(function (a, b) { return (a.date + a.startTime).localeCompare(b.date + b.startTime); });
    return visits;
  };

  HomeHealthStorage.prototype.getVisit = function (visitId) {
    var tenants = Object.keys(this._visitsByTenant);
    for (var i = 0; i < tenants.length; i++) {
      var t = tenants[i];
      if (this._visitsByTenant[t][visitId]) return this._visitsByTenant[t][visitId];
    }
    return null;
  };

  HomeHealthStorage.prototype.upsertVisit = function (visit) {
    if (!visit || !visit.tenantId || !visit.visitId) return null;
    if (!this._visitsByTenant[visit.tenantId]) this._visitsByTenant[visit.tenantId] = {};
    this._visitsByTenant[visit.tenantId][visit.visitId] = visit;
    return visit;
  };

  HomeHealthStorage.prototype.appendOffline = function (tenantId, entry) {
    if (!tenantId) return null;
    if (!this._offlineQueueByTenant[tenantId]) this._offlineQueueByTenant[tenantId] = [];
    entry.queuedAt = entry.queuedAt || _nowIso();
    this._offlineQueueByTenant[tenantId].push(entry);
    return entry;
  };

  HomeHealthStorage.prototype.listOffline = function (tenantId) {
    if (!tenantId) return [];
    return (this._offlineQueueByTenant[tenantId] || []).slice();
  };

  HomeHealthStorage.prototype.clearOffline = function (tenantId) {
    if (!tenantId) return false;
    if (!this._offlineQueueByTenant[tenantId]) return false;
    delete this._offlineQueueByTenant[tenantId];
    return true;
  };

  function newHomeHealthStorage(opts) { return new HomeHealthStorage(opts); }

  return {
    HomeHealthStorage: HomeHealthStorage,
    newHomeHealthStorage: newHomeHealthStorage,
    _id: _id
  };
});
