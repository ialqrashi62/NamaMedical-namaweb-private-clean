'use strict';
// lib/dicom/storage.js
// In-memory DICOM metadata store (P2 DICOM Web layer).
// Pure JS, no npm install. NO PHI — only fake UIDs + synthetic identifiers.
//
// Shape follows the DICOM standard QIDO-RS data model:
//   studies:    per-tenant array of study-level metadata
//   series:     per-study array of series-level metadata
//   instances:  per-series array of SOP instance metadata
//
// Lifetime is process-local (Map). The real PACS adapter (Orthanc/DCM4CHEE)
// will replace this in a future phase; the public surface is intentionally
// minimal so the seam is clean.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DicomStorage = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Process-local state. Never serialized to disk from this layer.
  var studies = new Map();    // tenantId -> Array<StudyRecord>
  var series = new Map();     // studyUID -> Array<SeriesRecord>
  var instances = new Map();  // seriesUID -> Array<InstanceRecord>

  // Synthetic UIDs (NOT real DICOM IOD UIDs from any PACS).
  // Format mirrors the demo UID OID arc to make them obviously placeholder.
  function fakeStudyUID(n) { return '1.2.826.0.1.3680043.10.demo.study.' + n; }
  function fakeSeriesUID(s, n) { return '1.2.826.0.1.3680043.10.demo.series.' + s + '.' + n; }
  function fakeSopUID(s, n, i) { return '1.2.826.0.1.3680043.10.demo.sop.' + s + '.' + n + '.' + i; }

  // Synthetic, non-PHI labels (Patient A..E). Deliberately generic so logs
  // remain safe under RAIL-12.
  var PATIENT_LABELS = ['Patient A', 'Patient B', 'Patient C', 'Patient D', 'Patient E'];
  var MODALITIES = ['CT', 'MR', 'CR', 'US', 'XA'];
  var STUDY_DESCRIPTIONS = [
    'Chest Survey', 'Head Routine', 'Abdomen Contrast',
    'Spine Screening', 'Pelvis Follow-up'
  ];
  var TRANSFER_SYNTAXES = ['1.2.840.10008.1.2.1', '1.2.840.10008.1.2'];

  function ensureTenant(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('TENANT_REQUIRED');
    }
    if (!studies.has(tenantId)) {
      studies.set(tenantId, []);
    }
    return studies.get(tenantId);
  }

  function seed(tenantId, opts) {
    tenantId = tenantId || 'demo';
    opts = opts || {};
    var count = typeof opts.count === 'number' && opts.count > 0 && opts.count <= 10
      ? opts.count : 5;
    var arr = ensureTenant(tenantId);
    if (arr.length > 0) {
      // Idempotent: do not re-seed.
      return { tenantId: tenantId, added: 0, total: arr.length };
    }
    for (var s = 1; s <= count; s++) {
      var studyUID = fakeStudyUID(s);
      var patientLabel = PATIENT_LABELS[(s - 1) % PATIENT_LABELS.length];
      var patientId = 'P-' + String(s).padStart(3, '0'); // synthetic only
      var studyDate = '202601' + String(s).padStart(2, '0'); // synthetic YYYYMMDD
      var studyDescription = STUDY_DESCRIPTIONS[(s - 1) % STUDY_DESCRIPTIONS.length];
      var modality = MODALITIES[(s - 1) % MODALITIES.length];
      arr.push({
        studyUID: studyUID,
        patientId: patientId,
        patientName: patientLabel,
        modality: modality,
        studyDate: studyDate,
        studyDescription: studyDescription
      });
      // Two series per study
      var seriesList = [];
      for (var sn = 1; sn <= 2; sn++) {
        var seriesUID = fakeSeriesUID(s, sn);
        var seriesModality = sn === 1 ? modality : 'SR';
        seriesList.push({
          seriesUID: seriesUID,
          studyUID: studyUID,
          modality: seriesModality,
          seriesNumber: sn,
          seriesDescription: 'Series ' + sn
        });
        // Two instances per series
        var instList = [];
        for (var ii = 1; ii <= 2; ii++) {
          var sopUID = fakeSopUID(s, sn, ii);
          instList.push({
            sopInstanceUID: sopUID,
            seriesUID: seriesUID,
            studyUID: studyUID,
            instanceNumber: ii,
            size: 0, // metadata only — never pixel data (A3A boundary)
            transferSyntax: TRANSFER_SYNTAXES[(ii - 1) % TRANSFER_SYNTAXES.length]
          });
        }
        instances.set(seriesUID, instList);
      }
      series.set(studyUID, seriesList);
    }
    return { tenantId: tenantId, added: count, total: arr.length };
  }

  function listStudies(tenantId) {
    return (studies.get(tenantId) || []).slice();
  }

  function getStudy(tenantId, studyUID) {
    var arr = studies.get(tenantId) || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].studyUID === studyUID) return arr[i];
    }
    return null;
  }

  function listSeries(studyUID) {
    return (series.get(studyUID) || []).slice();
  }

  function listInstances(seriesUID) {
    return (instances.get(seriesUID) || []).slice();
  }

  function stats() {
    return {
      studies: studies.size,
      series: series.size,
      instances: instances.size,
      tenantCount: studies.size
    };
  }

  return {
    seed: seed,
    listStudies: listStudies,
    getStudy: getStudy,
    listSeries: listSeries,
    listInstances: listInstances,
    stats: stats,
    // Exposed for testing/observability only — must NOT be used for
    // pixel data paths; A3A PHI boundary remains enforced by route layer.
    _studies: studies,
    _series: series,
    _instances: instances
  };
});
