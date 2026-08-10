// cardiology_engine.js
// Cardiology pure-functions engine (ESC 2024 + ACC/AHA 2024 + HRS guidelines)
// - GRACE score (ACS risk stratification)
// - HAS-BLED score (atrial fibrillation bleeding risk)
// - CHA2DS2-VASc score (AF stroke risk)
// - Heart Failure stage (NYHA + ACC/AHA stages)
// - ECG interpretation helper (STEMI detection)
// - Troponin interpretation (ACS rule-in/out)
// - ICD-10 codes (cardiology)
//
// All functions are pure (no DB, no I/O). Validation + safety rails enforced.

'use strict';

// ============================================================
// GRACE Score (ACS in-hospital mortality)
// Reference: Granger et al. Arch Intern Med 2003; Fox 2006 update
// ============================================================
function graceScore(input) {
  if (!input) throw new Error('graceScore: input required');
  const required = ['age', 'heart_rate', 'systolic_bp', 'creatinine_mg_dl', 'killip_class'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) {
      throw new Error(`graceScore: ${k} required`);
    }
  }
  let score = 0;
  // Age
  if (input.age < 40) score += 0;
  else if (input.age < 50) score += 18;
  else if (input.age < 60) score += 36;
  else if (input.age < 70) score += 55;
  else if (input.age < 80) score += 73;
  else score += 91;
  // HR
  if (input.heart_rate < 70) score += 0;
  else if (input.heart_rate < 90) score += 9;
  else if (input.heart_rate < 110) score += 17;
  else if (input.heart_rate < 130) score += 25;
  else if (input.heart_rate < 150) score += 34;
  else score += 43;
  // SBP
  if (input.systolic_bp < 80) score += 63;
  else if (input.systolic_bp < 100) score += 58;
  else if (input.systolic_bp < 120) score += 47;
  else if (input.systolic_bp < 140) score += 37;
  else if (input.systolic_bp < 160) score += 26;
  else if (input.systolic_bp < 200) score += 13;
  else score += 0;
  // Creatinine (mg/dL)
  if (input.creatinine_mg_dl < 0.4) score += 1;
  else if (input.creatinine_mg_dl < 0.8) score += 4;
  else if (input.creatinine_mg_dl < 1.2) score += 7;
  else if (input.creatinine_mg_dl < 1.6) score += 10;
  else if (input.creatinine_mg_dl < 2.0) score += 13;
  else if (input.creatinine_mg_dl < 4.0) score += 21;
  else score += 28;
  // Killip class
  score += [0, 21, 43, 64][Math.min(3, Math.max(0, input.killip_class))];
  // Cardiac arrest at admission
  if (input.cardiac_arrest_at_admission) score += 43;
  // ST-segment deviation
  if (input.st_deviation) score += 30;
  // Elevated cardiac enzymes
  if (input.elevated_enzymes) score += 15;

  let risk;
  if (score < 109) risk = 'low';
  else if (score < 140) risk = 'intermediate';
  else risk = 'high';

  const mortality = {
    low: { in_hospital: 0.02, six_month: 0.05 },
    intermediate: { in_hospital: 0.05, six_month: 0.12 },
    high: { in_hospital: 0.20, six_month: 0.40 }
  };

  return {
    score,
    risk,
    in_hospital_mortality: mortality[risk].in_hospital,
    six_month_mortality: mortality[risk].six_month,
    recommendation: risk === 'high'
      ? 'Invasive strategy within 24h; consider ICU admission'
      : risk === 'intermediate'
      ? 'Invasive strategy within 72h'
      : 'Conservative strategy acceptable',
    cite: 'GRACE-2006'
  };
}

