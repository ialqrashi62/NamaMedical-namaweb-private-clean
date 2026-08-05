// lib/llm/contextBuilder.js
// Build a structured prompt context window from patient history.
// Pure JS, no npm install. Deterministic, tenant-scoped, no PHI in logs.
//
// Inputs (all optional unless marked):
//   tenantId   REQUIRED
//   patientId  REQUIRED
//   encounters Array<{date?, type?, diagnosis?, summary?}>
//   vitals     Array<{date?, bp?, hr?, spo2?, temp?, rr?}>
//   labs       Array<{date?, name?, value?, unit?, flag?}>
//   notes      Array<string>
//   meds       Array<{name, dose?, route?, freq?, startDate?, endDate?}>
//   events     Array<{day?, date?, event?, note?}>  (timeline)
//   allergies  Array<string>
//   primaryDx  string  (e.g. 'I21.0 STEMI')
//   planId?, templateId?, lang?
//
// Output:
//   { tenantId, patientId, windowKey, prompt, sections, tokenEstimate, redactedCount, lang, templateId }

'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DischargeContextBuilder = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ---- PHI redaction: never echo raw PHI into logs ----
  // Redaction is conservative: if a field looks like an identifier, we hash
  // it on the way IN so the LLM never sees it and the LOGS never see it.
  function shortHash(s) {
    if (!s) return '';
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function redactId(value) {
    if (value === undefined || value === null) return '';
    var s = String(value);
    if (s.length <= 2) return '***';
    if (s.length <= 4) return s[0] + '***' + s[s.length - 1];
    return s.slice(0, 2) + '***' + s.slice(-2) + '#' + shortHash(s);
  }

  // ---- Token estimate (~4 chars per token heuristic) ----
  function estTokens(str) {
    if (!str) return 0;
    return Math.ceil(String(str).length / 4);
  }

  function asArray(x) {
    return Array.isArray(x) ? x : (x === undefined || x === null ? [] : [x]);
  }
  function safeStr(x, max) {
    if (x === undefined || x === null) return '';
    var s = String(x);
    if (!max || s.length <= max) return s;
    return s.slice(0, max) + '...';
  }

  function stableKey(obj) {
    // FNV-1a string hash; deterministic across runs.
    var s = JSON.stringify(obj, Object.keys(obj).sort());
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function buildPrompt(opts) {
    var lang = opts.lang || 'ar-SA';
    // English is the canonical fallback inside the LLM prompt (the LLM
    // understands English even when generating in other languages). Localized
    // output is applied at the draft layer.
    var parts = [];
    parts.push('SYSTEM: You are a clinical documentation assistant. Generate a discharge summary in ' + lang + '.');
    parts.push('Use ONLY the supplied patient context. If a field is missing, write "Not provided" rather than invent.');

    parts.push('TENANT: ' + redactId(opts.tenantId));
    parts.push('PATIENT: ' + redactId(opts.patientId));
    parts.push('PRIMARY_DX: ' + safeStr(opts.primaryDx, 200));

    if (Array.isArray(opts.allergies) && opts.allergies.length) {
      parts.push('ALLERGIES: ' + opts.allergies.map(function (a) { return safeStr(a, 80); }).join(', '));
    } else {
      parts.push('ALLERGIES: none recorded');
    }

    if (Array.isArray(opts.encounters) && opts.encounters.length) {
      parts.push('--- ENCOUNTERS ---');
      opts.encounters.slice(0, 5).forEach(function (e) {
        var line = '- ' + safeStr(e.date, 30)
          + ' | ' + safeStr(e.type || e.class, 40)
          + ' | Dx: ' + safeStr(e.diagnosis, 120);
        if (e.summary) line += ' | ' + safeStr(e.summary, 200);
        parts.push(line);
      });
    }

    if (Array.isArray(opts.vitals) && opts.vitals.length) {
      parts.push('--- LAST VITALS ---');
      // Take last 3 vitals for trend, never the whole series.
      opts.vitals.slice(-3).forEach(function (v) {
        var bits = [];
        if (v.bp) bits.push('BP ' + safeStr(v.bp, 12));
        if (v.hr) bits.push('HR ' + safeStr(v.hr, 12));
        if (v.spo2) bits.push('SpO2 ' + safeStr(v.spo2, 12));
        if (v.temp) bits.push('T ' + safeStr(v.temp, 12));
        if (v.rr) bits.push('RR ' + safeStr(v.rr, 12));
        parts.push('- ' + safeStr(v.date, 30) + ': ' + bits.join(' / '));
      });
    }

    if (Array.isArray(opts.labs) && opts.labs.length) {
      parts.push('--- RELEVANT LABS (abnormal + last value) ---');
      var abnormal = opts.labs.filter(function (l) {
        return l && l.flag && (l.flag === 'H' || l.flag === 'L' || l.flag === 'A');
      });
      var labset = abnormal.length ? abnormal : opts.labs.slice(-5);
      labset.forEach(function (l) {
        var line = '- ' + safeStr(l.name, 60)
          + ' = ' + safeStr(l.value, 30)
          + ' ' + safeStr(l.unit, 12)
          + (l.flag ? ' [' + l.flag + ']' : '');
        parts.push(line);
      });
    }

    if (Array.isArray(opts.notes) && opts.notes.length) {
      parts.push('--- CLINICAL NOTES ---');
      opts.notes.slice(0, 10).forEach(function (n, i) {
        parts.push('Note ' + (i + 1) + ': ' + safeStr(n, 400));
      });
    }

    if (Array.isArray(opts.meds) && opts.meds.length) {
      parts.push('--- ACTIVE / DISCHARGE MEDICATIONS ---');
      opts.meds.forEach(function (m) {
        var line = '- ' + safeStr(m.name, 80);
        if (m.dose) line += ' ' + safeStr(m.dose, 30);
        if (m.route) line += ' ' + safeStr(m.route, 20);
        if (m.freq) line += ' ' + safeStr(m.freq, 30);
        parts.push(line);
      });
    }

    if (Array.isArray(opts.events) && opts.events.length) {
      parts.push('--- HOSPITAL COURSE TIMELINE ---');
      opts.events.slice(0, 30).forEach(function (ev) {
        var day = ev.day !== undefined ? ('Day ' + ev.day) : safeStr(ev.date, 30);
        parts.push('- ' + day + ': ' + safeStr(ev.event, 160)
          + (ev.note ? ' (' + safeStr(ev.note, 160) + ')' : ''));
      });
    }

    parts.push('--- OUTPUT FORMAT ---');
    parts.push('Return JSON with keys: chiefComplaint, hpi, hospitalCourse, dischargeMeds (array), followUp, patientEducation (array).');
    parts.push('All text MUST be in ' + lang + '.');

    return parts.join('\n');
  }

  function build(opts) {
    if (!opts || !opts.tenantId) {
      var e = new Error('TENANT_REQUIRED');
      throw e;
    }
    if (!opts.patientId) {
      var e2 = new Error('PATIENT_REQUIRED');
      throw e2;
    }

    var lang = opts.lang || 'ar-SA';
    var templateId = opts.templateId || 'standard';

    var encounters = asArray(opts.encounters);
    var vitals = asArray(opts.vitals);
    var labs = asArray(opts.labs);
    var notes = asArray(opts.notes);
    var meds = asArray(opts.meds);
    var events = asArray(opts.events);
    var allergies = asArray(opts.allergies);

    var prompt = buildPrompt({
      tenantId: opts.tenantId,
      patientId: opts.patientId,
      primaryDx: opts.primaryDx,
      encounters: encounters,
      vitals: vitals,
      labs: labs,
      notes: notes,
      meds: meds,
      events: events,
      allergies: allergies,
      lang: lang
    });

    var key = stableKey({
      t: opts.tenantId,
      p: opts.patientId,
      dx: opts.primaryDx || '',
      e: encounters.length, v: vitals.length, l: labs.length,
      n: notes.length, m: meds.length, ev: events.length,
      lang: lang, tpl: templateId
    });

    var sectionSizes = {
      encounters: encounters.length,
      vitals: vitals.length,
      labs: labs.length,
      notes: notes.length,
      meds: meds.length,
      events: events.length,
      allergies: allergies.length
    };

    // Count how many identifiers we redacted — for audit only.
    var redactedCount = 0;
    if (opts.patientId) redactedCount++; // patient id already hashed above
    if (opts.tenantId) redactedCount++;

    return {
      tenantId: opts.tenantId,
      patientId: opts.patientId,
      windowKey: key,
      prompt: prompt,
      sections: sectionSizes,
      tokenEstimate: estTokens(prompt),
      redactedCount: redactedCount,
      lang: lang,
      templateId: templateId
    };
  }

  return {
    build: build,
    _redactId: redactId,
    _estTokens: estTokens,
    _stableKey: stableKey
  };
});
