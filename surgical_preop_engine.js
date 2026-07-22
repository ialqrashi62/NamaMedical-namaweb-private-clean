// Surgical Preop Risk Engine: ASA + RCRI (Revised Cardiac Risk Index) + Caprini (VTE)
// Pure deterministic, no I/O, no side effects

'use strict';

const ASA_BANDS = {
  // ASA Physical Status (no longer uses letters, but E suffix for emergency)
  I: { label: 'Normal healthy patient' },
  II: { label: 'Mild systemic disease' },
  III: { label: 'Severe systemic disease' },
  IV: { label: 'Severe systemic disease, constant threat to life' },
  V: { label: 'Moribund, not expected to survive without operation' },
  VI: { label: 'Brain-dead organ donor' }
};

const RCRI_INTERP = {
  no_risk: { val: 0, label: 'Very low cardiac risk' },
  low: { val: 1, label: 'Low risk' },
  moderate: { val: 2, label: 'Moderate risk' },
  high: { val: 3, label: 'High risk' },
  very_high: { val: 4, label: 'Very high risk' }
};

const CAPRINI_INTERP = {
  very_low: { val: 0, label: 'Very low VTE risk' },
  low: { val: 1, max: 1, label: 'Low risk' },
  moderate: { val: 2, max: 2, label: 'Moderate risk' },
  high: { val: 3, max: 4, label: 'High risk' },
  very_high: { min: 5, label: 'Very high VTE risk' }
};

function asaClassification(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (!input.asa_class) throw new Error('asa_class required');
  if (![1, 2, 3, 4, 5, 6].includes(input.asa_class)) throw new Error('asa_class must be 1-6 (I-VI)');
  if (input.emergency && ![1, 2, 3, 4, 5].includes(input.asa_class)) throw new Error('Emergency suffix E only for ASA I-V');

  const labels = {
    1: 'Normal healthy patient (no organic, biochemical, or psychiatric disease)',
    2: 'Patient with mild systemic disease (smoker, well-controlled HTN, mild DM, mild obesity, pregnancy)',
    3: 'Patient with severe systemic disease (poorly controlled DM, ESRD on dialysis, COPD on home O2, prior MI, stent, EF <30%)',
    4: 'Patient with severe systemic disease that is a constant threat to life (recent MI <3m, ongoing ischemia, severe sepsis, DIC)',
    5: 'Moribund patient not expected to survive without operation (ruptured AAA, massive PE, ischemic bowel with sepsis)',
    6: 'Brain-dead patient whose organs are being removed for donor purposes'
  };

  let perioperativeMortality = '0.06-0.08%';
  if (input.asa_class === 2) perioperativeMortality = '0.27%';
  else if (input.asa_class === 3) perioperativeMortality = '1.8%';
  else if (input.asa_class === 4) perioperativeMortality = '7.8%';
  else if (input.asa_class === 5) perioperativeMortality = '9.4%';

  return {
    asaClass: input.asa_class,
    emergency: !!input.emergency,
    label: labels[input.asa_class],
    perioperativeMortality,
    action: getAsaAction(input.asa_class, input.emergency),
    notes: [
      'ASA Physical Status (ASA 2014 revision): 1-6. "E" suffix indicates emergency surgery.',
      'ASA 3-4 has significantly higher perioperative mortality than 1-2.',
      'Useful for risk stratification and consent discussion.',
      'Does NOT adjust for procedure type; specific risk should be combined with procedure risk.'
    ],
    citations: ['ASA Physical Status Classification 2014 (Dripps/Saklad)']
  };
}