// ============================================================
// CHA2DS2-VASc (AF stroke risk)
// Reference: Lip et al. Chest 2010; ESC 2024 AF guidelines
// ============================================================
function cha2ds2vasc(input) {
  if (!input) throw new Error('cha2ds2vasc: input required');
  const required = ['age', 'sex'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) {
      throw new Error(`cha2ds2vasc: ${k} required`);
    }
  }
  let score = 0;
  // CHF history
  if (input.chf) score += 1;
  // Hypertension
  if (input.hypertension) score += 1;
  // Age >= 75
  if (input.age >= 75) score += 2;
  // Diabetes
  if (input.diabetes) score += 1;
  // Stroke/TIA/thromboembolism history
  if (input.stroke_history) score += 2;
  // Vascular disease (MI, PAD, aortic plaque)
  if (input.vascular_disease) score += 1;
  // Age 65-74
  if (input.age >= 65 && input.age < 75) score += 1;
  // Sex female
  if (input.sex === 'female') score += 1;

  let anticoagulation;
  if (input.sex === 'male') {
    anticoagulation = score >= 2 ? 'recommended' : score === 1 ? 'consider' : 'no_anticoagulation';
  } else {
    anticoagulation = score >= 3 ? 'recommended' : score === 2 ? 'consider' : 'no_anticoagulation';
  }

  const annualStrokeRisk = {
    0: 0.0, 1: 1.3, 2: 2.2, 3: 3.2, 4: 4.8,
    5: 7.2, 6: 9.7, 7: 11.2, 8: 10.8, 9: 12.2
  };
  const risk = annualStrokeRisk[Math.min(9, score)] || 12.2;

  return {
    score,
    annual_stroke_risk_pct: risk,
    anticoagulation_recommendation: anticoagulation,
    preferred_agent: 'DOAC (apixaban or rivaroxaban) unless mechanical valve or moderate-severe MS',
    cite: 'ESC-2024-AF'
  };
}

// ============================================================
// HAS-BLED (bleeding risk on anticoagulation)
// Reference: Pisters et al. Chest 2010
// ============================================================
function hasBled(input) {
  if (!input) throw new Error('hasBled: input required');
  let score = 0;
  // H — Hypertension uncontrolled (>160 SBP)
  if (input.uncontrolled_hypertension) score += 1;
  // A — Abnormal renal/liver function (1 each)
  if (input.abnormal_renal) score += 1;
  if (input.abnormal_liver) score += 1;
  // S — Stroke history
  if (input.stroke_history) score += 1;
  // B — Bleeding history/predisposition
  if (input.bleeding_history) score += 1;
  // L — Labile INR (TTR <60%)
  if (input.labile_inr) score += 1;
  // E — Elderly (>65)
  if (input.age >= 65) score += 1;
  // D — Drugs/alcohol (1 each)
  if (input.concomitant_drugs) score += 1;
  if (input.alcohol_use) score += 1;

  const risk = score >= 3 ? 'high' : score >= 2 ? 'moderate' : 'low';

  return {
    score,
    risk,
    bleeding_events_per_100pt_years: score >= 5 ? 8.7 : score === 4 ? 5.4 : score === 3 ? 3.2 : score === 2 ? 1.9 : score === 1 ? 1.0 : 0.6,
    recommendation: risk === 'high'
      ? 'Caution with anticoagulation; address modifiable risk factors; closer monitoring'
      : 'Anticoagulation acceptable',
    cite: 'HAS-BLED-2010'
  };
}

