// lib/homeHealth/scheduler.js
// Home Visit Scheduler (P19).
// Slots → Booking → GPS check-in (200m radius default) → Complete → Nurse route.
// Uses HomeHealthStorage (in-memory). Pure JS, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HomeVisitScheduler = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var Storage = require('./storage');

  var _nowIso = function () { return new Date().toISOString(); };

  var DEFAULT_RADIUS_METERS = 200;

  function _id(prefix) {
    var r = Math.floor(Math.random() * 0xffffff).toString(16);
    var t = Date.now().toString(16);
    return (prefix || 'hh') + '-' + t + '-' + r;
  }

  function _toRad(d) {
    if (typeof d !== 'number' || !isFinite(d)) return 0;
    return (d * Math.PI) / 180;
  }

  function _haversineMeters(a, b) {
    if (!a || !b) return Infinity;
    if (typeof a.lat !== 'number' || typeof a.lng !== 'number') return Infinity;
    if (typeof b.lat !== 'number' || typeof b.lng !== 'number') return Infinity;
    var R = 6371000;
    var dLat = _toRad(b.lat - a.lat);
    var dLng = _toRad(b.lng - a.lng);
    var lat1 = _toRad(a.lat);
    var lat2 = _toRad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  }

  function _validateHHMM(v) {
    if (typeof v !== 'string') return false;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  }

  function _validateDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function HomeVisitScheduler(opts) {
    opts = opts || {};
    this._storage = opts.storage || Storage.newHomeHealthStorage();
    this._radiusMeters = opts.radiusMeters || DEFAULT_RADIUS_METERS;
  }

  HomeVisitScheduler.prototype.createSlot = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    if (!_validateDate(ctx.date)) throw new Error('DATE_INVALID');
    if (!_validateHHMM(ctx.startTime)) throw new Error('START_TIME_INVALID');
    if (!_validateHHMM(ctx.endTime)) throw new Error('END_TIME_INVALID');
    if (ctx.startTime >= ctx.endTime) throw new Error('TIME_RANGE_INVALID');
    if (!ctx.nurseId) throw new Error('NURSE_ID_REQUIRED');

    var slotId = _id('sl');
    var slot = {
      slotId: slotId,
      tenantId: ctx.tenantId,
      date: ctx.date,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      nurseId: ctx.nurseId,
      location: ctx.location || '',
      geo: ctx.geo && typeof ctx.geo === 'object'
        ? { lat: Number(ctx.geo.lat), lng: Number(ctx.geo.lng) }
        : null,
      status: 'available',
      visitId: null,
      createdAt: _nowIso(),
      updatedAt: _nowIso()
    };
    this._storage.upsertSlot(slot);
    return slot;
  };

  HomeVisitScheduler.prototype.listSlots = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    var slots = this._storage.listSlots(ctx.tenantId);
    if (ctx.date) slots = slots.filter(function (s) { return s.date === ctx.date; });
    if (ctx.nurseId) slots = slots.filter(function (s) { return s.nurseId === ctx.nurseId; });
    if (ctx.status) slots = slots.filter(function (s) { return s.status === ctx.status; });
    return { count: slots.length, slots: slots };
  };

  HomeVisitScheduler.prototype.bookSlot = function (ctx) {
    ctx = ctx || {};
    if (!ctx.slotId) throw new Error('SLOT_ID_REQUIRED');
    if (!ctx.patientId) throw new Error('PATIENT_ID_REQUIRED');
    if (!ctx.serviceType) throw new Error('SERVICE_TYPE_REQUIRED');

    var slot = this._storage.getSlot(ctx.slotId);
    if (!slot) throw new Error('SLOT_NOT_FOUND');
    if (slot.status !== 'available') throw new Error('SLOT_NOT_AVAILABLE');

    var visitId = _id('vis');
    var requestedAt = ctx.requestedAt ? new Date(ctx.requestedAt).toISOString() : _nowIso();
    var visit = {
      visitId: visitId,
      tenantId: slot.tenantId,
      slotId: slot.slotId,
      patientId: ctx.patientId,
      serviceType: ctx.serviceType,
      nurseId: slot.nurseId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location: slot.location,
      geo: slot.geo,
      status: 'booked',
      requestedAt: requestedAt,
      checkIn: null,
      completion: null
    };
    this._storage.upsertVisit(visit);
    slot.status = 'booked';
    slot.visitId = visitId;
    slot.updatedAt = _nowIso();
    this._storage.upsertSlot(slot);
    return { visitId: visitId, slotId: slot.slotId, status: visit.status };
  };

  HomeVisitScheduler.prototype.cancelSlot = function (ctx) {
    ctx = ctx || {};
    if (!ctx.slotId) throw new Error('SLOT_ID_REQUIRED');
    var slot = this._storage.getSlot(ctx.slotId);
    if (!slot) throw new Error('SLOT_NOT_FOUND');
    if (slot.status === 'completed') throw new Error('SLOT_COMPLETED');
    var reason = ctx.reason ? String(ctx.reason).slice(0, 500) : null;
    slot.status = 'cancelled';
    slot.cancellation = { reason: reason, cancelledAt: _nowIso() };
    slot.updatedAt = _nowIso();
    this._storage.upsertSlot(slot);
    if (slot.visitId) {
      var visit = this._storage.getVisit(slot.visitId);
      if (visit) {
        visit.status = 'cancelled';
        visit.cancellation = { reason: reason, cancelledAt: _nowIso() };
        this._storage.upsertVisit(visit);
      }
    }
    return { slotId: slot.slotId, status: slot.status };
  };

  HomeVisitScheduler.prototype.nurseRoute = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    if (!ctx.nurseId) throw new Error('NURSE_ID_REQUIRED');
    if (!_validateDate(ctx.date)) throw new Error('DATE_INVALID');

    var visits = this._storage.listVisits(ctx.tenantId)
      .filter(function (v) { return v.nurseId === ctx.nurseId && v.date === ctx.date; });
    visits.sort(function (a, b) {
      return (a.date + a.startTime).localeCompare(b.date + b.startTime);
    });

    return {
      nurseId: ctx.nurseId,
      date: ctx.date,
      stopCount: visits.length,
      totalDriveMinutes: visits.length > 0 ? (visits.length - 1) * 15 : 0,
      stops: visits.map(function (v, idx) {
        return {
          order: idx + 1,
          visitId: v.visitId,
          slotId: v.slotId,
          patientId: v.patientId,
          serviceType: v.serviceType,
          startTime: v.startTime,
          endTime: v.endTime,
          location: v.location,
          status: v.status
        };
      })
    };
  };

  HomeVisitScheduler.prototype.gpsCheckIn = function (ctx) {
    ctx = ctx || {};
    if (!ctx.visitId) throw new Error('VISIT_ID_REQUIRED');
    if (typeof ctx.lat !== 'number' || typeof ctx.lng !== 'number') {
      throw new Error('GPS_INVALID');
    }
    var visit = this._storage.getVisit(ctx.visitId);
    if (!visit) throw new Error('VISIT_NOT_FOUND');
    if (!visit.geo || typeof visit.geo.lat !== 'number') {
      throw new Error('SLOT_GEO_MISSING');
    }
    var distance = _haversineMeters(
      { lat: visit.geo.lat, lng: visit.geo.lng },
      { lat: ctx.lat, lng: ctx.lng }
    );
    var radius = ctx.radiusMeters || this._radiusMeters;
    if (distance > radius) {
      return {
        visitId: visit.visitId,
        checkedIn: false,
        distanceMeters: Math.round(distance),
        radiusMeters: radius,
        reason: 'OUT_OF_RANGE'
      };
    }
    var checkIn = {
      lat: ctx.lat,
      lng: ctx.lng,
      distanceMeters: Math.round(distance),
      at: _nowIso()
    };
    visit.checkIn = checkIn;
    visit.status = 'checked_in';
    this._storage.upsertVisit(visit);
    return {
      visitId: visit.visitId,
      checkedIn: true,
      distanceMeters: Math.round(distance),
      radiusMeters: radius,
      checkIn: checkIn
    };
  };

  HomeVisitScheduler.prototype.complete = function (ctx) {
    ctx = ctx || {};
    if (!ctx.visitId) throw new Error('VISIT_ID_REQUIRED');
    if (!ctx.notes && !ctx.signatureHash) throw new Error('COMPLETION_PAYLOAD_REQUIRED');
    var visit = this._storage.getVisit(ctx.visitId);
    if (!visit) throw new Error('VISIT_NOT_FOUND');
    if (!visit.checkIn) throw new Error('VISIT_NOT_CHECKED_IN');
    if (visit.status === 'completed') throw new Error('VISIT_ALREADY_COMPLETED');
    visit.completion = {
      notes: ctx.notes ? String(ctx.notes).slice(0, 4000) : '',
      signatureHash: ctx.signatureHash ? String(ctx.signatureHash).slice(0, 128) : null,
      completedAt: _nowIso()
    };
    visit.status = 'completed';
    this._storage.upsertVisit(visit);
    var slot = this._storage.getSlot(visit.slotId);
    if (slot) {
      slot.status = 'completed';
      slot.updatedAt = _nowIso();
      this._storage.upsertSlot(slot);
    }
    return { visitId: visit.visitId, status: visit.status };
  };

  HomeVisitScheduler.prototype.list = function (ctx) {
    ctx = ctx || {};
    if (!ctx.tenantId) throw new Error('TENANT_REQUIRED');
    var visits = this._storage.listVisits(ctx.tenantId);
    if (ctx.dateFrom) visits = visits.filter(function (v) { return v.date >= ctx.dateFrom; });
    if (ctx.dateTo) visits = visits.filter(function (v) { return v.date <= ctx.dateTo; });
    if (ctx.nurseId) visits = visits.filter(function (v) { return v.nurseId === ctx.nurseId; });
    if (ctx.patientId) visits = visits.filter(function (v) { return v.patientId === ctx.patientId; });
    if (ctx.status) visits = visits.filter(function (v) { return v.status === ctx.status; });
    return { count: visits.length, visits: visits };
  };

  HomeVisitScheduler.prototype.getVisit = function (visitId) {
    return this._storage.getVisit(visitId);
  };

  HomeVisitScheduler.prototype.getSlot = function (slotId) {
    return this._storage.getSlot(slotId);
  };

  HomeVisitScheduler.create = function (opts) { return new HomeVisitScheduler(opts); };
  HomeVisitScheduler.HomeVisitScheduler = HomeVisitScheduler;
  HomeVisitScheduler._haversineMeters = _haversineMeters;
  HomeVisitScheduler.DEFAULT_RADIUS_METERS = DEFAULT_RADIUS_METERS;
  return HomeVisitScheduler;
});
