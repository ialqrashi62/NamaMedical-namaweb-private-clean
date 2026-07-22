// Gastrointestinal Bleed Risk Engine
// Stratifies upper/lower GI bleed severity, transfusion threshold, intervention need
// Pure deterministic, no I/O, no side effects

'use strict';

const GLASGOW_BLATCHFORD = {
  // Score components and their point values
  BUN_mmol_L: { 'lt_6.5': 0, '6.5_to_8.0': 2, '8.0_to_10.0': 3, '10.0_to_25.0': 4, 'gt_25.0': 6 },
  hemoglobin_g_dL: { male: { 'lt_10': 6, '10_to_12': 3, '12_to_13': 1, 'gt_13': 0 }, female: { 'lt_10': 6, '10_to_12': 1, 'gt_12': 0 } },
  systolic_bp_mmHg: { 'lt_90': 3, '90_to_99': 2, '100_to_109': 1, 'gt_109': 0 },
  pulse_bpm: { 'lt_100': 0, 'gt_100': 1 },
  melena: 1, syncope: 2, hepatic_disease: 2, cardiac_failure: 2
};

const ROCKALL_PRE_ENDOSCOPY = {
  age: { 'lt_60': 0, '60_to_79': 1, 'gt_80': 2 },
  shock: { 'none': 0, 'tachycardia_gt_100': 1, 'hypotension_sbp_lt_100': 2 },
  comorbidity: { 'none': 0, 'cardiac_renal_liver': 2, 'metastatic_ca': 3 }
};

function giBleedRisk(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['hemoglobin_g_dL', 'sex', 'systolic_bp_mmHg', 'pulse_bpm', 'BUN_mmol_L', 'melena', 'syncope', 'age', 'hepatic_disease', 'cardiac_failure', 'source'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!['upper', 'lower', 'unknown'].includes(input.source)) throw new Error('source must be upper, lower, or unknown');
  if (!['male', 'female'].includes(input.sex)) throw new Error('sex must be male or female');

  const gbs = computeGlasgowBlatchford(input);
  const rockall = computeRockallPre(input);

  // Determine clinical action
  let severity, action, location;
  if (gbs.score <= 1) {
    severity = 'low';
    action = 'Outpatient management: PPI PO, no transfusion, early discharge, outpatient endoscopy within 2 weeks.';
    location = 'outpatient';
  } else if (gbs.score <= 6) {
    severity = 'moderate';
    action = 'Inpatient admission: IV PPI, consider transfusion if Hgb <7 g/dL, endoscopy within 24 hours.';
    location = 'inpatient_floor';
  } else if (gbs.score <= 12) {
    severity = 'high';
    action = 'Urgent endoscopy within 12 hours, IV PPI bolus + infusion, ICU bed, transfusion threshold Hgb <7 g/dL.';
    location = 'inpatient_high_dependency';
  } else {
    severity = 'very_high';
    action = 'Emergency endoscopy within 6 hours, massive transfusion protocol, ICU, IR/surgery consult.';
    location = 'ICU';
  }

  const recommendations = buildRecommendations(gbs.score, input, location, severity);

  return {
    glascoGBS: gbs,
    rockallPre: rockall,
    severity,
    location,
    action,
    recommendations,
    notes: [
      'Glasgow-Blatchford Score (GBS) 0-1 identifies low-risk patients who can be discharged without endoscopy.',
      'Pre-endoscopy Rockall Score predicts mortality; complete Rockall score post-endoscopy adds endoscopic findings.',
      'Upper GI bleeds with variceal suspicion need IV octreotide + ceftriaxone; lower GI bleeds often diverticular or angiodysplastic.'
    ],
    citations: [
      'Glasgow-Blatchford Score (Blatchford 2000, Gut)',
      'Pre-endoscopy Rockall Score (Rockall 1996, Gut)',
      'ACG 2021 Guidelines on GI Bleeding',
      'ESGE 2021 Non-variceal Upper GI Hemorrhage Guidelines'
    ]
  };
}