// ============================================================
// NYHA Functional Class + ACC/AHA HF Stage
// ============================================================
function classifyHeartFailure(input) {
  if (!input || input.nyha_class === undefined) {
    throw new Error('classifyHeartFailure: nyha_class required');
  }
  if (input.nyha_class < 1 || input.nyha_class > 4) {
    throw new Error('classifyHeartFailure: nyha_class must be 1-4');
  }

  // ACC/AHA stage (based on risk factors + structural disease)
  let accaha_stage;
  const ef = input.lvef_pct;
  if (ef === undefined) {
    accaha_stage = null;
  } else if (ef >= 50) {
    accaha_stage = input.structural_heart_disease ? 'B' : 'A';
  } else if (ef >= 40) {
    accaha_stage = 'B';
  } else if (ef >= 30) {
    accaha_stage = 'C';
  } else {
    accaha_stage = 'D';
  }

  const nyhaDescriptions = {
    1: 'No limitation of physical activity',
    2: 'Slight limitation; comfortable at rest',
    3: 'Marked limitation; comfortable only at rest',
    4: 'Symptoms at rest; unable to carry on any physical activity'
  };

  let recommendedTherapy = [];
  if (input.nyha_class >= 2 && ef !== undefined) {
    if (ef <= 40) {
      recommendedTherapy = [
        { drug: 'ARNI (sacubitril-valsartan)', evidence: 'PARADIGM-HF' },
        { drug: 'Beta-blocker (carvedilol/metoprolol succinate/bisoprolol)', evidence: 'MERIT-HF, COPERNICUS' },
        { drug: 'MRA (spironolactone/eplerenone)', evidence: 'RALES, EMPHASIS-HF' },
        { drug: 'SGLT2 inhibitor (dapagliflozin/empagliflozin)', evidence: 'DAPA-HF, EMPEROR-Reduced' }
      ];
    } else if (ef < 50) {
      recommendedTherapy = [
        { drug: 'SGLT2 inhibitor (dapagliflozin/empagliflozin)', evidence: 'EMPEROR-Preserved, DELIVER' }
      ];
    }
  }

  return {
    nyha_class: input.nyha_class,
    nyha_description: nyhaDescriptions[input.nyha_class],
    accaha_stage: accaha_stage,
    lvef_category: ef === undefined ? 'unknown' : ef >= 50 ? 'preserved' : ef >= 40 ? 'mid-range' : 'reduced',
    recommended_therapy: recommendedTherapy,
    cite: 'ACC-AHA-HF-2022, ESC-HF-2023'
  };
}

// ============================================================
// Troponin interpretation (ACS rule-in/out)
// Reference: ESC NSTEMI 2020 + 4th Universal Definition MI
// ============================================================
function interpretTroponin(input) {
  if (!input) throw new Error('interpretTroponin: input required');
  const required = ['troponin_value', 'cutoff', 'delta_pct'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) {
      throw new Error(`interpretTroponin: ${k} required`);
    }
  }
  const { troponin_value, cutoff, delta_pct, hours_since_onset } = input;

  let interpretation;
  let acs_probability;

  if (troponin_value >= cutoff && delta_pct >= 20) {
    interpretation = 'rule_in_acs';
    acs_probability = 0.95;
  } else if (troponin_value >= cutoff && delta_pct < 20) {
    interpretation = 'chronic_elevation_or_other_cause';
    acs_probability = 0.30;
  } else if (troponin_value >= cutoff * 0.5 && delta_pct >= 20) {
    interpretation = 'probable_acs';
    acs_probability = 0.70;
  } else {
    interpretation = 'rule_out_acs';
    acs_probability = 0.05;
  }

  return {
    interpretation,
    acs_probability,
    troponin_value,
    cutoff,
    delta_pct,
    hours_since_onset: hours_since_onset ?? null,
    recommendation: interpretation === 'rule_in_acs'
      ? 'Activate cath lab; start dual antiplatelet (aspirin + P2Y12); anticoagulation; STAT ECG'
      : interpretation === 'probable_acs'
      ? 'Repeat troponin in 1-3h; consider stress test or CT angio'
      : interpretation === 'chronic_elevation_or_other_cause'
      ? 'Consider non-ACS causes (CKD, HF, PE, myocarditis, sepsis); repeat troponin + clinical correlation'
      : 'No evidence of ACS at this time; continue workup',
    cite: 'ESC-NSTEMI-2020'
  };
}

