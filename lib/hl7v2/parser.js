'use strict';
// lib/hl7v2/parser.js
// Minimal HL7 v2.x parser — P3 HL7v2 Inbound layer.
// Supports: ADT^A01 (Admission), ORM^O01 (Order), ORU^R01 (Result).
// Pure JS, no npm install.
//
// HL7 v2 conventions:
//   - Segments separated by \r (carriage return); tolerant of \n / \r\n.
//   - Fields separated by | (MSH-1).
//   - Components separated by ^ (MSH-2).
//   - Repetitions separated by ~ (MSH-3).
//   - Escape character \ (MSH-4).
//   - MSH segment is special: position 1 is the field separator itself,
//     so the field list after MSH-1 has 1 fewer element than other segments.
//   - Subcomponents use & (we do not deeply parse them).
//
// SAFETY:
//   - No PHI in this layer. All extractors return synthetic field arrays.
//   - Parser is read-only and side-effect-free.
//
// Scope: P3 HL7v2 Inbound. Not a full MLLP framing layer; transport
// is the caller's responsibility (POST body or socket adapter).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HL7v2Parser = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // Default delimiters per HL7 v2.5 spec; we override from MSH-1/MSH-2 if present.
  var DEFAULT_FIELD = '|';
  var DEFAULT_COMPONENT = '^';
  var DEFAULT_REPETITION = '~';
  var DEFAULT_ESCAPE = '\\';
  var DEFAULT_SUBCOMPONENT = '&';

  function splitLines(raw) {
    if (typeof raw !== 'string') return [];
    // HL7 v2 mandates \r as the segment terminator, but real-world feeds
    // often include \n or \r\n. Normalize first, then split on \r.
    var normalized = raw.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
    return normalized.split('\r');
  }

  function detectDelimiters(mshLine) {
    // MSH|^~\&|...  -> positions: 0=MSH, 1=|, 2=^~\&
    if (typeof mshLine !== 'string' || mshLine.length < 4) {
      return {
        field: DEFAULT_FIELD,
        component: DEFAULT_COMPONENT,
        repetition: DEFAULT_REPETITION,
        escape: DEFAULT_ESCAPE,
        subcomponent: DEFAULT_SUBCOMPONENT
      };
    }
    var field = mshLine.charAt(3) || DEFAULT_FIELD;
    var encChars = mshLine.substring(4, 8);
    return {
      field: field,
      component: encChars.charAt(0) || DEFAULT_COMPONENT,
      repetition: encChars.charAt(1) || DEFAULT_REPETITION,
      escape: encChars.charAt(2) || DEFAULT_ESCAPE,
      subcomponent: encChars.charAt(3) || DEFAULT_SUBCOMPONENT
    };
  }

  // Decode common HL7 escape sequences so downstream mappers see clean text.
  // \F\ -> |, \S\ -> ^, \R\ -> ~, \E\ -> \, \T\ -> &
  function decodeEscapes(value, esc) {
    if (typeof value !== 'string' || !esc) return value;
    var out = value;
    out = out.split(esc + 'F' + esc).join('|');
    out = out.split(esc + 'S' + esc).join('^');
    out = out.split(esc + 'R' + esc).join('~');
    out = out.split(esc + 'E' + esc).join(esc);
    out = out.split(esc + 'T' + esc).join('&');
    return out;
  }

  function HL7Parser() {
    // Stateless; constructor kept for future per-instance config.
  }

  // Parse raw HL7 v2 text into a structured object.
  // Returns: { type, trigger, messageControlId, sendingApp, sendingFacility,
  //            timestamp, segments: [{ name, fields: [String, ...] }],
  //            raw: String }
  HL7Parser.prototype.parse = function parse(raw) {
    var lines = splitLines(raw);
    if (lines.length === 0 || !lines[0] || lines[0].indexOf('MSH') !== 0) {
      var err = new Error('MSH segment missing or message is empty');
      err.code = 'HL7_MSH_MISSING';
      throw err;
    }
    var msh = lines[0];
    var delims = detectDelimiters(msh);

    // For MSH, split on the field separator directly.
    // Per HL7 v2 spec, MSH-1 is the field separator itself and MSH-2 is the
    // encoding characters. After splitting the raw line on '|', we get:
    //   mshFields[0]  = 'MSH'
    //   mshFields[1]  = '^~\&'   (the encoding chars, which were between
    //                              the first and second field separator)
    //   mshFields[2]  = 'HIS'    (MSH-3 sending app)
    //   mshFields[3]  = 'HOSP'   (MSH-4 sending facility)
    //   ...
    // To make mshAt(N) be a clean array lookup, we insert two placeholders
    // at indices 1 and 2 (for MSH-1 and MSH-2) and shift the rest down.
    var mshFields = msh.split(delims.field);
    var encodingRaw = mshFields[1] || '';
    if (encodingRaw.length >= 4) {
      delims.component = encodingRaw.charAt(0) || delims.component;
      delims.repetition = encodingRaw.charAt(1) || delims.repetition;
      delims.escape = encodingRaw.charAt(2) || delims.escape;
      delims.subcomponent = encodingRaw.charAt(3) || delims.subcomponent;
    }

    function splitFields(seg) {
      return seg.split(delims.field);
    }

    // Build MSH segment so that mshAt(N) returns fields[N]. MSH-1 and MSH-2
    // are inserted as empty string placeholders (per the spec the field
    // separator and encoding chars are not part of the visible field list).
    var mshRecord = {
      name: 'MSH',
      fields: [mshFields[0] || 'MSH', '', ''].concat(mshFields.slice(2))
    };

    var segments = [mshRecord];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var segFields = splitFields(line);
      segments.push({
        name: segFields[0] || '',
        fields: segFields
      });
    }

    // MSH field accessors (1-based in spec -> 0-based with the synthetic [0]).
    function mshAt(n) {
      // n is 1-based; index 0 is 'MSH', index 1 is '' (field sep), index 2 is enc chars.
      return mshRecord.fields[n] || '';
    }

    var msgTypeRaw = mshAt(9) || '';     // e.g. "ADT^A01"
    var typeParts = msgTypeRaw.split(delims.component);
    var type = typeParts[0] || '';
    var trigger = typeParts[1] || '';

    return {
      type: type,
      trigger: trigger,
      messageControlId: mshAt(10),
      sendingApp: mshAt(3),
      sendingFacility: mshAt(4),
      receivingApp: mshAt(5),
      receivingFacility: mshAt(6),
      timestamp: mshAt(7),
      processingId: mshAt(11),
      versionId: mshAt(12),
      segments: segments,
      raw: raw,
      delimiters: delims
    };
  };

  // Locate first segment with a given name (case-insensitive).
  function findSegment(parsed, name) {
    if (!parsed || !Array.isArray(parsed.segments)) return null;
    var upper = String(name || '').toUpperCase();
    for (var i = 0; i < parsed.segments.length; i++) {
      if (String(parsed.segments[i].name || '').toUpperCase() === upper) {
        return parsed.segments[i];
      }
    }
    return null;
  }

  // Split a field value into components (1-based -> 0-based array).
  function components(fieldValue, comp) {
    if (typeof fieldValue !== 'string' || fieldValue === '') return [];
    return fieldValue.split(comp);
  }

  // ADT extractor. Returns: { patientId, familyName, givenName, middleName,
  //                           sex, dob, attendingDoctor, attendingDoctorId, address }
  HL7Parser.prototype.extractPatient = function extractPatient(parsed) {
    var pid = findSegment(parsed, 'PID');
    if (!pid) return null;
    var comp = parsed && parsed.delimiters ? parsed.delimiters.component : '^';
    // PID-3 = Patient Identifier List (CX) — first repetition, first component = id
    var pid3 = components(pid.fields[3], comp);
    var pid3_0 = components(pid3[0] || '', comp);
    var patientId = pid3_0[0] || '';
    // PID-5 = Person Name (XPN) — first repetition, components: family^given^middle
    var pid5 = components(pid.fields[5], comp);
    var pid5_0 = components(pid5[0] || '', comp);
    var familyName = pid5_0[0] || '';
    var givenName = pid5_0[1] || '';
    var middleName = pid5_0[2] || '';
    // PID-7 = Date/Time of Birth (TS) — YYYYMMDD[HHMM]
    var dob = (pid.fields[7] || '').substring(0, 8);
    // PID-8 = Sex (IS)
    var sex = pid.fields[8] || '';
    // PV1-7 = Attending Doctor (XCN) — first repetition: id^family^given
    var pv1 = findSegment(parsed, 'PV1');
    var attendingDoctorId = '';
    var attendingDoctorFamily = '';
    var attendingDoctorGiven = '';
    if (pv1 && pv1.fields[7]) {
      var pv1_7 = components(pv1.fields[7], comp);
      var pv1_7_0 = components(pv1_7[0] || '', comp);
      attendingDoctorId = pv1_7_0[0] || '';
      attendingDoctorFamily = pv1_7_0[1] || '';
      attendingDoctorGiven = pv1_7_0[2] || '';
    }
    // PID-11 = Address (XAD) — first repetition, first 3 components
    var pid11 = components(pid.fields[11] || '', comp);
    var pid11_0 = components(pid11[0] || '', comp);
    var address = {
      line: pid11_0[0] || '',
      city: pid11_0[2] || '',
      country: pid11_0[3] || ''
    };
    return {
      patientId: patientId,
      familyName: familyName,
      givenName: givenName,
      middleName: middleName,
      sex: sex,
      dob: dob,
      attendingDoctor: {
        id: attendingDoctorId,
        familyName: attendingDoctorFamily,
        givenName: attendingDoctorGiven
      },
      address: address
    };
  };

  // ORM extractor. Returns: { placerOrderNumber, orderControl, orderCode,
  //                           orderName, orderingProvider, patientId }
  HL7Parser.prototype.extractOrder = function extractOrder(parsed) {
    var orc = findSegment(parsed, 'ORC');
    if (!orc) return null;
    var comp = parsed && parsed.delimiters ? parsed.delimiters.component : '^';
    // ORC-2 = Placer Order Number (EI)
    var placerOrderNumber = orc.fields[2] || '';
    // ORC-1 = Order Control (ID)
    var orderControl = orc.fields[1] || '';
    // OBR-4 = Universal Service Identifier (CE/CWE) — code^text^codingSystem
    var obr = findSegment(parsed, 'OBR');
    var orderCode = '';
    var orderName = '';
    if (obr) {
      var obr4 = components(obr.fields[4] || '', comp);
      var obr4_0 = components(obr4[0] || '', comp);
      orderCode = obr4_0[0] || '';
      orderName = obr4_0[1] || '';
    }
    // ORC-12 = Ordering Provider (XCN)
    var orc12 = components(orc.fields[12] || '', comp);
    var orc12_0 = components(orc12[0] || '', comp);
    var orderingProvider = {
      id: orc12_0[0] || '',
      familyName: orc12_0[1] || '',
      givenName: orc12_0[2] || ''
    };
    // Patient ID from PID-3 (reuse extractPatient)
    var patient = this.extractPatient(parsed);
    var patientId = patient ? patient.patientId : '';
    return {
      placerOrderNumber: placerOrderNumber,
      orderControl: orderControl,
      orderCode: orderCode,
      orderName: orderName,
      orderingProvider: orderingProvider,
      patientId: patientId
    };
  };

  // ORU extractor. Returns: { orderNumber, observationCode, observationName,
  //                           value, unit, referenceRange, patientId, abnormalFlag }
  HL7Parser.prototype.extractResult = function extractResult(parsed) {
    var obr = findSegment(parsed, 'OBR');
    if (!obr) return null;
    var comp = parsed && parsed.delimiters ? parsed.delimiters.component : '^';
    // OBR-2 = Placer Order Number (EI) — filler order number is OBR-3; prefer placer.
    var orderNumber = obr.fields[2] || obr.fields[3] || '';
    // OBX segment(s) — first one is canonical for a single-result R01.
    var obx = findSegment(parsed, 'OBX');
    var observationCode = '';
    var observationName = '';
    var value = '';
    var unit = '';
    var referenceRange = '';
    var abnormalFlag = '';
    if (obx) {
      // OBX-3 = Observation Identifier (CE/CWE)
      var obx3 = components(obx.fields[3] || '', comp);
      var obx3_0 = components(obx3[0] || '', comp);
      observationCode = obx3_0[0] || '';
      observationName = obx3_0[1] || '';
      // OBX-5 = Observation Value (varies; treat as string)
      value = obx.fields[5] || '';
      // OBX-6 = Units (CE/CWE)
      var obx6 = components(obx.fields[6] || '', comp);
      var obx6_0 = components(obx6[0] || '', comp);
      unit = obx6_0[0] || '';
      // OBX-7 = Reference Range (ST)
      referenceRange = obx.fields[7] || '';
      // OBX-8 = Abnormal Flags (IS)
      abnormalFlag = obx.fields[8] || '';
    }
    var patient = this.extractPatient(parsed);
    var patientId = patient ? patient.patientId : '';
    return {
      orderNumber: orderNumber,
      observationCode: observationCode,
      observationName: observationName,
      value: value,
      unit: unit,
      referenceRange: referenceRange,
      abnormalFlag: abnormalFlag,
      patientId: patientId
    };
  };

  // Build an HL7 v2 ACK/NACK message for a given control id and outcome.
  // ackCode: 'AA' (Application Accept) | 'AE' (Application Error) | 'AR' (Reject)
  // textMessage: human-readable reason (NACK only).
  HL7Parser.prototype.buildAck = function buildAck(opts) {
    var sendingApp = (opts && opts.sendingApp) || 'NAMAMEDICAL';
    var sendingFacility = (opts && opts.sendingFacility) || 'NAMAMEDICAL';
    var receivingApp = (opts && opts.receivingApp) || '';
    var receivingFacility = (opts && opts.receivingFacility) || '';
    var messageControlId = (opts && opts.messageControlId) || '';
    var ackCode = (opts && opts.ackCode) || 'AA';
    var textMessage = (opts && opts.textMessage) || '';
    var timestamp = (opts && opts.timestamp) || formatTimestamp(new Date());

    // MSH|^~\&|SENDING|SFAC|RECV|RFAC|TS||ACK|<controlId>|P|2.5
    var mshLine = [
      'MSH',
      '|',
      '^~\\&',
      sendingApp,
      sendingFacility,
      receivingApp,
      receivingFacility,
      timestamp,
      '',
      'ACK',
      messageControlId,
      'P',
      '2.5'
    ].join('|');

    // MSA|<code>|<controlId>|<textMessage>
    var msaFields = ['MSA', ackCode, messageControlId, textMessage].join('|');
    return mshLine + '\r' + msaFields + '\r';
  };

  function formatTimestamp(d) {
    function pad(n, w) {
      var s = String(n);
      while (s.length < (w || 2)) s = '0' + s;
      return s;
    }
    return d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds());
  }

  // Attach namespace-style helpers directly onto the constructor so that
  // `require('./parser')` is itself constructable (new-able) AND the named
  // exports are still reachable for callers that prefer the namespace form.
  HL7Parser.HL7Parser = HL7Parser;
  HL7Parser.create = function () { return new HL7Parser(); };
  HL7Parser._splitLines = splitLines;
  HL7Parser._detectDelimiters = detectDelimiters;
  HL7Parser._decodeEscapes = decodeEscapes;
  HL7Parser._findSegment = findSegment;
  HL7Parser._formatTimestamp = formatTimestamp;

  return HL7Parser;
});
