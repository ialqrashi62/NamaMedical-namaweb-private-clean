// lib/cardiology/storage.js
// In-memory structured-report store (P16). Tenant-scoped (RAIL-5), no PHI
// beyond operational mrns (RAIL-12). Pure JS, no npm install.
//
// Keying: reportId (globally unique). Tenant scope is enforced both at
// the report-key level and via the lookup helpers which require tenantId.
// History-by-patient is tenant-scoped.
//
// State shape:
//   state._reports = { [reportId]: ReportRow }
//   state._audit    = [{ op, reportId, ts, hash }, ...]
//
// Finalization is locked: once a report.status === 'finalized', the only
// mutation allowed is appendAudit (hash-chained, RAIL-10).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CardiologyStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function newCardiologyStorage() {
    var state = { _reports: {}, _audit: [], _lastHash: null };

    function _persist(row) {
      state._reports[row.reportId] = row;
      return { ok: true, reportId: row.reportId };
    }

    function appendAudit(record) {
      state._audit.push(record);
      state._lastHash = record.hash || state._lastHash;
      return { ok: true };
    }

    function createReport(rec) {
      if (!rec || !rec.reportId) return { ok: false, error: 'FIELD_REQUIRED:reportId' };
      if (!rec.tenantId) return { ok: false, error: 'TENANT_REQUIRED' };
      if (state._reports[rec.reportId]) return { ok: false, error: 'DUPLICATE_REPORT' };
      var row = {
        reportId: rec.reportId,
        tenantId: rec.tenantId,
        patientId: rec.patientId,
        templateId: rec.templateId,
        actorId: rec.actorId || null,
        lang: rec.lang || 'en',
        fields: rec.fields || {},
        status: rec.status || 'draft',
        finalizedAt: rec.finalizedAt || null,
        finalizedHash: rec.finalizedHash || null,
        audit: rec.audit || [],
        createdAt: rec.createdAt || new Date().toISOString()
      };
      return _persist(row);
    }

    function updateFields(reportId, fields) {
      var row = state._reports[reportId];
      if (!row) return { ok: false, error: 'REPORT_NOT_FOUND' };
      if (row.status === 'finalized') return { ok: false, error: 'REPORT_FINALIZED' };
      row.fields = fields || {};
      return { ok: true, reportId: reportId };
    }

    function finalizeReport(reportId, hash) {
      var row = state._reports[reportId];
      if (!row) return { ok: false, error: 'REPORT_NOT_FOUND' };
      if (row.status === 'finalized') return { ok: false, error: 'ALREADY_FINALIZED' };
      row.status = 'finalized';
      row.finalizedAt = new Date().toISOString();
      row.finalizedHash = hash || null;
      return { ok: true, reportId: reportId, finalizedAt: row.finalizedAt };
    }

    function getReport(reportId) {
      var row = state._reports[reportId];
      if (!row) return null;
      return _cloneReport(row);
    }

    function getReportForTenant(reportId, tenantId) {
      var row = state._reports[reportId];
      if (!row) return null;
      if (String(row.tenantId) !== String(tenantId)) return null;
      return _cloneReport(row);
    }

    function historyFor(tenantId, patientId) {
      var out = [];
      for (var id in state._reports) {
        if (!Object.prototype.hasOwnProperty.call(state._reports, id)) continue;
        var row = state._reports[id];
        if (String(row.tenantId) !== String(tenantId)) continue;
        if (patientId && String(row.patientId) !== String(patientId)) continue;
        out.push({
          reportId: row.reportId,
          tenantId: row.tenantId,
          patientId: row.patientId,
          templateId: row.templateId,
          status: row.status,
          createdAt: row.createdAt,
          finalizedAt: row.finalizedAt
        });
      }
      out.sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
      return out;
    }

    function _cloneReport(row) {
      return {
        reportId: row.reportId,
        tenantId: row.tenantId,
        patientId: row.patientId,
        templateId: row.templateId,
        actorId: row.actorId,
        lang: row.lang,
        fields: JSON.parse(JSON.stringify(row.fields || {})),
        status: row.status,
        finalizedAt: row.finalizedAt,
        finalizedHash: row.finalizedHash,
        audit: (row.audit || []).slice(),
        createdAt: row.createdAt
      };
    }

    function clear(tenantId) {
      var prefix = String(tenantId) + '|';
      var removed = 0;
      var k;
      for (k in state._reports) {
        if (Object.prototype.hasOwnProperty.call(state._reports, k) && k.indexOf(prefix) === 0) {
          delete state._reports[k];
          removed++;
        }
      }
      return { ok: true, removed: removed };
    }

    function auditLog() {
      return state._audit.slice();
    }

    function lastHash() {
      return state._lastHash;
    }

    return {
      createReport: createReport,
      updateFields: updateFields,
      finalizeReport: finalizeReport,
      getReport: getReport,
      getReportForTenant: getReportForTenant,
      historyFor: historyFor,
      appendAudit: appendAudit,
      clear: clear,
      auditLog: auditLog,
      lastHash: lastHash,
      _state: state
    };
  }

  return {
    newCardiologyStorage: newCardiologyStorage,
    _shared: newCardiologyStorage()
  };
});
