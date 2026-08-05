// lib/cqm/qrda.js
// QRDA I document generator (P14).
// Pure JS, no npm install. Tenant-scoped (RAIL-5), no PHI (RAIL-12),
// generate XML well-formedness and section-presence validation.
//
// Exports a class so callers can `new QRDAGenerator()` and the constructor
// attaches back-reference `QRDAGenerator.QRDAGenerator = QRDAGenerator` so
// reflection consumers can recover the constructor name.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    var exportedClass = factory();
    exportedClass.QRDAGenerator = exportedClass;
    module.exports = exportedClass;
  } else {
    var cls = factory();
    cls.QRDAGenerator = cls;
    root.QRDAGenerator = cls;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Load measures catalog (lazy relative require)
  function _measures() {
    try {
      return require('./measures');
    } catch (e) {
      return null;
    }
  }

  function _storage() {
    try {
      return require('./storage');
    } catch (e) {
      return null;
    }
  }

  // XML well-formedness check (no external dep).
  // Treats self-closing `<x/>` as balanced; checks open `<x>` against
  // close `</x>` for non-self-closing tags. Sufficient for QRDA I
  // structural validation in the sandbox runner.
  function _wellFormed(xml) {
    if (!xml || typeof xml !== 'string') return { ok: false, error: 'EMPTY_XML' };
    // Strip self-closing tags `<x/>` and processing instructions `<?...?>`,
    // comments `<!-- ... -->` and declarations (e.g. <?xml ... ?>) first.
    var cleaned = xml
      .replace(/<\?[\s\S]*?\?>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<![\s\S]*?>/g, '');
    var selfClosing = (cleaned.match(/<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?\/>/g) || []).length;
    var open = cleaned.match(/<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?(?<!\/)>/g) || [];
    var close = cleaned.match(/<\/([A-Za-z_][\w:.-]*)>/g) || [];
    if (open.length !== close.length) {
      return { ok: false, error: 'TAG_BALANCE', open: open.length, close: close.length, selfClosing: selfClosing };
    }
    return { ok: true, selfClosing: selfClosing };
  }

  function _escape(s) {
    if (s === undefined || s === null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function _buildPatientList(spec, measure) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.measureId) throw new Error('FIELD_REQUIRED:measureId');
    if (!spec.periodStart) throw new Error('FIELD_REQUIRED:periodStart');
    if (!spec.periodEnd) throw new Error('FIELD_REQUIRED:periodEnd');
    var storage = _storage();
    var patients = [];
    if (storage && typeof storage.patientListFor === 'function') {
      patients = storage.patientListFor(spec.tenantId, spec.measureId, {
        start: spec.periodStart,
        end: spec.periodEnd
      });
    }
    // patient identifiers are display-only mrns (no PHI in logs)
    var rows = [];
    for (var i = 0; i < patients.length; i++) {
      rows.push({ mrn: patients[i].mrn || 'PT-' + (i + 1), ageBracket: patients[i].ageBracket || 'unspecified' });
    }
    return { ok: true, measureId: measure.id, count: rows.length, patients: rows };
  }

  QRDAGenerator.prototype.buildPatientList = function (spec) {
    var measures = _measures();
    var measure = measures && measures.MEASURES[spec.measureId];
    if (!measure) {
      throw new Error('UNKNOWN_MEASURE:' + spec.measureId);
    }
    return _buildPatientList(spec, measure);
  };

  QRDAGenerator.prototype.buildMeasureReport = function (spec) {
    spec = spec || {};
    if (!spec.tenantId) throw new Error('TENANT_REQUIRED');
    if (!spec.measureId) throw new Error('FIELD_REQUIRED:measureId');
    if (!spec.period || !spec.period.start || !spec.period.end) {
      throw new Error('FIELD_REQUIRED:period.start,period.end');
    }
    var measures = _measures();
    var measure = measures && measures.MEASURES[spec.measureId];
    if (!measure) throw new Error('UNKNOWN_MEASURE:' + spec.measureId);

    var storage = _storage();
    var counts = (storage && storage.populationFor)
      ? storage.populationFor(spec.tenantId, measure.id, spec.period)
      : { ipop: 0, denom: 0, numer: 0, exclusions: 0, exceptions: 0 };

    // Build a minimal-but-valid QRDA I XML containing the required
    // top-level sections: patient, encounter, measure, population, sampling.
    var patients = (storage && storage.patientListFor)
      ? storage.patientListFor(spec.tenantId, measure.id, spec.period)
      : [];

    var patientXml = '';
    for (var i = 0; i < patients.length; i++) {
      patientXml +=
        '  <patient>' +
          '<recordId>' + _escape(patients[i].mrn || ('PT-' + (i + 1))) + '</recordId>' +
          '<encounter>' + _escape(patients[i].encounterId || 'ENC-' + (i + 1)) + '</encounter>' +
        '</patient>\n';
    }
    if (!patientXml) patientXml = '  <!-- no patient rows in this period -->\n';

    var xml = '' +
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<qrdaI xmlns="urn:hl7-org:v3" reportType="measure">\n' +
      '  <measure documentId="' + _escape(measure.id) + '" title="' + _escape(measure.title) + '" domain="' + _escape(measure.domain) + '" valueSet="' + _escape(measure.valueSet || '') + '"/>\n' +
      '  <population periodStart="' + _escape(spec.period.start) + '" periodEnd="' + _escape(spec.period.end) + '">\n' +
      '    <ipop count="' + (counts.ipop || 0) + '"/>\n' +
      '    <denom count="' + (counts.denom || 0) + '"/>\n' +
      '    <numer count="' + (counts.numer || 0) + '"/>\n' +
      '    <exclusions count="' + (counts.exclusions || 0) + '"/>\n' +
      '    <exceptions count="' + (counts.exceptions || 0) + '"/>\n' +
      '  </population>\n' +
      '  <sampling method="none"/>\n' +
      '  <patients>\n' +
      patientXml +
      '  </patients>\n' +
      '</qrdaI>\n';

    return {
      ok: true,
      xml: xml,
      json: {
        tenantId: spec.tenantId,
        measureId: measure.id,
        title: measure.title,
        period: spec.period,
        ipop: counts.ipop || 0,
        denom: counts.denom || 0,
        numer: counts.numer || 0,
        exclusions: counts.exclusions || 0,
        exceptions: counts.exceptions || 0,
        patientCount: patients.length
      },
      ipop: counts.ipop || 0,
      denom: counts.denom || 0,
      numer: counts.numer || 0,
      exclusions: counts.exclusions || 0,
      exceptions: counts.exceptions || 0,
      requiredSections: ['measure', 'population', 'patients', 'sampling']
    };
  };

  QRDAGenerator.prototype.validateXml = function (xml) {
    var wf = _wellFormed(xml);
    if (!wf.ok) {
      return { ok: false, error: wf.error, open: wf.open, close: wf.close };
    }
    var required = ['qrdaI', 'measure', 'population', 'patients', 'sampling'];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      var needle = '<' + required[i] + '>';
      if (xml.indexOf(needle) === -1 && xml.indexOf('<' + required[i] + ' ') === -1) {
        missing.push(required[i]);
      }
    }
    if (missing.length) {
      return { ok: false, error: 'MISSING_SECTIONS', missing: missing };
    }
    return { ok: true };
  };

  function QRDAGenerator() {
    if (!(this instanceof QRDAGenerator)) {
      return new QRDAGenerator();
    }
    this.kind = 'qrda';
  }

  return QRDAGenerator;
});
