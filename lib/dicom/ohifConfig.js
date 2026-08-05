'use strict';
// lib/dicom/ohifConfig.js
// Builds the OHIF v3 static-config JSON that the viewer fetches at boot.
// We do NOT ship the OHIF bundle on the public web (per safety constraint).
// The OHIF viewer (when deployed internally) fetches this config endpoint
// to discover our QIDO/WADO roots and the study list to open.
//
// Returns plain object; serialization happens at the route boundary.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OhifConfig = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // We only return the schema subset that OHIF v3 actually reads at boot.
  // No secrets, no PHI, no transfer-syntax allowlists leaking into client.
  function buildOhifConfig(opts) {
    opts = opts || {};
    if (!opts.tenantId) throw new Error('TENANT_REQUIRED');
    var studyUIDs = Array.isArray(opts.studyUIDs)
      ? opts.studyUIDs.filter(function (s) { return typeof s === 'string' && s.length > 0; })
      : [];
    var lang = (typeof opts.lang === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(opts.lang))
      ? opts.lang
      : 'ar-SA';

    return {
      routerBasename: '/ohif',
      // OHIF v3 schema — keep field names exactly as the viewer expects.
      servers: {
        dicomWeb: [
          {
            name: 'NamaMedical',
            wadoUriRoot: '/api/dicom/wado',
            qidoRoot: '/api/dicom/qido',
            // STOW root intentionally absent: write is not exposed publicly.
            // If a future phase wants admin STOW, it must be served from a
            // separate path guarded by requireRole('admin').
            stowRoot: '',
            wadoRoot: '/api/dicom/wado'
          }
        ]
      },
      studyUIDs: studyUIDs,
      dataSources: [
        {
          namespace: 'ohif',
          sourceName: 'default',
          // Default to our tenant-scoped QIDO root.
          queryParams: { tenantId: opts.tenantId }
        }
      ],
      ui: {
        language: lang,
        // RTL for Arabic; LTR for everything else. Viewer uses this to flip.
        direction: lang.indexOf('ar') === 0 ? 'rtl' : 'ltr',
        showStudyList: true,
        showThumbnailList: true,
        cornerstone: { active: true }
      },
      // Safety metadata — never logged by the viewer, but documented here
      // so the values are reproducible for audit.
      _meta: {
        tenantId: opts.tenantId,
        generatedAt: new Date().toISOString(),
        note: 'NO_STOW_PUBLIC — write ops are admin-gated (P2 safety contract).'
      }
    };
  }

  return {
    buildOhifConfig: buildOhifConfig
  };
});
