// Oncology Engine: TNM staging + BSA (Mosteller) + Chemo dose calculation
// Pure deterministic, no I/O, no side effects

'use strict';

const TNM_STAGE_GROUPS = {
  // Generic 8th edition AJCC/UICC (TNM-8) groups
  // Stage is derived from T (1-4), N (0-3), M (0-1)
  // Simplified: maps to {IA, IB, IIA, IIB, IIIA, IIIB, IIIC, IV}
  0: { t_max: 0, n_max: 0, m_max: 0 },  // T0 N0 M0
  IA: { t_max: 1, n_max: 0, m_max: 0 },
  IB: { t_max: 2, n_max: 0, m_max: 0 },
  IIA: { t_max: 3, n_max: 0, m_max: 0 },
  IIB: { t_max: 4, n_max: 0, m_max: 0 },
  IIIA: { t_max: 1, n_max: 1, m_max: 0 },
  IIIB: { t_max: 2, n_max: 1, m_max: 0 },
  IIIC: { t_max: 3, n_max: 1, m_max: 0 },
  IIID: { t_max: 4, n_max: 1, m_max: 0 },
  IVA: { t_max: 2, n_max: 2, m_max: 1 },
  IVB: { t_max: 3, n_max: 2, m_max: 1 },
  IVC: { t_max: 4, n_max: 2, m_max: 1 }
};

function tnmStage(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.T === undefined || input.N === undefined || input.M === undefined) throw new Error('T, N, M required');
  if (![0, 1, 2, 3, 4].includes(input.T)) throw new Error('T must be 0-4');
  if (![0, 1, 2, 3].includes(input.N)) throw new Error('N must be 0-3');
  if (![0, 1].includes(input.M)) throw new Error('M must be 0-1');

  let stage = 'IV';
  if (input.M === 0 && input.N === 0 && input.T === 0) stage = '0';
  else if (input.M === 0 && input.N === 0 && input.T <= 1) stage = 'IA';
  else if (input.M === 0 && input.N === 0 && input.T === 2) stage = 'IB';
  else if (input.M === 0 && input.N === 0 && input.T === 3) stage = 'IIA';
  else if (input.M === 0 && input.N === 0 && input.T === 4) stage = 'IIB';
  else if (input.M === 0 && input.N === 1 && input.T === 1) stage = 'IIIA';
  else if (input.M === 0 && input.N === 1 && input.T === 2) stage = 'IIIB';
  else if (input.M === 0 && input.N === 1 && input.T === 3) stage = 'IIIC';
  else if (input.M === 0 && input.N === 1 && input.T === 4) stage = 'IIID';
  else if (input.M === 1 && input.N <= 1 && input.T <= 2) stage = 'IVA';
  else if (input.M === 1 && input.N === 2 && input.T <= 3) stage = 'IVB';
  else if (input.M === 1) stage = 'IVC';

  let prognosis = '';
  if (stage === '0' || stage === 'IA' || stage === 'IB') prognosis = 'Localized disease, excellent prognosis. 5-yr survival >90% (cancer-dependent).';
  else if (stage.startsWith('II')) prognosis = 'Localized advanced, 5-yr survival 50-80% (cancer-dependent). Multimodal therapy typical.';
  else if (stage.startsWith('III')) prognosis = 'Locally advanced, 5-yr survival 20-60% (cancer-dependent). Neoadjuvant or adjuvant therapy indicated.';
  else prognosis = 'Metastatic disease, 5-yr survival <20% (cancer-dependent). Palliative systemic therapy, goals-of-care discussion.';

  return {
    stage,
    tnm: { T: input.T, N: input.N, M: input.M },
    prognosis,
    notes: [
      'AJCC/UICC TNM 8th edition is current standard for most solid tumors.',
      'Stage grouping varies by cancer type (e.g., breast uses different TNM-8 rules than colorectal).',
      'Lymph node count matters in some cancers (e.g., colorectal requires ≥12 nodes examined for accurate N staging).',
      'Molecular markers (ER/PR/HER2 for breast, EGFR/ALK for lung) refine stage in modern oncology.'
    ],
    citations: ['AJCC TNM 8th Edition (2017)', 'UICC TNM Classification 2017']
  };
}

