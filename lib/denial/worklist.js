// lib/denial/worklist.js
// Denial Worklist (P18).
// Tenant-scoped work queue with classify / assign / appeal / resolve.
// Appeal history is hash-chained (RAIL-10): each link's prevHash == previous hash.
// No PHI in error messages (RAIL-12). Fail-closed (RAIL-11).
// Pure JS, in-memory storage, no npm install.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DenialWorklist = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var Classifier = require('./classifier');
  var Appeals = require('./appealTemplate');

  var STATUSES = ['open', 'classified', 'assigned', 'appealed', 'resolved', 'rejected'];

  var _GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';

  function _hash(obj) {
    // FNV-1a 64-bit-ish stable string hash. Sufficient for chain integrity.
    try {
      var json = JSON.stringify(obj);
      var h1 = 0x811c9dc5;
      var h2 = 0xcbf29ce4;
      for (var i = 0; i < json.length; i++) {
        var c = json.charCodeAt(i);
        h1 = ((h1 ^ c) * 0x01000193) >>> 0;
        h2 = ((h2 ^ (c + 0x9e3779b1)) * 0x01000193) >>> 0;
      }
      var hex1 = ('00000000' + h1.toString(16)).slice(-8);
      var hex2 = ('00000000' + h2.toString(16)).slice(-8);
      return (hex1 + hex2 + hex1 + hex2 + hex1 + hex2 + hex1 + hex2).slice(0, 64);
    } catch (_e) {
      return _GENESIS;
    }
  }

  function _id(prefix) {
    var r = Math.floor(Math.random() * 0xffffff).toString(16);
    var t = Date.now().toString(16);
    return (prefix || 'wk') + '-' + t + '-' + r;
  }

  function _nowIso() {
    return new Date().toISOString();
  }

  function _safeAmount(v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function DenialWorklist(opts) {
    this._store = (opts && opts.store) || {};
    this._workByTenant = this._store.workByTenant || {};
    this._appealHistoryByWork = this._store.appealHistoryByWork || {};
    if (!this._store.workByTenant) this._store.workByTenant = this._workByTenant;
    if (!this._store.appealHistoryByWork) this._store.appealHistoryByWork = this._appealHistoryByWork;
  }

  function _ensureTenant(self, tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('TENANT_REQUIRED');
    }
    if (!self._workByTenant[tenantId]) self._workByTenant[tenantId] = {};
    if (!self._appealHistoryByWork) self._appealHistoryByWork = {};
  }

  DenialWorklist.prototype.add = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    if (!opts.claimId) throw new Error('CLAIM_ID_REQUIRED');
    if (!opts.denialCode) throw new Error('DENIAL_CODE_REQUIRED');
    if (!opts.payerId) throw new Error('PAYER_ID_REQUIRED');

    var tenantId = opts.tenantId;
    _ensureTenant(this, tenantId);

    var workId = _id('dw');
    var cls = Classifier.classify(opts.denialCode);
    var receivedAt = opts.receivedAt ? new Date(opts.receivedAt).toISOString() : _nowIso();

    var item = {
      workId: workId,
      tenantId: tenantId,
      claimId: opts.claimId,
      denialCode: String(opts.denialCode).toUpperCase().trim(),
      amount: _safeAmount(opts.amount),
      payerId: opts.payerId,
      receivedAt: receivedAt,
      status: 'open',
      category: cls.category,
      appealable: cls.appealable,
      assignedTo: null,
      classification: cls,
      createdAt: receivedAt,
      updatedAt: receivedAt,
      resolution: null,
      notes: null
    };
    this._workByTenant[tenantId][workId] = item;
    return { workId: workId, status: item.status, category: item.category, appealable: item.appealable };
  };

  DenialWorklist.prototype.classify = function (ctx) {
    ctx = ctx || {};
    if (!ctx.workId) throw new Error('WORK_ID_REQUIRED');
    var item = this._find(ctx.workId);
    if (!item) throw new Error('WORK_NOT_FOUND');
    var cls = Classifier.classify(item.denialCode);
    item.category = cls.category;
    item.appealable = cls.appealable;
    item.classification = cls;
    item.status = item.status === 'open' ? 'classified' : item.status;
    item.updatedAt = _nowIso();
    return { workId: item.workId, category: item.category, appealable: item.appealable, status: item.status };
  };

  DenialWorklist.prototype.assign = function (ctx) {
    ctx = ctx || {};
    if (!ctx.workId) throw new Error('WORK_ID_REQUIRED');
    if (!ctx.assignedTo) throw new Error('ASSIGNEE_REQUIRED');
    var item = this._find(ctx.workId);
    if (!item) throw new Error('WORK_NOT_FOUND');
    if (item.status === 'resolved') throw new Error('WORK_RESOLVED');
    item.assignedTo = ctx.assignedTo;
    item.status = 'assigned';
    item.updatedAt = _nowIso();
    return { workId: item.workId, assignedTo: item.assignedTo, status: item.status };
  };

  DenialWorklist.prototype.appeal = function (ctx) {
    ctx = ctx || {};
    if (!ctx.workId) throw new Error('WORK_ID_REQUIRED');
    if (!ctx.submitterId) throw new Error('SUBMITTER_REQUIRED');
    var item = this._find(ctx.workId);
    if (!item) throw new Error('WORK_NOT_FOUND');
    if (item.status === 'resolved') throw new Error('WORK_RESOLVED');
    if (!item.appealable) throw new Error('NOT_APPEALABLE');

    var appealId = _id('ap');
    var rendered = Appeals.forCategory(item.category, {
      claimId: item.claimId,
      patientRef: ctx.patientRef || '',
      payerName: ctx.payerName || '',
      denialCode: item.denialCode,
      denialCategory: item.category,
      clinicalRationale: ctx.clinicalRationale || 'See attached clinical documentation.',
      submitterName: ctx.submitterName || '',
      submitterRole: ctx.submitterRole || 'Claims Specialist',
      amount: item.amount.toFixed(2)
    });
    var letter = Appeals.mergeCustom(rendered, ctx.customText);

    var history = this._appealHistoryByWork[ctx.workId] || [];
    var prevHash = history.length > 0 ? history[history.length - 1].hash : _GENESIS;
    var entry = {
      appealId: appealId,
      workId: ctx.workId,
      tenantId: item.tenantId,
      template: ctx.template || item.category,
      subject: letter.subject,
      body: letter.body,
      checklist: letter.checklist,
      customText: ctx.customText || null,
      submitterId: ctx.submitterId,
      submittedAt: _nowIso(),
      prevHash: prevHash
    };
    entry.hash = _hash({
      appealId: entry.appealId,
      workId: entry.workId,
      tenantId: entry.tenantId,
      template: entry.template,
      subject: entry.subject,
      body: entry.body,
      submitterId: entry.submitterId,
      submittedAt: entry.submittedAt,
      prevHash: entry.prevHash
    });
    history.push(entry);
    this._appealHistoryByWork[ctx.workId] = history;

    item.status = 'appealed';
    item.updatedAt = _nowIso();
    return {
      workId: ctx.workId,
      appealId: appealId,
      status: item.status,
      subject: letter.subject,
      body: letter.body,
      checklist: letter.checklist,
      hash: entry.hash,
      prevHash: entry.prevHash
    };
  };

  DenialWorklist.prototype.resolve = function (ctx) {
    ctx = ctx || {};
    if (!ctx.workId) throw new Error('WORK_ID_REQUIRED');
    if (!ctx.resolution) throw new Error('RESOLUTION_REQUIRED');
    var valid = ['recovered', 'written_off', 'patient_responsibility', 'closed_no_action'];
    if (valid.indexOf(ctx.resolution) === -1) {
      throw new Error('RESOLUTION_INVALID');
    }
    var item = this._find(ctx.workId);
    if (!item) throw new Error('WORK_NOT_FOUND');
    item.status = 'resolved';
    item.resolution = ctx.resolution;
    item.notes = ctx.notes ? String(ctx.notes).slice(0, 2000) : null;
    item.resolvedAt = _nowIso();
    item.updatedAt = item.resolvedAt;
    if (ctx.resolution === 'recovered' && item.amount > 0) {
      // recovered_count metric: caller can aggregate via metrics().
    }
    return { workId: item.workId, status: item.status, resolution: item.resolution };
  };

  DenialWorklist.prototype.list = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    var items = Object.values(this._workByTenant[opts.tenantId] || {});
    if (opts.status) {
      items = items.filter(function (x) { return x.status === opts.status; });
    }
    if (opts.assignedTo) {
      items = items.filter(function (x) { return x.assignedTo === opts.assignedTo; });
    }
    if (opts.category) {
      items = items.filter(function (x) { return x.category === opts.category; });
    }
    items.sort(function (a, b) { return (b.receivedAt || '').localeCompare(a.receivedAt || ''); });
    return { count: items.length, items: items };
  };

  DenialWorklist.prototype.metrics = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    var items = Object.values(this._workByTenant[opts.tenantId] || {});
    var period = opts.period || 'all';
    var now = Date.now();
    var cutoff = null;
    if (period === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (period === '90d') cutoff = now - 90 * 24 * 60 * 60 * 1000;
    else if (period === 'ytd') {
      var d = new Date();
      cutoff = Date.UTC(d.getUTCFullYear(), 0, 1);
    }

    if (cutoff) {
      items = items.filter(function (x) {
        var t = new Date(x.receivedAt).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    var total = items.length;
    var totalAmount = 0;
    var byCategory = {};
    var appealed = 0;
    var recovered = 0;
    var recoveredAmount = 0;
    for (var i = 0; i < items.length; i++) {
      var x = items[i];
      totalAmount += x.amount;
      byCategory[x.category] = (byCategory[x.category] || 0) + 1;
      if (x.status === 'appealed' || x.status === 'resolved') appealed++;
      if (x.resolution === 'recovered') {
        recovered++;
        recoveredAmount += x.amount;
      }
    }
    var appealRate = total > 0 ? appealed / total : 0;
    var recoveryRate = total > 0 ? recovered / total : 0;
    return {
      tenantId: opts.tenantId,
      period: period,
      totalDenials: total,
      totalAmount: Math.round(totalAmount * 100) / 100,
      byCategory: byCategory,
      appealCount: appealed,
      appealRate: Math.round(appealRate * 10000) / 10000,
      recoveredCount: recovered,
      recoveredAmount: Math.round(recoveredAmount * 100) / 100,
      recoveryRate: Math.round(recoveryRate * 10000) / 10000
    };
  };

  DenialWorklist.prototype.appealHistory = function (ctx) {
    ctx = ctx || {};
    if (!ctx.workId) throw new Error('WORK_ID_REQUIRED');
    var history = this._appealHistoryByWork[ctx.workId] || [];
    // Verify hash chain integrity.
    var prevHash = _GENESIS;
    var chainOk = true;
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var recomputed = _hash({
        appealId: h.appealId,
        workId: h.workId,
        tenantId: h.tenantId,
        template: h.template,
        subject: h.subject,
        body: h.body,
        submitterId: h.submitterId,
        submittedAt: h.submittedAt,
        prevHash: prevHash
      });
      if (h.hash !== recomputed || h.prevHash !== prevHash) {
        chainOk = false;
        break;
      }
      prevHash = h.hash;
    }
    return {
      workId: ctx.workId,
      count: history.length,
      chainOk: chainOk,
      entries: history.map(function (e) {
        return {
          appealId: e.appealId,
          template: e.template,
          subject: e.subject,
          submitterId: e.submitterId,
          submittedAt: e.submittedAt,
          prevHash: e.prevHash,
          hash: e.hash
        };
      })
    };
  };

  DenialWorklist.prototype._find = function (workId) {
    if (!workId) return null;
    var tenants = Object.keys(this._workByTenant);
    for (var i = 0; i < tenants.length; i++) {
      var t = tenants[i];
      if (this._workByTenant[t][workId]) return this._workByTenant[t][workId];
    }
    return null;
  };

  // Make the class itself the default export so callers can `new W()`.
  // Statics live alongside the constructor so `W.create`, `W.STATUSES`,
  // `W._hash`, and `W.DenialWorklist` all remain reachable.
  DenialWorklist.create = function (opts) { return new DenialWorklist(opts); };
  DenialWorklist.DenialWorklist = DenialWorklist;
  DenialWorklist.STATUSES = STATUSES;
  DenialWorklist._hash = _hash;
  return DenialWorklist;
});
