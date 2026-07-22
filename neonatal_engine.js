// Neonatal Engine: APGAR + Neonatal Bilirubin (Bhutani Nomogram) + Weight class
// Pure deterministic, no I/O, no side effects

'use strict';

const APGAR_CATEGORIES = {
  normal: { min: 7, label: 'Normal (no intervention)' },
  intermediate: { min: 4, max: 6, label: 'Moderately depressed (stimulation, O2)' },
  critical: { max: 3, label: 'Severely depressed (full resuscitation)' }
};

function apgarScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['appearance_0_2', 'pulse_0_2', 'grimace_0_2', 'activity_0_2', 'respiration_0_2'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  for (const k of required) {
    if (![0, 1, 2].includes(input[k])) throw new Error(`${k} must be 0, 1, or 2`);
  }

  const total = input.appearance_0_2 + input.pulse_0_2 + input.grimace_0_2 + input.activity_0_2 + input.respiration_0_2;

  let severity = 'normal';
  let action = '';
  if (total <= 3) { severity = 'critical'; action = 'Severely depressed: full resuscitation (NALS/NRP). Bag-mask ventilation, intubation if needed, chest compressions if HR <60. Umbilical vein catheterization if prolonged.'; }
  else if (total <= 6) { severity = 'intermediate'; action = 'Moderately depressed: stimulation, free-flow O2, suction, reposition. Reassess at 5 minutes.'; }
  else { severity = 'normal'; action = 'Normal: routine care. Skin-to-skin, breastfeeding, monitoring.'; }

  return {
    apgar: total,
    components: { appearance: input.appearance_0_2, pulse: input.pulse_0_2, grimace: input.grimace_0_2, activity: input.activity_0_2, respiration: input.respiration_0_2 },
    severity,
    action,
    notes: [
      'APGAR (1952): 0-10. Assessed at 1 and 5 minutes; repeat at 10 minutes if still ≤6.',
      'NOT a predictor of long-term neurologic outcome (low predictive value). Used to assess need for resuscitation.',
      'Components: Appearance (color), Pulse (HR), Grimace (reflex irritability), Activity (tone), Respiration (effort).'
    ],
    citations: ['APGAR (Apgar 1952)', 'NRP 8th Edition (AAP/AHA 2021)']
  };
}

function bhutaniRisk(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['total_serum_bilirubin_mg_dL', 'age_hours', 'gestational_age_weeks'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (input.age_hours < 0 || input.age_hours > 240) throw new Error('age_hours must be 0-240');
  if (input.total_serum_bilirubin_mg_dL < 0) throw new Error('bilirubin must be ≥ 0');

  // Simplified Bhutani nomogram zones (low/intermediate/high based on hour-specific risk)
  // For term infants (≥38 weeks) without risk factors
  // Approximation: TSB at age 72h <15 mg/dL = low; 15-20 = intermediate; >20 = high
  // Hour-adjusted thresholds
  let riskLevel = 'low';
  const bsb = input.total_serum_bilirubin_mg_dL;
  const age = input.age_hours;
  const ga = input.gestational_age_weeks;

  // Phototherapy threshold (AAP 2022 simplified)
  const phototherapyThreshold = computePhototherapyThreshold(age, ga);
  const exchangeThreshold = computeExchangeThreshold(age, ga);

  if (bsb >= exchangeThreshold) riskLevel = 'very_high';
  else if (bsb >= phototherapyThreshold) riskLevel = 'high';
  else if (bsb >= phototherapyThreshold - 3) riskLevel = 'intermediate';
  else riskLevel = 'low';

  let action = '';
  if (riskLevel === 'very_high') action = `Double-volume exchange transfusion. TSB ${bsb} ≥ exchange threshold (${exchangeThreshold} mg/dL). IVIG if isoimmune hemolysis. Intensive phototherapy while preparing exchange.`;
  else if (riskLevel === 'high') action = `Intensive phototherapy. TSB ${bsb} ≥ phototherapy threshold (${phototherapyThreshold} mg/dL). Continuous monitoring, q4h TSB, hydration, lactation support.`;
  else if (riskLevel === 'intermediate') action = `Continue routine monitoring, q12-24h TSB, optimize feeding, consider phototherapy if approaching threshold.`;
  else action = `No intervention needed. Continue routine monitoring per AAP schedule. Lactation support.`;

  return {
    tsb_mg_dL: bsb,
    age_hours: age,
    gestational_age: ga,
    phototherapyThreshold: phototherapyThreshold,
    exchangeThreshold: exchangeThreshold,
    riskLevel,
    action,
    notes: [
      'Bhutani nomogram (1999): 4 risk zones based on hour-specific TSB.',
      'AAP 2022 guidelines use 3 curves: phototherapy + low-risk factor, phototherapy + risk factor, exchange.',
      'Risk factors: isoimmune hemolysis, G6PD, asphyxia, sepsis, acidosis, low birth weight <2500g.',
      'Always correlate with clinical exam (Kramer\'s rule for visible icterus progression).'
    ],
    citations: ['Bhutani Nomogram (Bhutani 1999, Pediatrics)', 'AAP 2022 Hyperbilirubinemia Guidelines']
  };
}

function computePhototherapyThreshold(ageHours, gaWeeks) {
  // Simplified AAP 2022 phototherapy threshold curves
  // For ≥38 weeks gestation, low-risk (no risk factors)
  const thresholds = [
    { age: 24, val: 8 }, { age: 48, val: 11 }, { age: 72, val: 13 },
    { age: 96, val: 14.5 }, { age: 120, val: 15 }, { age: 144, val: 16 },
    { age: 168, val: 17 }
  ];
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (ageHours >= thresholds[i].age && ageHours < thresholds[i + 1].age) {
      const ratio = (ageHours - thresholds[i].age) / (thresholds[i + 1].age - thresholds[i].age);
      return Math.round((thresholds[i].val + ratio * (thresholds[i + 1].val - thresholds[i].val)) * 10) / 10;
    }
  }
  return 17;
}