function computeGlasgowBlatchford(input) {
  // BUN
  let bun = 0;
  if (input.BUN_mmol_L < 6.5) bun = 0;
  else if (input.BUN_mmol_L < 8.0) bun = 2;
  else if (input.BUN_mmol_L < 10.0) bun = 3;
  else if (input.BUN_mmol_L < 25.0) bun = 4;
  else bun = 6;

  // Hemoglobin
  let hgb = 0;
  const hgbVal = input.hemoglobin_g_dL;
  if (input.sex === 'male') {
    if (hgbVal < 10) hgb = 6;
    else if (hgbVal < 12) hgb = 3;
    else if (hgbVal < 13) hgb = 1;
    else hgb = 0;
  } else {
    if (hgbVal < 10) hgb = 6;
    else if (hgbVal < 12) hgb = 1;
    else hgb = 0;
  }

  // Systolic BP
  let sbp = 0;
  if (input.systolic_bp_mmHg < 90) sbp = 3;
  else if (input.systolic_bp_mmHg < 100) sbp = 2;
  else if (input.systolic_bp_mmHg < 110) sbp = 1;
  else sbp = 0;

  // Pulse
  const pulse = input.pulse_bpm >= 100 ? 1 : 0;

  // Other
  const melena = input.melena ? 1 : 0;
  const syncope = input.syncope ? 2 : 0;
  const hepatic = input.hepatic_disease ? 2 : 0;
  const cardiac = input.cardiac_failure ? 2 : 0;

  const score = bun + hgb + sbp + pulse + melena + syncope + hepatic + cardiac;
  return { score, components: { BUN: bun, hemoglobin: hgb, systolic_bp: sbp, pulse, melena, syncope, hepatic_disease: hepatic, cardiac_failure: cardiac } };
}

function computeRockallPre(input) {
  let age = 0;
  if (input.age >= 80) age = 2;
  else if (input.age >= 60) age = 1;

  let shock = 0;
  if (input.systolic_bp_mmHg < 100 || input.pulse_bpm > 100) {
    if (input.systolic_bp_mmHg < 100) shock = 2;
    else shock = 1;
  }

  let comorbidity = 0;
  if (input.cardiac_failure || input.hepatic_disease) comorbidity = 2;
  // metastatic_ca handled if present
  if (input.metastatic_ca) comorbidity = 3;

  return { score: age + shock + comorbidity, components: { age, shock, comorbidity } };
}

function buildRecommendations(gbs, input, location, severity) {
  const recs = [];

  if (input.source === 'upper' || input.source === 'unknown') {
    recs.push({ action: 'IV Pantoprazole 80mg bolus, then 8mg/hour infusion for 72 hours', level: 'high' });
    if (input.hepatic_disease) recs.push({ action: 'IV Octreotide 50µg bolus then 50µg/hour x 5 days (variceal suspicion)', level: 'high' });
    if (input.hepatic_disease) recs.push({ action: 'IV Ceftriaxone 1g daily (SBP prophylaxis)', level: 'high' });
  }

  if (severity === 'low') {
    recs.push({ action: 'Discharge on oral PPI BID, return if recurrent melena/hematemesis', level: 'moderate' });
  } else {
    recs.push({ action: 'Type & crossmatch 2 units pRBC, transfuse if Hgb <7 g/dL (or <8 in active cardiac disease)', level: 'high' });
    recs.push({ action: 'NPO, IV fluids, strict I/O, daily CBC/BUN', level: 'standard' });
  }

  if (input.antiplatelet) recs.push({ action: 'Hold antiplatelet agents until hemostasis confirmed', level: 'high' });
  if (input.anticoagulation) recs.push({ action: 'Reverse anticoagulation per agent (Vitamin K, PCC, Andexanet for Factor Xa inhibitors)', level: 'high' });
  if (gbs >= 12) recs.push({ action: 'Activate massive transfusion protocol, IR + surgical consult', level: 'high' });

  return recs;
}

module.exports = { giBleedRisk, GLASGOW_BLATCHFORD, ROCKALL_PRE_ENDOSCOPY };
