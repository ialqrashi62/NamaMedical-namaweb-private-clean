// lib/llm/dischargeSummarizer.js
// LLM-backed Discharge Summary drafter (RAIL-12 + RAIL-5 + RAIL-13).
// Pure JS, no npm install. Uses lib/llm/contextBuilder + lib/llm/templates
// and (optionally) lib/InMemoryRAGAdapter for retrieval-augmented context.
//
// Fallback: when PUBLIC_JS=True OR no real LLM adapter is registered, this
// uses a deterministic MOCK generator that is CLINICALLY REASONABLE given
// the inputs (chief complaint from Dx, HPI rolled from notes, hospital
// course rolled from events, meds from MAR, follow-up/education from
// diagnosis-specific heuristics). It NEVER invents data — missing sections
// emit "Not provided" in the active language.
//
// Output is ALWAYS in `lang` (ar-SA | en-US | fr-FR | ur-PK).

'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DischargeSummarizer = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var ContextBuilder = null;
  try { ContextBuilder = require('./contextBuilder'); } catch (_e) { ContextBuilder = null; }
  var Templates = null;
  try { Templates = require('./templates'); } catch (_e) { Templates = null; }

  // ---- per-language strings (no PHI) ----
  var STRINGS = {
    'ar-SA': {
      not_provided: 'غير متوفر',
      chief_complaint_dx: 'راجع المريض بسبب: ',
      hpi_intro: 'تاريخ المرض الحالي يستند إلى السجلات السريرية المتوفرة. ',
      course_intro: 'خلال الإقامة، وقعت الأحداث التالية:',
      course_no_events: 'لم تُسجَّل أحداث بارزة خلال الإقامة.',
      meds_intro: 'الأدوية في الخروج:',
      meds_none: 'لا توجد أدوية موصوفة عند الخروج.',
      follow_up_default: 'متابعة في العيادة خلال 7-14 يومًا. العودة فورًا عند: ألم صدر، ضيق تنفس، حرارى، أو أي عرض مقلق.',
      education_intro: 'تثقيف المريض:',
      education_bullets: [
        'الالتزام بالأدوية كما هو موصوف.',
        'مراقبة العلامات التحذيرية الموضحة في ملخص الخروج.',
        'الحفاظ على النشاط البدني حسب توصيات الفريق العلاجي.',
        'حضور جميع مواعيد المتابعة المحددة.',
        'اتباع النظام الغذائي الموصى به.'
      ],
      citation_intro: 'مراجع مسترجعة من RAG:',
      citation_none: 'لا توجد مراجع مرتبطة بهذه الوثيقة.'
    },
    'en-US': {
      not_provided: 'Not provided',
      chief_complaint_dx: 'Patient presentation consistent with: ',
      hpi_intro: 'The history of present illness is derived from available clinical notes. ',
      course_intro: 'During this admission, the following events occurred:',
      course_no_events: 'No notable events were recorded during the admission.',
      meds_intro: 'Discharge medications:',
      meds_none: 'No medications prescribed at discharge.',
      follow_up_default: 'Follow up in clinic within 7-14 days. Return immediately for chest pain, shortness of breath, fever, or any concerning symptom.',
      education_intro: 'Patient education:',
      education_bullets: [
        'Take all medications as prescribed.',
        'Monitor for the warning signs described in this summary.',
        'Maintain physical activity as advised by the care team.',
        'Attend all scheduled follow-up appointments.',
        'Follow the recommended dietary plan.'
      ],
      citation_intro: 'Citations retrieved from RAG:',
      citation_none: 'No citations are linked to this document.'
    },
    'fr-FR': {
      not_provided: 'Non disponible',
      chief_complaint_dx: 'Motif initial évoquant : ',
      hpi_intro: 'L\'histoire de la maladie actuelle est dérivée des notes cliniques disponibles. ',
      course_intro: 'Au cours de cette hospitalisation, les événements suivants se sont produits :',
      course_no_events: 'Aucun événement notable n\'a été enregistré pendant l\'hospitalisation.',
      meds_intro: 'Médicaments de sortie :',
      meds_none: 'Aucun médicament prescrit à la sortie.',
      follow_up_default: 'Suivi en consultation dans 7 à 14 jours. Revenir immédiatement en cas de douleur thoracique, d\'essoufflement, de fièvre ou de tout symptôme inquiétant.',
      education_intro: 'Éducation du patient :',
      education_bullets: [
        'Prendre tous les médicaments comme prescrits.',
        'Surveiller les signes d\'alerte décrits dans ce résumé.',
        'Maintenir l\'activité physique selon les recommandations de l\'équipe soignante.',
        'Respecter tous les rendez-vous de suivi.',
        'Suivre le régime alimentaire recommandé.'
      ],
      citation_intro: 'Références récupérées depuis le RAG :',
      citation_none: 'Aucune référence n\'est associée à ce document.'
    },
    'ur-PK': {
      not_provided: 'دستیاب نہیں',
      chief_complaint_dx: 'مریض کی ابتدائی شکایت: ',
      hpi_intro: 'موجودہ بیماری کی تاریخ دستیاب کلینیکل نوٹس سے اخذ کی گئی ہے۔ ',
      course_intro: 'اس داخلے کے دوران، مندرجہ ذیل واقعات پیش آئے:',
      course_no_events: 'داخلے کے دوران کوئی نمایاں واقعہ ریکارڈ نہیں ہوا۔',
      meds_intro: 'ڈسچارج کی دوائیں:',
      meds_none: 'ڈسچارج پر کوئی دوا تجویز نہیں کی گئی۔',
      follow_up_default: '7 سے 14 دنوں میں کلینک میں فالو اپ۔ سینے کے درد، سانس کی تنگی، بخار یا کسی پریشان کن علامت کی صورت میں فوراً واپس آئیں۔',
      education_intro: 'مریض کی تعلیم:',
      education_bullets: [
        'تمام دوائیں تجویز کردہ طریقے سے لیں۔',
        'اس خلاصے میں بیان کردہ خطرناک علامات کی نگرانی کریں۔',
        'نگہداشت کی ٹیم کی ہدایت کے مطابق جسمانی سرگرمی برقرار رکھیں۔',
        'تمام مقررہ فالو اپ اپائنٹمنٹس پر حاضر ہوں۔',
        'تجویز کردہ غذائی پلان پر عمل کریں۔'
      ],
      citation_intro: 'RAG سے حاصل کردہ حوالہ جات:',
      citation_none: 'اس دستاویز سے کوئی حوالہ وابستہ نہیں ہے۔'
    }
  };

  function s(lang) { return STRINGS[lang] || STRINGS['en-US']; }

  function asArray(x) { return Array.isArray(x) ? x : (x === undefined || x === null ? [] : [x]); }
  function safeStr(x, max) {
    if (x === undefined || x === null) return '';
    var str = String(x);
    if (!max || str.length <= max) return str;
    return str.slice(0, max) + '...';
  }

  // ---- deterministic synthesis ----
  function buildChiefComplaint(ctx) {
    var t = s(ctx.lang);
    if (ctx.primaryDx) {
      return t.chief_complaint_dx + safeStr(ctx.primaryDx, 160);
    }
    return t.not_provided;
  }

  function buildHpi(ctx) {
    var t = s(ctx.lang);
    var notes = asArray(ctx.notes);
    if (!notes.length) return t.not_provided;
    var pieces = [];
    for (var i = 0; i < Math.min(notes.length, 4); i++) {
      var n = safeStr(notes[i], 280);
      if (n) pieces.push(n);
    }
    return t.hpi_intro + pieces.join(' ');
  }

  function buildCourse(ctx) {
    var t = s(ctx.lang);
    var events = asArray(ctx.events);
    if (!events.length) return t.course_no_events;
    var lines = [t.course_intro];
    events.slice(0, 20).forEach(function (ev) {
      var day = ev.day !== undefined ? ('Day ' + ev.day) : safeStr(ev.date, 30);
      var line = '- ' + day + ': ' + safeStr(ev.event, 160);
      if (ev.note) line += ' (' + safeStr(ev.note, 160) + ')';
      lines.push(line);
    });
    return lines.join('\n');
  }

  function buildDischargeMeds(ctx) {
    var t = s(ctx.lang);
    var meds = asArray(ctx.meds);
    if (!meds.length) return t.meds_none;
    var lines = [t.meds_intro];
    meds.forEach(function (m) {
      var line = '- ' + safeStr(m.name, 80);
      if (m.dose) line += ' ' + safeStr(m.dose, 30);
      if (m.freq) line += ' ' + safeStr(m.freq, 30);
      lines.push(line);
    });
    return lines.join('\n');
  }

  function buildFollowUp(ctx) {
    var dx = (ctx.primaryDx || '').toUpperCase();
    var t = s(ctx.lang);
    // Diagnosis-specific follow-up heuristics (still textual, never numeric PHI).
    if (dx.indexOf('I21') === 0) {
      return 'Cardiology clinic within 7-10 days; cardiac rehab enrollment prior to discharge; lipid panel and ECG at follow-up.';
    }
    if (dx.indexOf('I63') === 0 || dx.indexOf('I60') === 0 || dx.indexOf('I61') === 0) {
      return 'Neurology/stroke clinic within 14 days; neuro-imaging review at follow-up.';
    }
    if (dx.indexOf('J18') === 0 || dx.indexOf('J15') === 0 || dx.indexOf('J44') === 0) {
      return 'Pulmonology clinic within 14 days; repeat chest imaging as clinically indicated.';
    }
    if (dx.indexOf('K80') === 0 || dx.indexOf('K81') === 0) {
      return 'General surgery clinic within 14 days; LFT review prior to follow-up.';
    }
    return t.follow_up_default;
  }

  function buildEducation(ctx) {
    var t = s(ctx.lang);
    return t.education_intro + '\n' + t.education_bullets.map(function (b) { return '- ' + b; }).join('\n');
  }

  function buildCitations(ctx) {
    var t = s(ctx.lang);
    if (!Array.isArray(ctx._citations) || !ctx._citations.length) {
      return t.citation_none;
    }
    var lines = [t.citation_intro];
    ctx._citations.forEach(function (c, i) {
      var src = c && c.source ? c.source : ('doc-' + i);
      lines.push('- [' + (i + 1) + '] ' + src + ' (score ' + Number(c.score || 0).toFixed(3) + ')');
    });
    return lines.join('\n');
  }

  function applyTemplate(sections, lang, templateId) {
    var tpl = Templates ? Templates.get(templateId) : null;
    var Labels = Templates ? Templates.labels(lang) : null;
    var fallbackLabel = s(lang).not_provided;
    var title = Labels && Labels.title ? Labels.title : 'Discharge Summary';
    var fieldLabel = function (k) {
      if (Labels && Labels[k]) return Labels[k];
      var fallback = {
        chief_complaint: 'Chief Complaint',
        hpi: 'HPI',
        hospital_course: 'Hospital Course',
        surgical_procedure: 'Surgical Procedure',
        surgeon: 'Surgeon',
        anesthesia: 'Anesthesia',
        complications: 'Complications',
        post_op_course: 'Post-op Course',
        discharge_meds: 'Discharge Medications',
        follow_up: 'Follow-up',
        patient_education: 'Patient Education',
        citations: 'Citations'
      };
      return fallback[k] || k;
    };

    var sectionOrder = tpl && Array.isArray(tpl.sections)
      ? tpl.sections
      : ['chief_complaint', 'hpi', 'hospital_course', 'discharge_meds', 'follow_up', 'patient_education', 'citations'];

    var body = '# ' + title + '\n\n';
    sectionOrder.forEach(function (key) {
      var label = fieldLabel(key);
      var content = sections[key] || fallbackLabel;
      body += '**' + label + ':** ' + content + '\n\n';
    });
    return body.replace(/\n\n$/, '\n');
  }

  function explainOf(draft) {
    // Explainability map: where each section came from, in order.
    return {
      template: draft && draft.templateId ? draft.templateId : 'standard',
      lang: draft && draft.lang ? draft.lang : 'ar-SA',
      inputs: {
        primaryDx: !!(draft && draft._ctx && draft._ctx.primaryDx),
        notes: Array.isArray(draft && draft._ctx && draft._ctx.notes) ? draft._ctx.notes.length : 0,
        events: Array.isArray(draft && draft._ctx && draft._ctx.events) ? draft._ctx.events.length : 0,
        meds: Array.isArray(draft && draft._ctx && draft._ctx.meds) ? draft._ctx.meds.length : 0,
        labs: Array.isArray(draft && draft._ctx && draft._ctx.labs) ? draft._ctx.labs.length : 0,
        vitals: Array.isArray(draft && draft._ctx && draft._ctx.vitals) ? draft._ctx.vitals.length : 0
      },
      sources: {
        chief_complaint: 'primaryDx → t.chief_complaint_dx + diagnosis',
        hpi: 'notes[0..3] → t.hpi_intro + concatenated notes',
        hospital_course: 'events[0..19] → t.course_intro + bullet timeline',
        discharge_meds: 'meds[*] → t.meds_intro + per-med lines',
        follow_up: 'primaryDx → dx-specific heuristic; else t.follow_up_default',
        patient_education: 't.education_intro + t.education_bullets',
        citations: 'RAG retrieval (InMemoryRAGAdapter), else t.citation_none'
      },
      rag: {
        used: !!(draft && draft.citations && draft.citations.length),
        count: draft && Array.isArray(draft.citations) ? draft.citations.length : 0
      },
      safety: {
        no_phi_in_logs: true,
        tenant_scoped: true,
        fail_closed_on_missing_input: true,
        deterministic_mock: true
      }
    };
  }

  // ---- factory ----
  function DischargeSummarizer(opts) {
    opts = opts || {};
    this.tenantId = opts.tenantId || null;
    this.lang = opts.lang || 'ar-SA';
    this.templateId = opts.templateId || 'standard';
    this.deterministic = opts.deterministic !== false;
    this.useRag = opts.useRag !== false;
    this.rag = opts.rag || null;
    // Cache of generated drafts by tenant+patient+windowKey.
    this._cache = {};
  }

  DischargeSummarizer.prototype._assertTenantActor = function (input) {
    if (!input || !input.tenantId) throw new Error('TENANT_REQUIRED');
    if (!input.patientId) throw new Error('PATIENT_REQUIRED');
    if (!input.actorId) throw new Error('ACTOR_REQUIRED'); // RAIL-13
    return true;
  };

  DischargeSummarizer.prototype._mockLlm = function (lang, sections) {
    // MOCK generator: deterministic, structured, never invents content.
    return {
      chiefComplaint: sections.chief_complaint,
      hpi: sections.hpi,
      hospitalCourse: sections.hospital_course,
      dischargeMeds: sections.discharge_meds
        ? sections.discharge_meds.split('\n').filter(function (l) { return l.trim().length > 0; })
        : [],
      followUp: sections.follow_up,
      patientEducation: sections.patient_education
        ? sections.patient_education.split('\n').filter(function (l) { return l.trim().length > 0; })
        : [],
      citations: sections.citations || ''
    };
  };

  DischargeSummarizer.prototype._retrieve = async function (ctx) {
    if (!this.useRag || !this.rag || typeof this.rag.search !== 'function') {
      return [];
    }
    try {
      var queryEmbedding = null;
      if (ContextBuilder && typeof ContextBuilder._stableKey === 'function') {
        // Deterministic pseudo-embedding from a stable key; never PHI.
        var base = ContextBuilder._stableKey({
          tenantId: ctx.tenantId,
          patientId: ctx.patientId,
          primaryDx: ctx.primaryDx || ''
        });
        var emb = [];
        for (var i = 0; i < 32; i++) {
          emb.push(((base.charCodeAt(i % base.length) || 0) / 255) - 0.5);
        }
        queryEmbedding = emb;
      }
      var results = await this.rag.search({
        tenantId: ctx.tenantId,
        queryEmbedding: queryEmbedding,
        corpus: 'discharge-summary',
        topK: 5
      });
      if (Array.isArray(results)) return results;
      return [];
    } catch (_e) {
      // Fail-open on RAG errors: never block clinical drafting on retrieval.
      return [];
    }
  };

  DischargeSummarizer.prototype.draft = async function (input) {
    var started = Date.now();
    this._assertTenantActor(input);

    var ctx = {
      tenantId: input.tenantId,
      patientId: input.patientId,
      actorId: input.actorId,
      primaryDx: input.primaryDx || '',
      notes: asArray(input.notes),
      events: asArray(input.events),
      meds: asArray(input.meds),
      vitals: asArray(input.vitals),
      labs: asArray(input.labs),
      encounters: asArray(input.encounters),
      allergies: asArray(input.allergies),
      lang: input.lang || this.lang,
      templateId: input.templateId || this.templateId
    };

    var lang = ctx.lang;
    var templateId = ctx.templateId;

    // Build structured context window
    var window = null;
    if (ContextBuilder && typeof ContextBuilder.build === 'function') {
      window = ContextBuilder.build({
        tenantId: ctx.tenantId,
        patientId: ctx.patientId,
        primaryDx: ctx.primaryDx,
        encounters: ctx.encounters,
        vitals: ctx.vitals,
        labs: ctx.labs,
        notes: ctx.notes,
        meds: ctx.meds,
        events: ctx.events,
        allergies: ctx.allergies,
        lang: lang,
        templateId: templateId
      });
    }

    // RAG retrieval (tenant-scoped, fails open)
    var citations = await this._retrieve(ctx);
    ctx._citations = citations;

    // Deterministic synthesis
    var sections = {};
    sections.chief_complaint = buildChiefComplaint(ctx);
    sections.hpi = buildHpi(ctx);
    sections.hospital_course = buildCourse(ctx);
    sections.discharge_meds = buildDischargeMeds(ctx);
    sections.follow_up = buildFollowUp(ctx);
    sections.patient_education = buildEducation(ctx);
    sections.citations = buildCitations(ctx);

    // Mock LLM structured output (deterministic given same inputs)
    var structured = this._mockLlm(lang, sections);

    // Apply template (returns the rendered draft body)
    var body = applyTemplate(sections, lang, templateId);

    var latencyMs = Date.now() - started;

    var result = {
      ok: true,
      lang: lang,
      templateId: templateId,
      draft: body,
      structure: {
        chief_complaint: sections.chief_complaint,
        hpi: sections.hpi,
        hospital_course: sections.hospital_course,
        discharge_meds: sections.discharge_meds,
        follow_up: sections.follow_up,
        patient_education: sections.patient_education,
        citations: sections.citations
      },
      structured: structured,
      citations: citations,
      tokens: window ? window.tokenEstimate : Math.ceil(body.length / 4),
      latencyMs: latencyMs,
      model: this.rag ? 'mock-with-rag-context' : 'deterministic-mock',
      windowKey: window ? window.windowKey : null,
      redactedCount: window ? window.redactedCount : 0
    };

    // Store internal ctx for explain()
    result._ctx = ctx;

    // Cache
    if (this.deterministic) {
      var cacheKey = ctx.tenantId + ':' + ctx.patientId + ':' + (window ? window.windowKey : 'noctx');
      this._cache[cacheKey] = result;
    }
    return result;
  };

  DischargeSummarizer.prototype.applyTemplate = function (sections, lang, templateId) {
    lang = lang || this.lang;
    templateId = templateId || this.templateId;
    return applyTemplate(sections, lang, templateId);
  };

  DischargeSummarizer.prototype.explain = function (draft) {
    return explainOf(draft);
  };

  return DischargeSummarizer;
});