function computeExchangeThreshold(ageHours, gaWeeks) {
  const thresholds = [
    { age: 24, val: 15 }, { age: 48, val: 18 }, { age: 72, val: 21 },
    { age: 96, val: 22 }, { age: 120, val: 22.5 }, { age: 144, val: 23 },
    { age: 168, val: 24 }
  ];
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (ageHours >= thresholds[i].age && ageHours < thresholds[i + 1].age) {
      const ratio = (ageHours - thresholds[i].age) / (thresholds[i + 1].age - thresholds[i].age);
      return Math.round((thresholds[i].val + ratio * (thresholds[i + 1].val - thresholds[i].val)) * 10) / 10;
    }
  }
  return 24;
}

function birthweightCategory(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.birth_weight_grams === undefined) throw new Error('birth_weight_grams required');
  if (input.gestational_age_weeks === undefined) throw new Error('gestational_age_weeks required');

  const w = input.birth_weight_grams;
  const ga = input.gestational_age_weeks;

  let weightCategory = 'normal';
  if (w < 1000) weightCategory = 'extremely_low_birth_weight';
  else if (w < 1500) weightCategory = 'very_low_birth_weight';
  else if (w < 2500) weightCategory = 'low_birth_weight';
  else if (w <= 4000) weightCategory = 'normal';
  else weightCategory = 'macrosomia';

  // LGA / SGA vs GA
  let gaCategory = 'appropriate_for_gestational_age';
  if (ga < 28) gaCategory = 'extremely_preterm';
  else if (ga < 32) gaCategory = 'very_preterm';
  else if (ga < 37) gaCategory = 'preterm';
  else if (ga <= 42) gaCategory = 'term';
  else gaCategory = 'post_term';

  return {
    weightCategory,
    gaCategory,
    birthWeight: w,
    gestationalAge: ga,
    notes: [
      'SGA: <10th percentile; LGA: >90th percentile (requires Fenton or WHO growth chart).',
      'Prematurity thresholds: <28 (extreme), 28-<32 (very), 32-<37 (late preterm), 37-42 (term), >42 (post-term).',
      'ELBW (<1000g) and VLBW (<1500g) require NICU admission.'
    ],
    citations: ['WHO Growth Charts 2006', 'Fenton Growth Chart 2013']
  };
}

module.exports = { apgarScore, bhutaniRisk, birthweightCategory, APGAR_CATEGORIES };
