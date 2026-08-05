'use strict';
// routes/dicomweb.js
// P2 DICOM Web (QIDO-RS + WADO-RS, READ-ONLY) + OHIF config endpoint.
// STOW-RS is REJECTED (501) — write ops are admin-only in a future phase.
//
// Mounted in server.js via:
//   const dicomweb = require('./routes/dicomweb');
//   app.use('/api/dicom', dicomweb);
//
// Middleware chain (lib/route-factory): tenant scope guard + read-only handler.
// Content types follow DICOM PS3.18: application/dicom+json for QIDO/WADO,
// application/json for OHIF config.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DicomWebRoutes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var express = null;
  try { express = require('express'); } catch (_e) { express = null; }
  var Router = express && typeof express.Router === 'function'
    ? express.Router
    : null;

  var RouteFactory = require('../lib/route-factory');
  var RouteGuards = require('../lib/route-guards');
  var Storage = require('../lib/dicom/storage');
  var QidoWadoLib = require('../lib/dicom/qidoWado');
  var OhifConfigLib = require('../lib/dicom/ohifConfig');

  // Helper: validate that tenantId is present on the request (RAIL-5).
  function ensureTenant(req, res) {
    return RouteGuards.requireTenant(req, res);
  }

  function ensureSeed(tenantId) {
    // Idempotent — safe to call per-request.
    return Storage.seed(tenantId);
  }

  var qidoWado = new QidoWadoLib.QidoWado(Storage);

  // POST /api/dicom/stow/studies → 501 Not Implemented (P2 safety contract).
  function stowHandler(req, res) {
    if (!ensureTenant(req, res)) return;
    // Log ONLY counts/IDs — never body, never headers (RAIL-12).
    var bodyLen = req && req.body && typeof req.body === 'object'
      ? Object.keys(req.body).length : 0;
    if (typeof console !== 'undefined' && console.log) {
      console.log('[dicom-stow] blocked: tenantId=' + req.tenantId + ' bodyKeys=' + bodyLen);
    }
    res.status(501).set('Content-Type', 'application/json').json({
      error: 'STOW_NOT_PUBLIC',
      msg: 'STOW-RS write operations are admin-only and not exposed on this endpoint.'
    });
  }

  function getQidoStudies(req, res) {
    if (!ensureTenant(req, res)) return;
    var params = req.query || {};
    ensureSeed(req.tenantId);
    var json = qidoWado.qidoRs({
      tenantId: req.tenantId,
      level: 'study',
      params: {
        PatientID: params.PatientID,
        StudyInstanceUID: params.StudyInstanceUID
      }
    });
    res.set('Content-Type', 'application/dicom+json');
    res.json(json);
  }

  function getWadoStudy(req, res) {
    if (!ensureTenant(req, res)) return;
    var uid = req.params && req.params.uid;
    if (!uid) {
      res.status(400).set('Content-Type', 'application/dicom+json').json({
        error: 'STUDY_UID_REQUIRED'
      });
      return;
    }
    ensureSeed(req.tenantId);
    var data = qidoWado.wadoRs({ tenantId: req.tenantId, studyUID: uid });
    if (!data) {
      res.status(404).set('Content-Type', 'application/dicom+json').json({
        error: 'NOT_FOUND'
      });
      return;
    }
    res.set('Content-Type', 'application/dicom+json');
    res.json(data);
  }

  function getOhifConfig(req, res) {
    if (!ensureTenant(req, res)) return;
    var q = req.query || {};
    var studiesParam = typeof q.studies === 'string' ? q.studies : '';
    var lang = typeof q.lang === 'string' ? q.lang : 'ar-SA';
    var studyUIDs = studiesParam
      ? studiesParam.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : [];
    var cfg = OhifConfigLib.buildOhifConfig({
      tenantId: req.tenantId,
      studyUIDs: studyUIDs,
      lang: lang
    });
    res.set('Content-Type', 'application/json');
    res.json(cfg);
  }

  // Build the read router with explicit Express routes so paths register
  // correctly (the factory's catch-all 'GET /' does not match sub-paths).
  var readRouter = Router ? Router() : null;
  if (!readRouter) {
    // Fallback: route factory with catch-all GET (sub-paths won't match).
    readRouter = RouteFactory.create({
      base: '/',
      auth: { roles: ['admin', 'doctor', 'nurse', 'radiologist'] },
      tenantScoped: true,
      methods: {
        GET: function (req, res) {
          var p = req.path || '';
          if (p === '/qido/studies') return getQidoStudies(req, res);
          if (p.indexOf('/wado/studies/') === 0) return getWadoStudy(req, res);
          if (p === '/ohif/config') return getOhifConfig(req, res);
          res.status(404).json({ error: 'NOT_FOUND' });
        }
      }
    });
  } else {
    // Dev/test tenant header trust (GATE-4 aligned).
    try { readRouter.use(require('../lib/dev-ctx')); } catch (_e) {}
    readRouter.get('/qido/studies', getQidoStudies);
    readRouter.get('/wado/studies/:uid', getWadoStudy);
    readRouter.get('/ohif/config', getOhifConfig);
  }

  // STOW is a POST and MUST stay 501.
  var stowRouter = Router ? Router() : null;
  if (stowRouter) {
    try { stowRouter.use(require('../lib/dev-ctx')); } catch (_e) {}
    stowRouter.post('/stow/studies', stowHandler);
  } else {
    readRouter.post = readRouter.post || function () {};
    readRouter.post('/stow/studies', stowHandler);
  }

  function buildRouter() {
    var root = Router ? Router() : null;
    if (!root) {
      // Fallback — return a flat object so server.js can still mount.
      return readRouter;
    }
    // Dev/test tenant header trust (GATE-4 aligned).
    try { root.use(require('../lib/dev-ctx')); } catch (_e) {}
    root.use(readRouter);
    if (stowRouter) root.use(stowRouter);
    return root;
  }

  return {
    router: buildRouter(),
    // Exposed for test harnesses and server wiring.
    handlers: {
      qidoStudies: getQidoStudies,
      wadoStudy: getWadoStudy,
      ohifConfig: getOhifConfig,
      stowBlocked: stowHandler
    }
  };
});
