// Hematology & Infectious Disease Engine: Wells DVT/PE + HAS-BLED + CURB-65
// Pure deterministic, no I/O, no side effects

'use strict';

const WELLS_DVT_CATEGORIES = {
  unlikely: { max: 0, label: 'DVT unlikely' },
  likely: { min: 1, label: 'DVT likely' }
};

const WELLS_PE_CATEGORIES = {
  unlikely: { max: 4, label: 'PE unlikely' },
  likely: { min: 6, label: 'PE likely' }
};

const HAS_BLED_INTERP = {
  low: { max: 2, label: 'Low bleed risk' },
  moderate: { min: 3, label: 'Moderate bleed risk' },
  high: { min: 4, label: 'High bleed risk' }
};

const CURB65_INTERP = {
  low: { val: 0, label: 'Low mortality (outpatient)' },
  low_mid: { val: 1, label: 'Low mortality' },
  moderate: { val: 2, label: 'Moderate risk (consider admission)' },
  high: { min: 3, label: 'High mortality (ICU admission)' }
};

function wellsDVT(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['active_cancer', 'paralysis_paresis_recent_immobilization', 'recently_bedridden_3d_or_major_surgery_12w', 'localized_tenderness', 'entire_leg_swollen', 'calf_swelling_3cm', 'pitting_edema', 'collateral_superficial_veins', 'previously_documented_dvt', 'alternative_diagnosis_likely'];
  for (const k of required) {
    if (input[k] === undefined) input[k] = false;
  }

  let score = 0;
  if (input.active_cancer) score += 1;
  if (input.paralysis_paresis_recent_immobilization) score += 1;
  if (input.recently_bedridden_3d_or_major_surgery_12w) score += 1;
  if (input.localized_tenderness) score += 1;
  if (input.entire_leg_swollen) score += 1;
  if (input.calf_swelling_3cm) score += 1;
  if (input.pitting_edema) score += 1;
  if (input.collateral_superficial_veins) score += 1;
  if (input.previously_documented_dvt) score += 1;
  if (input.alternative_diagnosis_likely) score -= 2;

  const likely = score >= 1;
  let action = '';
  if (likely) {
    action = 'D-dimer (if positive, confirm with compression US). Treat with anticoagulation (LMWH 1mg/kg SC q12h, or rivaroxaban 15mg BID × 3 weeks → 20mg daily) while workup pending.';
  } else {
    action = 'D-dimer to rule out (sensitive, not specific). If negative, DVT excluded. If positive, compression US.';
  }

  return {
    score,
    likely,
    severity: likely ? 'likely' : 'unlikely',
    action,
    notes: [
      'Wells DVT Score (2001): -2 to +9. ≥1 = DVT likely.',
      'Pre-test probability + D-dimer is the standard diagnostic pathway (avoiding unnecessary imaging).',
      'LMWH monotherapy for active cancer is preferred (CLOT trial 2003).',
      'D-dimer sensitivity >95% but specificity only 40-50% (false positive common: inflammation, infection, recent surgery).'
    ],
    citations: ['Wells DVT Score (Wells 2001, Lancet)', 'ACCP 2012 VTE Treatment', 'ASH 2018 VTE Guidelines']
  };
}

function wellsPE(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['clinical_signs_dvt', 'pe_most_likely', 'hr_gt_100', 'immobilization_3d_or_surgery_4w', 'previous_pe_dvt', 'hemoptysis', 'malignancy'];
  for (const k of required) {
    if (input[k] === undefined) input[k] = false;
  }

  let score = 0;
  if (input.clinical_signs_dvt) score += 3;
  if (input.pe_most_likely) score += 3;
  if (input.hr_gt_100) score += 1.5;
  if (input.immobilization_3d_or_surgery_4w) score += 1.5;
  if (input.previous_pe_dvt) score += 1.5;
  if (input.hemoptysis) score += 1;
  if (input.malignancy) score += 1;

  let category = 'unlikely';
  let action = '';
  if (score > 4) {
    category = 'likely';
    action = 'PE likely: Initiate anticoagulation (LMWH 1mg/kg SC q12h or DOAC). CT pulmonary angiogram (CTPA) for confirmation. If unstable, thrombolysis or embolectomy.';
  } else if (score > 2) {
    category = 'intermediate';
    action = 'PE intermediate probability: PERC rule-out if applicable. D-dimer (age-adjusted). If positive, CTPA.';
  } else {
    category = 'unlikely';
    action = 'PE unlikely: Apply PERC. If PERC negative, no further workup. If PERC positive, D-dimer.';
  }

  return {
    score,
    category,
    action,
    severity: category,
    notes: [
      'Wells PE Score (1998, revised 2001): 0-12.5. <2 unlikely, 2-6 intermediate, >6 likely.',
      'PERC (Pulmonary Embolism Rule-Out Criteria): 8 items. If all negative, no further workup needed.',
      'Massive PE: SBP <90, cardiac arrest. Submassive: RV strain, elevated troponin/BNP. Low-risk: no RV strain, hemodynamically stable.',
      'Pregnancy: V/Q scan preferred over CTPA in 1st trimester (lower radiation to fetus).'
    ],
    citations: ['Wells PE Score (Wells 1998, 2001)', 'PERC (Kline 2004, J Thromb Haemost)', 'ESC 2019 PE Guidelines']
  };
}

function hasBledScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['hypertension_uncontrolled', 'renal_disease', 'liver_disease', 'stroke_history', 'prior_major_bleeding', 'labile_inr', 'age_gt_65', 'drug_use_antiplatelet', 'alcohol_use'];
  for (const k of required) {
    if (input[k] === undefined) input[k] = false;
  }

  let score = 0;
  const factors = [];
  if (input.hypertension_uncontrolled) { score++; factors.push('Uncontrolled HTN (SBP >160)'); }
  if (input.renal_disease) { score++; factors.push('Renal disease (dialysis/Cr >2.26)'); }
  if (input.liver_disease) { score++; factors.push('Liver disease (cirrhosis/bili >2x)'); }
  if (input.stroke_history) { score++; factors.push('Prior stroke'); }
  if (input.prior_major_bleeding) { score++; factors.push('Prior major bleeding'); }
  if (input.labile_inr) { score++; factors.push('Labile INR'); }
  if (input.age_gt_65) { score++; factors.push('Age >65'); }
  if (input.drug_use_antiplatelet) { score++; factors.push('Antiplatelet/NSAID'); }
  if (input.alcohol_use) { score++; factors.push('Alcohol ≥8 U/wk'); }

  let severity = 'low';
  let action = '';
  if (score <= 2) {
    severity = 'low';
    action = 'Low bleed risk. Anticoagulation likely net beneficial. Continue if AF, VTE, or mechanical valve.';
  } else if (score <= 3) {
    severity = 'moderate';
    action = 'Moderate bleed risk. Caution with anticoagulation. More frequent monitoring. Avoid concomitant antiplatelet if possible.';
  } else {
    severity = 'high';
    action = 'High bleed risk. Reassess need for anticoagulation. Use DOAC over warfarin. Address modifiable risk factors (HTN, alcohol, NSAIDs).';
  }

  return {
    hasBled: score,
    factors,
    severity,
    action,
    notes: [
      'HAS-BLED (Pisters 2010): 0-9. Score ≥3 = high bleed risk. Annual major bleed rate 1.13% (score 0) to 12.5% (score ≥5).',
      'High HAS-BLED is NOT a contraindication to anticoagulation; rather, identifies patients needing closer monitoring.',
      'Modifiable risk factors (HTN, alcohol, NSAIDs) should be addressed.',
      'DOACs (apixaban, rivaroxaban, dabigatran, edoxaban) preferred over warfarin for non-valvular AF (lower ICH risk).'
    ],
    citations: ['HAS-BLED (Pisters 2010, Chest)', 'ESC 2020 AF Guidelines', 'AHA/ACC/HRS 2023 AF Guideline']
  };
}

function curb65Score(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.confusion === undefined) input.confusion = false;
  if (input.bun_gt_19_mg_dL === undefined) input.bun_gt_19_mg_dL = false;
  if (input.resp_rate_gt_30 === undefined) input.resp_rate_gt_30 = false;
  if (input.systolic_bp_lt_90 === undefined) input.systolic_bp_lt_90 = false;
  if (input.diastolic_bp_lt_60 === undefined) input.diastolic_bp_lt_60 = false;
  if (input.age_gt_65 === undefined) input.age_gt_65 = false;

  let score = 0;
  const factors = [];
  if (input.confusion) { score++; factors.push('Confusion'); }
  if (input.bun_gt_19_mg_dL) { score++; factors.push('BUN >19 mg/dL (>7 mmol/L)'); }
  if (input.resp_rate_gt_30) { score++; factors.push('RR >30'); }
  if (input.systolic_bp_lt_90) { score++; factors.push('SBP <90'); }
  if (input.diastolic_bp_lt_60) { score++; factors.push('DBP <60'); }
  if (input.age_gt_65) { score++; factors.push('Age >65'); }

  const mortality = ['0.6%', '2.1%', '6.8%', '14.0%', '27.0%'];
  let severity = 'low';
  let action = '';
  if (score === 0) {
    severity = 'low';
    action = 'CURB-65 0: outpatient management. Amoxicillin 1g TID × 5-7 days OR doxycycline 100mg BID × 5-7 days. Reassess 48-72h.';
  } else if (score === 1) {
    severity = 'low_mid';
    action = 'CURB-65 1: outpatient management possible if good support. Consider short inpatient observation if comorbidities.';
  } else if (score === 2) {
    severity = 'moderate';
    action = 'CURB-65 2: hospital admission. IV antibiotics (ceftriaxone 1g + azithromycin 500mg daily). O2 if SpO2 <94%.';
  } else {
    severity = 'high';
    action = 'CURB-65 ≥3: ICU admission likely. IV broad-spectrum antibiotics. Sepsis workup. Consider atypical coverage, aspiration risk.';
  }

  return {
    curb65: score,
    factors,
    severity,
    mortality30day: mortality[Math.min(score, 4)],
    action,
    notes: [
      'CURB-65 (Lim 2003, BTS): 0-5. Mortality: 0=0.6%, 1=2.1%, 2=6.8%, 3=14.0%, ≥4=27.0% (30-day).',
      'PSI (Pneumonia Severity Index) is an alternative for outpatient risk stratification; more complex.',
      'CRB-65 (no urea) is used in primary care when labs unavailable.',
      'Antibiotic choice: outpatient healthy = amoxicillin/doxycycline; outpatient comorbidity = levofloxacin; inpatient non-ICU = ceftriaxone + azithromycin; ICU = ceftriaxone + azithromycin ± vancomycin.'
    ],
    citations: ['CURB-65 (Lim 2003, Thorax)', 'BTS 2014 Pneumonia Guidelines', 'IDSA/ATS 2019 CAP Guidelines']
  };
}

module.exports = { wellsDVT, wellsPE, hasBledScore, curb65Score, WELLS_DVT_CATEGORIES, WELLS_PE_CATEGORIES, HAS_BLED_INTERP, CURB65_INTERP };
