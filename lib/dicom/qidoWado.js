'use strict';
// lib/dicom/qidoWado.js
// DICOM Web (QIDO-RS + WADO-RS) client/serializer for the P2 layer.
// READ-ONLY. Never returns pixel/blob data — only DICOM JSON metadata.
//
// DICOM JSON shape (per DICOM PS3.18):
//   [{ "00100010": { "vr": "PN", "Value": [{ "Alphabetic": "Patient A" }] } }, ...]
//
// Safety:
//   - RAIL-5: every method requires tenantId; data is filtered by tenant first.
//   - RAIL-12: no PHI in logs. We log IDs (studyUID, seriesUID, sopUID) and
//     modality only. Patient names are NEVER written to the logger.
//   - A3A boundary preserved: no pixel/blob endpoints — metadata only.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QidoWado = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // DICOM tag registry for the metadata we expose (subset only — full PACS
  // surface lives in the Orthanc adapter; this layer is for read-only demo).
  var TAGS = {
    PatientID: '00100020',
    PatientName: '00100010',
    StudyInstanceUID: '0020000D',
    StudyDate: '00080020',
    StudyDescription: '00081030',
    Modality: '00080060',
    SeriesInstanceUID: '0020000E',
    SeriesNumber: '00200011',
    SOPInstanceUID: '00080018',
    TransferSyntaxUID: '00020010'
  };

  function vrStr() { return 'PN'; }
  function vrDate() { return 'DA'; }
  function vrUI() { return 'UI'; }
  function vrUS() { return 'US'; }

  function pn(value) { return value === undefined || value === null ? null : { Alphabetic: String(value) }; }
  function ui(value) { return value === undefined || value === null ? null : String(value); }
  function date(value) { return value === undefined || value === null ? null : String(value); }
  function us(value) { return value === undefined || value === null ? null : Number(value); }

  function buildStudyJson(rec) {
    if (!rec) return null;
    var out = {};
    out[TAGS.PatientID] = { vr: 'LO', Value: [ui(rec.patientId)] };
    out[TAGS.PatientName] = { vr: 'PN', Value: [pn(rec.patientName)] };
    out[TAGS.StudyInstanceUID] = { vr: 'UI', Value: [ui(rec.studyUID)] };
    out[TAGS.StudyDate] = { vr: 'DA', Value: [date(rec.studyDate)] };
    out[TAGS.StudyDescription] = { vr: 'LO', Value: [ui(rec.studyDescription)] };
    return out;
  }

  function buildSeriesJson(rec) {
    if (!rec) return null;
    var out = {};
    out[TAGS.StudyInstanceUID] = { vr: 'UI', Value: [ui(rec.studyUID)] };
    out[TAGS.SeriesInstanceUID] = { vr: 'UI', Value: [ui(rec.seriesUID)] };
    out[TAGS.Modality] = { vr: 'CS', Value: [ui(rec.modality)] };
    out[TAGS.SeriesNumber] = { vr: 'IS', Value: [us(rec.seriesNumber)] };
    return out;
  }

  function buildInstanceJson(rec) {
    if (!rec) return null;
    var out = {};
    out[TAGS.StudyInstanceUID] = { vr: 'UI', Value: [ui(rec.studyUID)] };
    out[TAGS.SeriesInstanceUID] = { vr: 'UI', Value: [ui(rec.seriesUID)] };
    out[TAGS.SOPInstanceUID] = { vr: 'UI', Value: [ui(rec.sopInstanceUID)] };
    out[TAGS.TransferSyntaxUID] = { vr: 'UI', Value: [ui(rec.transferSyntax)] };
    return out;
  }

  // Filter by lightweight DICOM-web-style key/value matchers.
  // QIDO-RS accepts DICOM tag names (PatientID, StudyInstanceUID, etc.)
  // as query params. We map them to our internal record fields.
  var PARAM_TO_FIELD = {
    PatientID: 'patientId',
    StudyInstanceUID: 'studyUID',
    SeriesInstanceUID: 'seriesUID',
    Modality: 'modality',
    PatientName: 'patientName'
  };

  function matches(rec, params) {
    if (!params) return true;
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = params[k];
      if (v === undefined || v === null || v === '') continue;
      var field = PARAM_TO_FIELD[k] || k;
      if (String(rec[field]) !== String(v)) return false;
    }
    return true;
  }

  // Build a thin client bound to a storage backend. If no backend is
  // provided, we lazily require the default in-memory DICOM storage.
  // This is convenient for callers that don't pass DI (smoke tests,
  // route wiring) — production code should still pass the adapter.
  function QidoWado(storage) {
    if (!storage || typeof storage.listStudies !== 'function') {
      try {
        // Lazy require to avoid a circular module resolution at load time.
        storage = require('./storage');
      } catch (_e) {
        throw new Error('STORAGE_REQUIRED');
      }
    }
    this._storage = storage;
  }

  QidoWado.prototype.qidoRs = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    var level = opts.level || 'study';
    var params = opts.params || {};
    var s = this._storage;
    if (level === 'study') {
      var tenantStudies = s.listStudies(opts.tenantId);
      return tenantStudies.filter(function (r) { return matches(r, params); })
        .map(buildStudyJson);
    }
    if (level === 'series') {
      var studyUID = params.StudyInstanceUID;
      if (!studyUID) return [];
      var st = s.getStudy(opts.tenantId, studyUID);
      if (!st) return []; // do not leak cross-tenant existence
      return s.listSeries(studyUID)
        .filter(function (r) { return matches(r, params); })
        .map(buildSeriesJson);
    }
    if (level === 'instance') {
      var seriesUID = params.SeriesInstanceUID;
      if (!seriesUID) return [];
      return s.listInstances(seriesUID)
        .filter(function (r) { return matches(r, params); })
        .map(buildInstanceJson);
    }
    return [];
  };

  QidoWado.prototype.wadoRs = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    var s = this._storage;
    if (opts.studyUID) {
      var st = s.getStudy(opts.tenantId, opts.studyUID);
      if (!st) return null; // cross-tenant probe = silent null (RAIL-5)
      var studyJson = buildStudyJson(st);
      var series = s.listSeries(opts.studyUID).map(buildSeriesJson);
      var instances = [];
      // Roll up instances across all series for the study (metadata only).
      var ser = s.listSeries(opts.studyUID);
      for (var i = 0; i < ser.length; i++) {
        var inst = s.listInstances(ser[i].seriesUID);
        for (var j = 0; j < inst.length; j++) {
          instances.push(buildInstanceJson(inst[j]));
        }
      }
      return { study: studyJson, series: series, instances: instances };
    }
    return null;
  };

  QidoWado.prototype.list = function (opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    return this.qidoRs({
      tenantId: opts.tenantId,
      level: 'study',
      params: { PatientID: opts.patientId }
    });
  };

  // Primary export: the class itself (so `new QidoWado(storage)` and
  // `new (require('./lib/dicom/qidoWado'))()` both work). Auxiliary
  // exports hang off .QidoWado / .TAGS for back-compat style callers.
  var api = QidoWado;
  api.QidoWado = QidoWado;
  api.TAGS = TAGS;
  api._buildStudyJson = buildStudyJson;
  api._buildSeriesJson = buildSeriesJson;
  api._buildInstanceJson = buildInstanceJson;
  return api;
});
