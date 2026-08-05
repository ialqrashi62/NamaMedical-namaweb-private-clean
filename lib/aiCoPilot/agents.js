// lib/aiCoPilot/agents.js
// Specialist agent catalog for the AI Co-pilot (P24).
// 5 deterministic mock specialists. Each has a profile + expertise
// + prompt template + response format. Pure JS, no npm install.
//
// Agents:
//   radiologist   — imaging interpretation
//   pathologist   — biopsy / cytology
//   oncologist    — staging + treatment planning
//   pharmacist    — medication safety + interactions
//   intensivist   — ICU / sepsis / organ-support decisions
//
// Every mock opinion includes confidence (0..1) and structured
// citations (PMID / DOI / local guideline). Output format is strict
// per agent so downstream consensus can parse reliably.
//
// RAIL-12: never log raw PHI; the agents only consume pre-redacted
// clinical context and emit redacted opinions.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoPilotAgents = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---- agent catalog -------------------------------------------------

  var AGENTS = {
    radiologist: {
      role: 'radiologist',
      display: 'Radiologist',
      expertise: ['imaging_interpretation', 'tumor_measurement', 'RECIST', 'BIRADS'],
      citationSources: [
        { type: 'PMID', id: '22876374', label: 'RECIST 1.1 update (Eur J Cancer, 2009)' },
        { type: 'GUIDELINE', id: 'NCCN-2024-breast', label: 'NCCN Breast Cancer Guidelines 2024' }
      ],
      promptTemplate:
        'Given the imaging findings provided, classify the lesion(s), assign a ' +
        'RECIST or BIRADS category, and recommend the next imaging step.',
      responseFormat: {
        interpretation: 'string',
        category: 'string',     // RECIST / BIRADS / LI-RADS code or 'unclear'
        measurements: 'array',  // [{structure, mm}]
        nextStep: 'string'
      }
    },
    pathologist: {
      role: 'pathologist',
      display: 'Pathologist',
      expertise: ['biopsy_interpretation', 'IHC', 'molecular_markers', 'TNM'],
      citationSources: [
        { type: 'PMID', id: '28498280', label: 'AJCC Cancer Staging Manual 8th ed.' },
        { type: 'GUIDELINE', id: 'WHO-2022-classification', label: 'WHO Classification of Tumours, 5th ed.' }
      ],
      promptTemplate:
        'Given the pathology report, state the histologic diagnosis, grade, ' +
        'and any IHC / molecular marker results relevant to therapy.',
      responseFormat: {
        diagnosis: 'string',
        grade: 'string',
        ihc: 'array',           // [{marker, result}]
        molecular: 'array',     // [{gene, status}]
        margin: 'string'        // 'clear' | 'involved' | 'unknown'
      }
    },
    oncologist: {
      role: 'oncologist',
      display: 'Medical Oncologist',
      expertise: ['systemic_therapy', 'staging', 'prognosis', 'clinical_trials'],
      citationSources: [
        { type: 'GUIDELINE', id: 'NCCN-2024', label: 'NCCN Guidelines (current edition)' },
        { type: 'DOI', id: '10.1056/NEJMoa2203690', label: 'Recent practice-changing trial' }
      ],
      promptTemplate:
        'Given stage, comorbidities, and prior therapy, recommend a systemic ' +
        'regimen, line of therapy, and whether a trial slot applies.',
      responseFormat: {
        recommendation: 'string',
        lineOfTherapy: 'number',
        regimen: 'string',
        eligibilityTrial: 'boolean',
        rationale: 'string'
      }
    },
    pharmacist: {
      role: 'pharmacist',
      display: 'Clinical Pharmacist',
      expertise: ['drug_interactions', 'dose_adjustment', 'renal_hepatic', 'BCMA'],
      citationSources: [
        { type: 'PMID', id: '29383383', label: 'Common drug-drug interactions in oncology' },
        { type: 'GUIDELINE', id: 'ASCO-2024-onc-pharm', label: 'ASCO Oncology Pharmacy Standards' }
      ],
      promptTemplate:
        'Review the medication list for interactions, renal / hepatic dose ' +
        'adjustments, and duplicate therapy.',
      responseFormat: {
        interactions: 'array',  // [{pair, severity, action}]
        doseAdjustments: 'array',
        duplicates: 'array',
        allergyFlag: 'boolean'
      }
    },
    intensivist: {
      role: 'intensivist',
      display: 'Intensivist',
      expertise: ['sepsis', 'ARDS', 'shock', 'organ_failure', 'SOFA'],
      citationSources: [
        { type: 'PMID', id: '34599691', label: 'Surviving Sepsis Campaign 2021' },
        { type: 'GUIDELINE', id: 'SCCM-2024-ICU', label: 'SCCM ICU admission guidelines' }
      ],
      promptTemplate:
        'Assess severity of illness, current organ support, and recommend ' +
        'the next ICU-level intervention (escalation, de-escalation, or ' +
        'maintenance).',
      responseFormat: {
        sofaScore: 'number',
        interventions: 'array',  // [{action, urgency}]
        escalation: 'string',    // 'step_up' | 'maintain' | 'step_down'
        watchpoints: 'array'
      }
    }
  };

  // ---- deterministic mock LLM ---------------------------------------

  function _seeded(seed) {
    // small djb2-ish hash → int
    var h = 5381;
    for (var i = 0; i < seed.length; i++) {
      h = ((h << 5) + h) + seed.charCodeAt(i);
      h = h | 0;
    }
    return Math.abs(h);
  }

  function _confidence(role, context) {
    // Deterministic per (role,context) — confidence ∈ [0.55, 0.95]
    var s = _seeded(role + '|' + (context && context.patientId ? context.patientId : '')
      + '|' + (context && context.caseId ? context.caseId : ''));
    var base = 0.55 + (s % 41) / 100;  // 0.55..0.95
    // shaky cases: reduce confidence when findings list is empty
    if (!context || !context.findings || context.findings.length === 0) {
      base = Math.max(0.50, base - 0.10);
    }
    return Math.round(base * 100) / 100;
  }

  // ---- per-agent opinion generators ---------------------------------

  function _radiologistOpinion(ctx, conf) {
    var findings = (ctx && ctx.findings) || [];
    var has_mass = findings.some(function (f) {
      return f && typeof f.kind === 'string' && /mass|lesion|nodule/i.test(f.kind);
    });
    var measurements = findings
      .filter(function (f) { return f && typeof f.mm === 'number'; })
      .map(function (f) { return { structure: f.structure || f.kind || 'lesion', mm: f.mm }; });
    return {
      interpretation: has_mass
        ? 'Index lesion with measurable components; assess for response vs progression.'
        : 'No measurable target lesion documented; consider non-target disease only.',
      category: has_mass ? 'RECIST-1.1' : 'unclear',
      measurements: measurements,
      nextStep: has_mass ? 'Confirm measurements on follow-up imaging in 8–12 weeks.' :
                             'Recommend dedicated protocol imaging if clinically indicated.'
    };
  }

  function _pathologistOpinion(ctx, conf) {
    var findings = (ctx && ctx.findings) || [];
    var dx = findings.find(function (f) { return f && f.diagnosis; });
    var ihc = findings.filter(function (f) { return f && f.marker; })
      .map(function (f) { return { marker: f.marker, result: f.result || 'pending' }; });
    return {
      diagnosis: (dx && dx.diagnosis) || 'Pending pathology review',
      grade: (dx && dx.grade) || 'not reported',
      ihc: ihc.length ? ihc : [{ marker: 'not_reported', result: 'pending' }],
      molecular: findings.filter(function (f) { return f && f.gene; })
        .map(function (f) { return { gene: f.gene, status: f.status || 'pending' }; }),
      margin: (dx && dx.margin) || 'unknown'
    };
  }

  function _oncologistOpinion(ctx, conf) {
    var findings = (ctx && ctx.findings) || [];
    var stage = findings.find(function (f) { return f && f.stage; });
    return {
      recommendation: stage
        ? ('Stage ' + stage.stage + ': discuss systemic therapy + trial slot.')
        : 'Stage not yet finalised; defer regimen until full staging available.',
      lineOfTherapy: 1,
      regimen: stage ? 'regimen_pending_consensus' : 'regimen_requires_stage',
      eligibilityTrial: !!(stage && stage.stage),
      rationale: 'Awaiting consensus from radiology + pathology before final regimen.'
    };
  }

  function _pharmacistOpinion(ctx, conf) {
    var meds = (ctx && ctx.medications) || [];
    return {
      interactions: meds.length > 1 ? [{
        pair: meds.slice(0, 2).map(function (m) { return m && m.name; }).join(' + '),
        severity: 'low',
        action: 'monitor'
      }] : [],
      doseAdjustments: meds
        .filter(function (m) { return m && m.renalFlag; })
        .map(function (m) {
          return { drug: m.name, currentDose: m.dose, suggestedDose: 'reduced', reason: 'renal' };
        }),
      duplicates: [],
      allergyFlag: !!(ctx && ctx.allergyFlag)
    };
  }

  function _intensivistOpinion(ctx, conf) {
    var vitals = (ctx && ctx.vitals) || {};
    var sofaGuess = (vitals.lactate && vitals.lactate > 2) ? 8
                  : (vitals.mbp && vitals.mbp < 65) ? 6
                  : 3;
    return {
      sofaScore: sofaGuess,
      interventions: [{
        action: 'hourly_vitals',
        urgency: sofaGuess >= 6 ? 'urgent' : 'routine'
      }],
      escalation: sofaGuess >= 6 ? 'step_up' : 'maintain',
      watchpoints: ['lactate_trend', 'urine_output', 'mental_status']
    };
  }

  // ---- public surface ------------------------------------------------

  function listAgents() {
    var out = [];
    for (var k in AGENTS) {
      if (!Object.prototype.hasOwnProperty.call(AGENTS, k)) continue;
      var a = AGENTS[k];
      out.push({
        role: a.role,
        display: a.display,
        expertise: a.expertise.slice(),
        citations: a.citationSources.slice()
      });
    }
    return out;
  }

  function getAgent(role) {
    if (!role || !AGENTS[role]) return null;
    var a = AGENTS[role];
    return {
      role: a.role,
      display: a.display,
      expertise: a.expertise.slice(),
      citations: a.citationSources.slice(),
      promptTemplate: a.promptTemplate,
      responseFormat: a.responseFormat
    };
  }

  // opinion(role, context, evidenceHints?) — pure deterministic mock
  function opinion(role, context, hints) {
    var agent = AGENTS[role];
    if (!agent) return { ok: false, error: 'AGENT_UNKNOWN:' + role };
    hints = hints || {};
    var conf = (typeof hints.confidenceOverride === 'number')
      ? hints.confidenceOverride : _confidence(role, context);
    var note;
    if (role === 'radiologist')  note = _radiologistOpinion(context, conf);
    else if (role === 'pathologist')  note = _pathologistOpinion(context, conf);
    else if (role === 'oncologist')    note = _oncologistOpinion(context, conf);
    else if (role === 'pharmacist')    note = _pharmacistOpinion(context, conf);
    else if (role === 'intensivist')   note = _intensivistOpinion(context, conf);
    else return { ok: false, error: 'AGENT_NOT_HANDLED:' + role };

    return {
      ok: true,
      role: role,
      display: agent.display,
      opinion: note,
      confidence: conf,
      citations: agent.citationSources.map(function (c) {
        return { type: c.type, id: c.id, label: c.label };
      }),
      promptTemplate: agent.promptTemplate,
      format: agent.responseFormat,
      ts: new Date().toISOString()
    };
  }

  return {
    listAgents: listAgents,
    getAgent: getAgent,
    opinion: opinion,
    _roles: Object.keys(AGENTS).slice()
  };
});
