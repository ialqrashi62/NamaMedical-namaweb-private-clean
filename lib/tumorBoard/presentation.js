// lib/tumorBoard/presentation.js
// MDT case presentation slides (P17). Wraps TumorBoardStorage.slides
// to support:
//
//   - build()           — produces a default slide-deck outline for a case
//   - addSlide()        — add an imaging / pathology / genomic / summary slide
//   - finalize()        — render a PDF-ready HTML envelope for the case
//
// Pure JS, no npm install. No PHI in slide content (RAIL-12) — the API
// accepts only structured slide content with `kind` ∈ {imaging,
// pathology, genomic, summary, history, labs}.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MDTSlides = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ALLOWED_KINDS = ['history', 'labs', 'imaging', 'pathology', 'genomic', 'summary'];

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function MDTSlides(opts) {
    opts = opts || {};
    var storage = opts.storage;
    if (!storage || typeof storage.appendSlide !== 'function') {
      storage = require('./storage').newTumorBoardStorage();
    }
    this._storage = storage;
  }

  MDTSlides.prototype.build = function (spec) {
    spec = spec || {};
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.caseId) throw new Error('FIELD_REQUIRED:caseId');
    var defaults = [
      { kind: 'history',   content: 'Patient history (PHI-redacted stub)' },
      { kind: 'labs',      content: 'Labs bundle (PHI-redacted stub)' },
      { kind: 'imaging',   content: 'Imaging findings placeholder' },
      { kind: 'pathology', content: 'Pathology report placeholder' },
      { kind: 'genomic',   content: 'Genomic profile placeholder' },
      { kind: 'summary',   content: 'Discussion & MDT decision' }
    ];
    for (var i = 0; i < defaults.length; i++) {
      var r = this._storage.appendSlide(spec.caseId, defaults[i]);
      if (!r || r.ok !== true) {
        throw new Error((r && r.error) || 'SLIDE_BUILD_FAILED');
      }
    }
    var s = this._storage.slidesFor(spec.caseId);
    return {
      ok: true,
      caseId: spec.caseId,
      count: s.length,
      slides: s,
      brand: spec.brandName || 'NamaMedical',
      lang: spec.lang || 'en'
    };
  };

  MDTSlides.prototype.addSlide = function (spec) {
    spec = spec || {};
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.caseId) throw new Error('FIELD_REQUIRED:caseId');
    if (!spec.kind) throw new Error('FIELD_REQUIRED:kind');
    if (ALLOWED_KINDS.indexOf(spec.kind) === -1) {
      throw new Error('BAD_KIND');
    }
    var r = this._storage.appendSlide(spec.caseId, {
      kind: spec.kind,
      content: spec.content
    });
    if (!r || r.ok !== true) {
      throw new Error((r && r.error) || 'SLIDE_ADD_FAILED');
    }
    var s = this._storage.slidesFor(spec.caseId);
    return { ok: true, caseId: spec.caseId, count: s.length, slides: s };
  };

  MDTSlides.prototype.finalize = function (spec) {
    spec = spec || {};
    if (!spec.meetingId) throw new Error('FIELD_REQUIRED:meetingId');
    if (!spec.caseId) throw new Error('FIELD_REQUIRED:caseId');
    var s = this._storage.slidesFor(spec.caseId);
    var brand = spec.brandName || 'NamaMedical';
    var lang = spec.lang || 'en';

    var slideHtml = s.map(function (sl) {
      return [
        '<section class="slide" data-kind="' + _esc(sl.kind) + '" data-order="' + sl.order + '">',
          '<header><h3>' + _esc(sl.kind.toUpperCase()) + '</h3></header>',
          '<div class="body">' + _esc(sl.content) + '</div>',
          '<footer><span class="brand">' + _esc(brand) + '</span></footer>',
        '</section>'
      ].join('');
    }).join('');

    var html =
      '<!doctype html>' +
      '<html lang="' + _esc(lang) + '">' +
      '<head><meta charset="utf-8" />' +
      '<title>MDT Case ' + _esc(spec.caseId) + ' — ' + _esc(brand) + '</title>' +
      '<style>' +
        'body{font-family:Helvetica,Arial,sans-serif;color:#1c2b40;margin:0;padding:24px}' +
        '.slide{border:1px solid #ccd;padding:18px;margin-bottom:14px;page-break-after:always}' +
        'header h3{margin:0 0 8px 0;color:#0a3d62;text-transform:uppercase}' +
        '.body{white-space:pre-wrap;font-size:14pt;line-height:1.4}' +
        'footer{margin-top:12px;font-size:10pt;color:#7f8c8d}' +
      '</style></head>' +
      '<body>' +
        '<h1>MDT CASE PRESENTATION</h1>' +
        '<p>Case: <strong>' + _esc(spec.caseId) + '</strong> · Meeting: <strong>' + _esc(spec.meetingId) + '</strong></p>' +
        slideHtml +
      '</body></html>';

    return {
      ok: true,
      caseId: spec.caseId,
      meetingId: spec.meetingId,
      slideCount: s.length,
      html: html
    };
  };

  return MDTSlides;
});
