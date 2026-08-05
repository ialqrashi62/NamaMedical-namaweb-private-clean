// lib/anesthesia/oru.js
// HL7 ORU^R01 (waveform observation result) parser for the Anesthesia
// Monitor Integration (P15). Pure JS, no npm install.
//
// Parses an HL7 v2 ORU^R01 message and extracts OBX segments carrying
// vital signs (HR, SBP, DBP, SpO2, EtCO2, Temp, RR). Returns a normalized
// vital timeline with UCUM units and LOINC-style codes.
//
// Pipeline:
//   - split message into MSH/PID/PV1/OBR/OBX segments
//   - decode HL7 default escape sequences (\F\, \R\, \S\, \T\, \E\)
//   - map each OBX to { ts, code, value, unit, source }
//   - drop OBX rows that are not numeric (NM) or cannot be mapped

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnesthesiaOru = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // LOINC-style observation identifiers (UCUM units).
  var VITAL_MAP = {
    '8867-4':  { code: 'HR',     title: 'Heart rate',          unit: '/min' },
    '8480-6':  { code: 'SBP',    title: 'Systolic BP',         unit: 'mm[Hg]' },
    '8462-4':  { code: 'DBP',    title: 'Diastolic BP',        unit: 'mm[Hg]' },
    '59408-5': { code: 'SpO2',   title: 'Oxygen saturation',   unit: '%' },
    '33452-4': { code: 'EtCO2',  title: 'End-tidal CO2',       unit: 'mm[Hg]' },
    '8310-5':  { code: 'Temp',   title: 'Body temperature',    unit: 'Cel' },
    '9279-1':  { code: 'RR',     title: 'Respiratory rate',    unit: '/min' },
    // Legacy HL7 codes used by older anesthesia carts
    'HR':      { code: 'HR',     title: 'Heart rate',          unit: '/min' },
    'SBP':     { code: 'SBP',    title: 'Systolic BP',         unit: 'mm[Hg]' },
    'DBP':     { code: 'DBP',    title: 'Diastolic BP',        unit: 'mm[Hg]' },
    'SPO2':    { code: 'SpO2',   title: 'Oxygen saturation',   unit: '%' },
    'ETCO2':   { code: 'EtCO2',  title: 'End-tidal CO2',       unit: 'mm[Hg]' },
    'TEMP':    { code: 'Temp',   title: 'Body temperature',    unit: 'Cel' },
    'RR':      { code: 'RR',     title: 'Respiratory rate',    unit: '/min' }
  };

  function _decodeEscape(s) {
    if (typeof s !== 'string') return s;
    return s
      .replace(/\\F\\/g, '|')
      .replace(/\\R\\/g, '~')
      .replace(/\\S\\/g, '^')
      .replace(/\\T\\/g, '&')
      .replace(/\\E\\/g, '\\')
      .replace(/\\\.br\\/g, '\n');
  }

  function _field(part, idx) {
    if (typeof part !== 'string') return '';
    var parts = part.split('|');
    return (parts[idx] !== undefined && parts[idx] !== null) ? String(_decodeEscape(parts[idx])) : '';
  }

  function _component(part, idx) {
    if (typeof part !== 'string') return '';
    var parts = part.split('^');
    return (parts[idx] !== undefined && parts[idx] !== null) ? String(_decodeEscape(parts[idx])) : '';
  }

  function _parseSegment(line) {
    // MSH is special: its first delimiter is MSH-1 (encoding chars). We
    // split into fields differently only when needed.
    return line.split('|');
  }

  function _parseOru(raw) {
    if (!raw || typeof raw !== 'string') {
      return { ok: false, error: 'EMPTY_MESSAGE' };
    }
    // Normalize line endings (HL7 typically uses \r)
    var lines = raw.split(/\r\n|\r|\n/).filter(function (l) { return l && l.length > 0; });
    if (!lines.length) return { ok: false, error: 'NO_SEGMENTS' };

    var msh = null;
    var pid = null;
    var pv1 = null;
    var patientId = null;
    var sendingApp = null;
    var sendingFacility = null;
    var messageTs = null;
    var obsCount = 0;
    var vitals = [];
    var skipped = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var seg = _parseSegment(line);
      var segName = seg[0];
      if (segName === 'MSH') {
        // MSH field delimiter is seg[1][0] (|) and component delim is seg[1][1] (^)
        msh = seg;
        sendingApp = seg[2] || null;
        sendingFacility = seg[3] || null;
        messageTs = seg[7] || null;
        var controlId = seg[9] || null;
        // MSH doesn't split cleanly via '|' so we stash as opaque
        if (!msh._controlId) msh._controlId = controlId;
      } else if (segName === 'PID') {
        pid = seg;
        patientId = _component(seg[3] || '', 0) || _field(seg[3] || '', 0);
      } else if (segName === 'PV1') {
        pv1 = seg;
      } else if (segName === 'OBX') {
        obsCount++;
        // OBX-3 (observation identifier) is seg[3], which is CWE; the
        // first component is the code, second is the text, third is the
        // coding system.
        var identifier = seg[3] || '';
        var code = _component(identifier, 0);
        var map = VITAL_MAP[code] || null;
        var valueType = (seg[2] || '').toUpperCase();
        var valueRaw = seg[5] || '';
        var unitRaw = seg[6] || '';
        // Only emit numeric observations
        if (!map) { skipped++; continue; }
        if (valueType !== 'NM' && valueType !== 'SN') {
          // Some carts send typed values without NM; tolerate simple floats
          if (!/^-?\d+(\.\d+)?$/.test(valueRaw)) { skipped++; continue; }
        }
        var tsRaw = seg[14] || messageTs || null;
        if (!tsRaw) { skipped++; continue; }
        var ts = _normalizeTs(tsRaw);
        if (!ts) { skipped++; continue; }
        var v = parseFloat(valueRaw);
        if (!isFinite(v)) { skipped++; continue; }
        vitals.push({
          ts: ts,
          code: map.code,
          title: map.title,
          value: v,
          unit: unitRaw || map.unit,
          loinc: code !== map.code ? code : null,
          source: {
            sendingApp: sendingApp,
            sendingFacility: sendingFacility,
            messageControlId: msh && msh._controlId ? msh._controlId : null
          }
        });
      }
    }

    if (!msh) return { ok: false, error: 'MISSING_MSH' };
    if (!vitals.length && obsCount === 0) {
      return { ok: false, error: 'NO_OBX' };
    }

    return {
      ok: true,
      patientId: patientId,
      sendingApp: sendingApp,
      sendingFacility: sendingFacility,
      messageTs: _normalizeTs(messageTs),
      count: vitals.length,
      skipped: skipped,
      vitals: vitals
    };
  }

  function _normalizeTs(s) {
    if (!s || typeof s !== 'string') return null;
    // HL7 timestamps: YYYYMMDDHHMMSS[.SSSS][+ZZZZ]
    var m = s.match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
    if (!m) return null;
    var Y = parseInt(m[1], 10);
    var Mo = m[2] ? parseInt(m[2], 10) - 1 : 0;
    var D = m[3] ? parseInt(m[3], 10) : 1;
    var H = m[4] ? parseInt(m[4], 10) : 0;
    var Mi = m[5] ? parseInt(m[5], 10) : 0;
    var S = m[6] ? parseInt(m[6], 10) : 0;
    if (isNaN(Y)) return null;
    return new Date(Date.UTC(Y, Mo, D, H, Mi, S)).toISOString();
  }

  // Convenience: parseOru(raw) — exports the parser
  function parseOru(raw) { return _parseOru(raw); }

  // For tests: expose the in-memory vital map
  function _map() { return JSON.parse(JSON.stringify(VITAL_MAP)); }

  return {
    parseOru: parseOru,
    _map: _map,
    _normalizeTs: _normalizeTs,
    _field: _field,
    _component: _component,
    VITAL_MAP: VITAL_MAP
  };
});