function bodySurfaceArea(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.weight_kg === undefined || input.height_cm === undefined) throw new Error('weight_kg and height_cm required');
  if (input.weight_kg <= 0) throw new Error('weight_kg must be > 0');
  if (input.height_cm <= 0) throw new Error('height_cm must be > 0');

  // Mosteller formula
  const bsa = Math.sqrt((input.weight_kg * input.height_cm) / 3600);
  return {
    bsa: Math.round(bsa * 100) / 100,
    formula: 'Mosteller',
    notes: [
      'Mosteller (1987) is the most commonly used formula for adults and pediatrics.',
      'Other formulas: DuBois & DuBois (1916), Haycock (1978, pediatrics), Gehan-George (1970).',
      'BSA used for chemotherapy dosing, fluid resuscitation (Parkland formula 4×BSA), cardiac index (CI=CO/BSA).',
      'Normal adult BSA: 1.5-2.0 m² (avg ~1.73 m² for 70kg/170cm).'
    ],
    citations: ['Mosteller 1987 (NEJM)']
  };
}

function chemoDose(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['weight_kg', 'height_cm', 'dose_mg_per_m2', 'renal_function_pct', 'hepatic_function_pct'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  const bsaResult = bodySurfaceArea({ weight_kg: input.weight_kg, height_cm: input.height_cm });
  let calculatedDose = bsaResult.bsa * input.dose_mg_per_m2;

  // Apply dose adjustments
  let adjustedDose = calculatedDose;
  const adjustments = [];

  if (input.renal_function_pct < 50) {
    const factor = input.renal_function_pct / 100;
    adjustedDose *= factor;
    adjustments.push(`Renal function ${input.renal_function_pct}% → dose ×${factor.toFixed(2)}`);
  } else if (input.renal_function_pct < 70) {
    adjustedDose *= 0.75;
    adjustments.push('Renal function 50-69% → 75% dose');
  }

  if (input.hepatic_function_pct < 30) {
    adjustedDose *= 0.5;
    adjustments.push('Hepatic function <30% → 50% dose');
  } else if (input.hepatic_function_pct < 50) {
    adjustedDose *= 0.75;
    adjustments.push('Hepatic function 30-49% → 75% dose');
  }

  if (input.neutropenia_anc && input.neutropenia_anc < 1.5) {
    adjustedDose *= 0.5;
    adjustments.push('ANC <1.5 → 50% dose (delay if <1.0)');
  }

  if (input.thrombocytopenia && input.thrombocytopenia < 100) {
    adjustedDose *= 0.5;
    adjustments.push('Platelets <100k → 50% dose (delay if <50k)');
  }

  // Cap at max body weight for obese patients
  if (input.cap_actual_weight_kg) {
    const capped = Math.min(calculatedDose, bsaResult.bsa * 2.0 * input.dose_mg_per_m2);
    if (capped < calculatedDose) {
      adjustedDose = capped;
      adjustments.push('Dose capped (obese patient, BSA >2.0)');
    }
  }

  return {
    bsa: bsaResult.bsa,
    calculatedDose: Math.round(calculatedDose * 10) / 10,
    adjustedDose: Math.round(adjustedDose * 10) / 10,
    adjustments,
    notes: [
      'Most chemotherapy is dosed by BSA (mg/m²). Targeted therapies often by weight (mg/kg) or flat dose.',
      'Cockcroft-Gault or CKD-EPI for renal function; Child-Pugh for hepatic function.',
      'Obese patients: cap BSA at 2.0 m² to avoid overdose (per ASCO guidelines).',
      'Verify drug-specific renal/hepatic dose adjustments in formulary (e.g., cisplatin, capecitabine).'
    ],
    citations: ['ASCO 2012 Chemotherapy Dosing in Obese Patients', 'Calvert formula for carboplatin']
  };
}

module.exports = { tnmStage, bodySurfaceArea, chemoDose, TNM_STAGE_GROUPS };