// ============================================================
// STEMI detection (ECG)
// ============================================================
function detectStemi(input) {
  if (!input) throw new Error('detectStemi: input required');
  const required = ['st_elevation_mm', 'leads'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) {
      throw new Error(`detectStemi: ${k} required`);
    }
  }
  const { st_elevation_mm, leads } = input;
  const leadsLower = leads.map(l => l.toLowerCase());

  // Anterior: V1-V4
  // Inferior: II, III, aVF
  // Lateral: I, aVL, V5, V6
  // Posterior: V1-V3 (depression)
  let territory = null;
  let isStemi = false;

  if (leadsLower.some(l => ['v1', 'v2', 'v3', 'v4'].includes(l)) && st_elevation_mm >= 2) {
    isStemi = true;
    territory = 'anterior';
  } else if (leadsLower.some(l => ['ii', 'iii', 'avf'].includes(l)) && st_elevation_mm >= 1) {
    isStemi = true;
    territory = 'inferior';
  } else if (leadsLower.some(l => ['i', 'avl', 'v5', 'v6'].includes(l)) && st_elevation_mm >= 1) {
    isStemi = true;
    territory = 'lateral';
  }

  // Posterior STEMI: ST depression in V1-V3 with upright T
  if (!isStemi && leadsLower.some(l => ['v1', 'v2', 'v3'].includes(l)) && st_elevation_mm < 0) {
    isStemi = true;
    territory = 'posterior';
  }

  return {
    is_stemi: isStemi,
    territory,
    st_elevation_mm,
    leads,
    recommendation: isStemi
      ? `STEMI detected (${territory}). Activate cath lab IMMEDIATELY. Door-to-balloon < 90 min. Aspirin 325mg chewed. P2Y12 inhibitor. Anticoagulation per protocol.`
      : 'No STEMI criteria met. Continue ACS workup; consider NSTEMI/unstable angina if clinical suspicion.',
    action: isStemi ? 'ACTIVATE_CATH_LAB' : 'CONTINUE_WORKUP',
    cite: 'ACC-AHA-STEMI-2013, ESC-STEMI-2017'
  };
}

// ============================================================
// ICD-10 codes (cardiology) — common subset
// ============================================================
const CARDIOLOGY_ICD10 = {
  ACS_NSTEMI: 'I21.4',
  ACS_STEMI_ANTERIOR: 'I21.0',
  ACS_STEMI_INFERIOR: 'I21.1',
  ACS_STEMI_LATERAL: 'I21.2',
  UNSTABLE_ANGINA: 'I20.0',
  ATRIAL_FIBRILLATION: 'I48.91',
  ATRIAL_FLUTTER: 'I48.92',
  HF_REDUCED_EF: 'I50.32',
  HF_PRESERVED_EF: 'I50.33',
  HYPERTENSION_ESSENTIAL: 'I10',
  HYPERTENSION_MALIGNANT: 'I10.1',
  HYPERTENSIVE_HEART: 'I11.9',
  HYPERTENSIVE_CKD: 'I12.9',
  AORTIC_STENOSIS: 'I35.0',
  AORTIC_REGURGITATION: 'I35.1',
  MITRAL_REGURGITATION: 'I34.0',
  MITRAL_STENOSIS: 'I34.2',
  PULMONARY_EMBOLISM: 'I26.99',
  DVT: 'I82.40',
  PERICARDITIS: 'I30.9',
  ENDOCARDITIS: 'I33.9',
  MYOCARDITIS: 'I40.9',
  CARDIOMYOPATHY_DILATED: 'I42.0',
  CARDIOMYOPATHY_HYPERTROPHIC: 'I42.1',
  ICD_IN_PLACE: 'Z95.810',
  PACEMAKER_IN_PLACE: 'Z95.0',
  HEART_TRANSPLANT: 'Z94.1',
  CABG_HISTORY: 'Z95.1',
  PCI_HISTORY: 'Z98.61',
  CORONARY_ANGINA: 'I20.9',
  SYNCOPE: 'R55',
  PALPITATIONS: 'R00.2',
  CHEST_PAIN_UNSPECIFIED: 'R07.9'
};

// ============================================================
// Exports
// ============================================================
module.exports = {
  graceScore,
  cha2ds2vasc,
  hasBled,
  classifyHeartFailure,
  interpretTroponin,
  detectStemi,
  CARDIOLOGY_ICD10,
  VERSION: '3.0.0',
  CITATIONS: {
    'GRACE-2006': 'Granger CB et al. Arch Intern Med 2003; Fox KA et al. BMJ 2006',
    'ESC-2024-AF': 'Van Gelder IC et al. Eur Heart J 2024',
    'HAS-BLED-2010': 'Pisters R et al. Chest 2010',
    'ACC-AHA-HF-2022': 'Heidenreich PA et al. Circulation 2022',
    'ESC-NSTEMI-2020': 'Collet JP et al. Eur Heart J 2021',
    'ESC-STEMI-2017': 'Ibanez B et al. Eur Heart J 2018',
    'ACC-AHA-STEMI-2013': 'O\'Gara PT et al. Circulation 2013'
  }
};
