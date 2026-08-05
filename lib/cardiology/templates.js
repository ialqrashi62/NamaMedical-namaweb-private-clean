// lib/cardiology/templates.js
// Cardiology structured-report templates (P16) — ASE 2018 echo templates,
// coronary cath templates, and stress test templates.
//
// Pure data, no dependencies, no PHI. RAIL-12: structured fields only,
// pre-validated option-lists. RAIL-5: tenantId is a required parameter
// at report-creation time (not in the templates themselves).
//
// Templates are versioned by ASE / ACC / AHA guidelines. Each template
// is a strict, ordered list of section-descriptors. Callers are expected
// to validate incoming fields against the descriptor before persisting.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CardiologyTemplates = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ASE 2018 chamber-quantification, valve, and chamber-pressure measurements.
  var ECHO_MEASUREMENTS = [
    'LVEF',     // left-ventricular ejection fraction (%)
    'LVIDd',    // LV internal diameter, diastole (mm)
    'LVIDs',    // LV internal diameter, systole (mm)
    'IVSd',     // interventricular septum, diastole (mm)
    'PWTd',     // posterior wall thickness, diastole (mm)
    'RVIDd',    // RV internal diameter, diastole (mm)
    'LAVi',     // left-atrial volume index (mL/m^2)
    'LVMi',     // LV mass index (g/m^2)
    'E/e\'',    // diastolic function index
    'TR Vmax',  // tricuspid regurgitant jet velocity (m/s)
    'PASP',     // pulmonary-artery systolic pressure (mmHg)
    'TAPSE',    // tricuspid annular plane systolic excursion (mm)
    'MAPSE'     // mitral annular plane systolic excursion (mm)
  ];

  var INDICATIONS = [
    'Chest pain',
    'Dyspnea',
    'Pre-op',
    'Follow-up',
    'Surveillance'
  ];

  var WALL_MOTION = ['Normal', 'Hypokinesia', 'Akinesia', 'Dyskinesia'];

  var VALVES = ['MR', 'MS', 'AR', 'AS', 'TR', 'TS', 'PR', 'PS'];

  var CATH_ACCESS = ['Radial', 'Femoral', 'Brachial'];

  // 5-grade stenosis scale aligned with SYNTAX / ACC lesion grading
  function _stenosisScale(segments) {
    return segments.map(function (s) {
      return {
        id: s.toLowerCase().replace(/\s+/g, '_'),
        label: s,
        type: 'select',
        options: ['Normal', '<50%', '50-70%', '>70%', '100%']
      };
    });
  }

  var TEMPLATES = {
    echo_complete: {
      templateId: 'echo_complete',
      name: 'Complete Echocardiogram Report (ASE 2018)',
      version: 'ASE-2018',
      sections: [
        { id: 'indication', label: 'Indication', type: 'select', options: INDICATIONS },
        {
          id: 'measurements',
          label: 'Measurements',
          type: 'measurements',
          items: ECHO_MEASUREMENTS
        },
        { id: 'wall_motion', label: 'Wall Motion', type: 'select', options: WALL_MOTION },
        { id: 'valves', label: 'Valves (multi)', type: 'multi', options: VALVES },
        { id: 'conclusion', label: 'Conclusion', type: 'textarea' }
      ]
    },

    cath_coronary: {
      templateId: 'cath_coronary',
      name: 'Coronary Catheterization Report',
      version: 'ACC-2018',
      sections: [
        { id: 'access', label: 'Access', type: 'select', options: CATH_ACCESS }
      ].concat(_stenosisScale(['LM', 'LAD', 'LCX', 'RCA']))
       .concat([
        { id: 'intervention', label: 'Intervention', type: 'textarea' },
        { id: 'conclusion', label: 'Conclusion', type: 'textarea' }
      ])
    },

    stress_test: {
      templateId: 'stress_test',
      name: 'Stress Test Report',
      version: 'ASE-2018',
      sections: [
        { id: 'protocol', label: 'Protocol', type: 'select', options: ['Bruce', 'Modified Bruce', 'Naughton', 'Pharmacologic'] },
        { id: 'duration', label: 'Duration (min)', type: 'number' },
        { id: 'mets', label: 'METs achieved', type: 'number' },
        { id: 'max_hr', label: 'Max HR (bpm)', type: 'number' },
        { id: 'st_changes', label: 'ST changes', type: 'select', options: ['None', 'Ischemic', 'Nondiagnostic'] },
        { id: 'symptoms', label: 'Symptoms', type: 'multi', options: ['None', 'Chest pain', 'Dyspnea', 'Fatigue', 'Palpitations'] },
        { id: 'conclusion', label: 'Conclusion', type: 'textarea' }
      ]
    }
  };

  function list() {
    var ids = Object.keys(TEMPLATES);
    return ids.map(function (id) {
      var t = TEMPLATES[id];
      return {
        templateId: id,
        name: t.name,
        version: t.version,
        sectionCount: t.sections.length
      };
    });
  }

  function get(templateId) {
    if (!templateId || typeof templateId !== 'string') return null;
    return TEMPLATES[templateId] || null;
  }

  return {
    TEMPLATES: TEMPLATES,
    ECHO_MEASUREMENTS: ECHO_MEASUREMENTS,
    INDICATIONS: INDICATIONS,
    WALL_MOTION: WALL_MOTION,
    VALVES: VALVES,
    CATH_ACCESS: CATH_ACCESS,
    list: list,
    get: get
  };
});