function getAsaAction(asaClass, emergency) {
  if (asaClass === 1) return 'Minimal preop workup. NPO after midnight. Standard monitoring.';
  if (asaClass === 2) return 'Confirm control of systemic disease. EKG, basic labs (CBC, BMP, coags). NPO.';
  if (asaClass === 3) return 'Optimize disease control preoperatively. EKG, CBC, BMP, coags, type & screen. Cardiology clearance if cardiac history. HbA1c <8.5% if diabetic.';
  if (asaClass === 4) return 'Aggressive optimization required. ICU postop. Multi-specialty consult. Family meeting for goals of care. Consider risks/benefits carefully.';
  if (asaClass === 5) return 'Lifesaving emergency surgery. Resuscitation concurrent. Family meeting. Anesthesia attending in OR.';
  return 'Organ donor protocol. Brain death confirmed per institutional policy.';
}

function rcriScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const factors = [
    'high_risk_surgery',
    'ischemic_heart_disease',
    'congestive_heart_failure',
    'cerebrovascular_disease',
    'diabetes_insulin_dependent',
    'creatinine_gt_2_mg_dL'
  ];
  for (const f of factors) {
    if (input[f] === undefined) input[f] = false;
  }

  const score = factors.filter(f => input[f]).length;

  // Lee et al 1999: original RCRI predicts MACE
  const mace = ['0.4%', '0.9%', '2.4%', '5.4%', '11%'];
  let severity = 'no_risk';
  if (score === 1) severity = 'low';
  else if (score === 2) severity = 'moderate';
  else if (score === 3) severity = 'high';
  else if (score >= 4) severity = 'very_high';

  return {
    rcri: score,
    severity,
    mace: mace[score] + ' (MACE rate)',
    factorsPositive: factors.filter(f => input[f]),
    action: getRcriAction(score, input.high_risk_surgery),
    notes: [
      'RCRI / Lee Index (1999): 6 risk factors for cardiac complications after non-cardiac surgery.',
      'High-risk surgery: intraperitoneal, intrathoracic, suprainguinal vascular.',
      'MACE: cardiac death, MI, cardiac arrest, complete heart block, pulmonary edema.',
      'Class I recommendation (ACC/AHA 2014): proceed with surgery if RCRI 0-1, optimize if RCRI 2-3, consider invasive testing if RCRI ≥4 (newer guidelines 2022 less aggressive).'
    ],
    citations: ['Lee Revised Cardiac Risk Index (Lee 1999, Circulation)', 'ACC/AHA 2014 Perioperative Guidelines', 'ACC/AHA 2022 Perioperative Update']
  };
}

function getRcriAction(score, highRiskSurgery) {
  if (score === 0) return 'No specific cardiac testing. Proceed with surgery.';
  if (score === 1) return 'Low risk. Proceed. Optimize chronic conditions. No routine stress testing.';
  if (score === 2) return 'Moderate risk. Consider BNP/NT-proBNP (≥300 pg/mL = high risk). Optimize cardiac status. Consider statin if not already on one.';
  if (score === 3) return 'High risk. Cardiology consult. Consider non-invasive stress test (dobutamine echo) if feasible. Statin, beta-blocker if not contraindicated. Delay surgery if possible to optimize.';
  if (score >= 4) return 'Very high risk. Cardiology consult mandatory. Consider invasive testing or alternative approach. Multi-specialty meeting to weigh risk/benefit. ICU postop monitoring.';
  return '';
}

function capriniScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  let score = 0;
  const factors = [];

  // Age
  if (input.age >= 75) { score += 3; factors.push('Age ≥75 (+3)'); }
  else if (input.age >= 60) { score += 2; factors.push('Age 60-74 (+2)'); }
  else if (input.age >= 40) { score += 1; factors.push('Age 40-59 (+1)'); }

  // BMI
  if (input.bmi && input.bmi >= 40) { score += 2; factors.push('BMI ≥40 (+2)'); }
  else if (input.bmi && input.bmi >= 35) { score += 1; factors.push('BMI 35-39 (+1)'); }

  // Surgical factors
  if (input.surgery_type === 'major_orthopedic') { score += 5; factors.push('Major orthopedic (knee/hip) (+5)'); }
  else if (input.surgery_type === 'major_general') { score += 4; factors.push('Major abdominal/pelvic (+4)'); }
  else if (input.surgery_type === 'thoracic') { score += 3; factors.push('Thoracic (+3)'); }
  else if (input.surgery_type === 'laparoscopic') { score += 2; factors.push('Laparoscopic (+2)'); }
  else if (input.surgery_type === 'minor') { score += 1; factors.push('Minor surgery (+1)'); }

  // Personal/family history
  if (input.previous_vte) { score += 3; factors.push('Previous VTE (+3)'); }
  if (input.family_vte) { score += 2; factors.push('Family VTE (+2)'); }
  if (input.malignancy) { score += 2; factors.push('Malignancy (+2)'); }
  if (input.central_line) { score += 2; factors.push('Central venous line (+2)'); }

  // Immobility
  if (input.immobile) { score += 2; factors.push('Immobilization >72h (+2)'); }
  else if (input.bed_rest) { score += 1; factors.push('Bed rest (+1)'); }

  // Hormonal
  if (input.estrogen_or_ocp) { score += 1; factors.push('Estrogen/OCP (+1)'); }
  if (input.pregnancy) { score += 1; factors.push('Pregnancy (+1)'); }

  // Medical conditions
  if (input.heart_failure) { score += 1; factors.push('Heart failure (+1)'); }
  if (input.copd) { score += 1; factors.push('COPD (+1)'); }
  if (input.stroke_within_1m) { score += 5; factors.push('Stroke <1 month (+5)'); }
  if (input.stroke_within_3m) { score += 3; factors.push('Stroke 1-3 months (+3)'); }
  if (input.sepsis_within_1m) { score += 1; factors.push('Sepsis <1 month (+1)'); }
  if (input.inflammatory_bowel) { score += 1; factors.push('IBD (+1)'); }
  if (input.lupus) { score += 1; factors.push('Lupus (+1)'); }

  // Thrombophilia
  if (input.thrombophilia) { score += 3; factors.push('Thrombophilia (+3)'); }

  let severity = 'very_low';
  if (score === 0) severity = 'very_low';
  else if (score <= 1) severity = 'low';
  else if (score <= 2) severity = 'moderate';
  else if (score <= 4) severity = 'high';
  else severity = 'very_high';

  let action = '';
  if (severity === 'very_low') action = 'Caprini 0: Early ambulation, no pharmacologic prophylaxis needed. Reassess if clinical status changes.';
  else if (severity === 'low') action = 'Caprini 1-2: Mechanical prophylaxis (sequential compression device). Pharmacologic prophylaxis for high-risk patients.';
  else if (severity === 'moderate') action = 'Caprini 3-4: LMWH (enoxaparin 40mg SC daily) OR UFH 5000 U SC q8h + mechanical. Start 6-12h postop.';
  else action = 'Caprini ≥5: LMWH (enoxaparin 40mg SC daily, higher risk 30mg q12h) + mechanical prophylaxis. Extended prophylaxis 4-6 weeks for orthopedic/tumor surgery.';

  return {
    caprini: score,
    severity,
    factors,
    action,
    notes: [
      'Caprini Risk Assessment (2005, 2010 update): VTE risk stratification for surgical patients.',
      'Total hip/knee arthroplasty: extended prophylaxis 14-35 days post-discharge.',
      'Major abdominal/pelvic cancer surgery: extended prophylaxis 4 weeks post-discharge.',
      'LMWH preferred over UFH except in renal failure (CrCl <30) or HIT history.',
      'DOACs (apixaban, rivaroxaban) for orthopedic prophylaxis alternative.'
    ],
    citations: ['Caprini Risk Score (Caprini 2005, 2010 update)', 'ASH 2019 VTE Guidelines', 'ACCP 2012 Antithrombotic Therapy']
  };
}

module.exports = { asaClassification, rcriScore, capriniScore, ASA_BANDS, RCRI_INTERP, CAPRINI_INTERP };
