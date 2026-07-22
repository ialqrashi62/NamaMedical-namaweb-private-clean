// Critical Care Severity Engine: NIHSS for stroke + APACHE IV for ICU mortality
// Pure deterministic, no I/O, no side effects

'use strict';

const NIHSS_SEVERITY = {
  no_stroke: { max: 0, label: 'No stroke symptoms' },
  minor: { min: 1, max: 4, label: 'Minor stroke' },
  moderate: { min: 5, max: 15, label: 'Moderate stroke' },
  moderate_severe: { min: 16, max: 20, label: 'Moderate-severe stroke' },
  severe: { min: 21, label: 'Severe stroke' }
};

const APACHE_IV_MORTALITY = {
  // Approximate mortality by APACHE IV score (Zimmerman 2006)
  // Based on ICU mortality in original validation cohort
  ranges: [
    { max: 50, mortality_low: 0.04, mortality_high: 0.10 },
    { max: 70, mortality_low: 0.10, mortality_high: 0.25 },
    { max: 90, mortality_low: 0.25, mortality_high: 0.45 },
    { max: 110, mortality_low: 0.45, mortality_high: 0.65 },
    { max: 130, mortality_low: 0.65, mortality_high: 0.80 },
    { max: Infinity, mortality_low: 0.80, mortality_high: 0.95 }
  ]
};

function nihssScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = [
    'consciousness_lvlc',  // 0-3
    'consciousness_lvl1a',  // 0-2 (LOC questions month/age)
    'consciousness_lvl1b',  // 0-2 (LOC commands open/close eyes)
    'best_gaze',  // 0-2
    'visual_field',  // 0-3
    'facial_palsy',  // 0-3
    'motor_arm_left',  // 0-4
    'motor_arm_right',  // 0-4
    'motor_leg_left',  // 0-4
    'motor_leg_right',  // 0-4
    'limb_ataxia',  // 0-2
    'sensory',  // 0-2
    'language',  // 0-3
    'dysarthria',  // 0-2
    'extinction_inattention'  // 0-2
  ];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  const components = {};
  for (const k of required) components[k] = input[k];

  const total = Object.values(components).reduce((sum, v) => sum + v, 0);

  let severity = 'no_stroke';
  let action = '';
  if (total === 0) { severity = 'no_stroke'; action = 'No stroke symptoms. Consider stroke mimic (seizure, migraine, hypoglycemia).'; }
  else if (total <= 4) { severity = 'minor'; action = 'Minor stroke. CT/MRI. Consider dual antiplatelet (DAPT) if ischemic, no large vessel occlusion expected.'; }
  else if (total <= 15) { severity = 'moderate'; action = 'Moderate stroke. CT/CTA. Thrombectomy if LVO. IV tPA if within 4.5h and eligible. Stroke unit admission.'; }
  else if (total <= 20) { severity = 'moderate_severe'; action = 'Moderate-severe stroke. Urgent CT/CTA. Strong candidate for thrombectomy if LVO. NICU/stroke unit.'; }
  else { severity = 'severe'; action = 'Severe stroke. Hemorrhagic transformation risk. NICU. Consider decompressive hemicraniectomy if malignant MCA.'; }

  const recommendations = buildNihssRecommendations(total, input);

  return {
    nihss: total,
    components,
    severity,
    action,
    recommendations,
    notes: [
      'NIHSS 0-42. Higher = more severe. Used in tPA/thrombectomy decisions.',
      'tPA eligible: NIHSS 1-25 typically (no upper limit in many centers; benefit diminishes >25).',
      'LVO (large vessel occlusion) suspected if NIHSS ≥6.',
      'Time is brain: door-to-needle ≤60 min, door-to-puncture ≤90 min for thrombectomy.'
    ],
    citations: [
      'NIHSS (Brott 1989, Stroke; revised 2003)',
      'AHA/ASA 2019 Acute Ischemic Stroke Guidelines',
      'ESO 2021 Mechanical Thrombectomy Guidelines',
      'DEFUSE-3 and DAWN trials for extended window thrombectomy'
    ]
  };
}

function apacheIV(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['age', 'sex', 'chronic_health', 'admission_diagnosis', 'saps3_like_inputs'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!['male', 'female'].includes(input.sex)) throw new Error('sex must be male or female');

  // Simplified APACHE IV approximation:
  // Base + Age points + Chronic health + Physiology (APS) + Admission diagnosis
  const agePoints = Math.max(0, input.age - 44);  // 0 points at age 44, +1/year
  const sexPoints = input.sex === 'male' ? 0 : 0;  // minimal
  const chronicHealthPoints = computeChronicHealth(input.chronic_health);

  const aps = computeAPS(input.saps3_like_inputs);
  const diagnosisPoints = computeAdmissionDxPoints(input.admission_diagnosis);

  const total = agePoints + sexPoints + chronicHealthPoints + aps + diagnosisPoints;
  const mortality = estimateMortality(total);

  let severity = 'low';
  let action = '';
  if (total < 50) { severity = 'low'; action = `Low ICU mortality risk (~${(mortality.low * 100).toFixed(0)}%). Routine ICU care.`; }
  else if (total < 90) { severity = 'moderate'; action = `Moderate mortality risk (~${(mortality.low * 100).toFixed(0)}-${(mortality.high * 100).toFixed(0)}%). Close monitoring, optimize organ support.`; }
  else { severity = 'high'; action = `High mortality risk (~${(mortality.low * 100).toFixed(0)}-${(mortality.high * 100).toFixed(0)}%). Aggressive care, daily goals, family meeting.`; }

  return {
    apache_iv: total,
    components: { age: agePoints, sex: sexPoints, chronic_health: chronicHealthPoints, aps, admission_dx: diagnosisPoints },
    mortalityEstimate: mortality,
    severity,
    action,
    notes: [
      'APACHE IV (Zimmerman 2006): ICU mortality prediction for adult ICU patients.',
      'Score 0-286; higher = sicker.',
      'Use in first 24 hours of ICU admission; not for trending.',
      'SOFA and SAPS-II are alternatives; MPM (Mortality Prediction Model) is for first-hour prediction.'
    ],
    citations: ['APACHE IV (Zimmerman 2006, CCM)', 'SAPS-II (Le Gall 1993)', 'SOFA (Vincent 1996)']
  };
}

function computeChronicHealth(ch) {
  let points = 0;
  if (ch.aids) points += 10;
  if (ch.hepatic_failure) points += 5;
  if (ch.metastatic_cancer) points += 15;
  if (ch.hematologic_malignancy) points += 10;
  if (ch.immunosuppression) points += 8;
  if (ch.lymphoma) points += 10;
  if (ch.ckd_on_dialysis) points += 6;
  return points;
}

function computeAPS(phys) {
  let aps = 0;
  // Simplified APS from vital/lab deviations
  if (phys.temperature_c) {
    if (phys.temperature_c < 33 || phys.temperature_c > 40) aps += 4;
    else if (phys.temperature_c < 35.5 || phys.temperature_c > 38.5) aps += 2;
  }
  if (phys.mbp_mmHg) {
    if (phys.mbp_mmHg < 50 || phys.mbp_mmHg > 130) aps += 4;
    else if (phys.mbp_mmHg < 65) aps += 2;
  }
  if (phys.heart_rate_bpm) {
    if (phys.heart_rate_bpm < 40 || phys.heart_rate_bpm > 150) aps += 4;
    else if (phys.heart_rate_bpm > 120) aps += 2;
  }
  if (phys.resp_rate) {
    if (phys.resp_rate < 6 || phys.resp_rate > 50) aps += 4;
    else if (phys.resp_rate > 30) aps += 2;
  }
  if (phys.pao2_fio2_ratio) {
    if (phys.pao2_fio2_ratio < 100) aps += 8;
    else if (phys.pao2_fio2_ratio < 200) aps += 4;
  }
  if (phys.serum_sodium_mmol_L) {
    if (phys.serum_sodium_mmol_L < 120 || phys.serum_sodium_mmol_L > 155) aps += 4;
    else if (phys.serum_sodium_mmol_L < 130) aps += 2;
  }
  if (phys.serum_potassium_mmol_L) {
    if (phys.serum_potassium_mmol_L < 2.5 || phys.serum_potassium_mmol_L > 6.5) aps += 4;
    else if (phys.serum_potassium_mmol_L < 3.0) aps += 2;
  }
  if (phys.creatinine_mg_dL) {
    if (phys.creatinine_mg_dL > 3.5) aps += 6;
    else if (phys.creatinine_mg_dL > 2.0) aps += 3;
  }
  if (phys.hematocrit_pct) {
    if (phys.hematocrit_pct < 30) aps += 2;
  }
  if (phys.wbc_k_uL) {
    if (phys.wbc_k_uL < 1 || phys.wbc_k_uL > 40) aps += 4;
    else if (phys.wbc_k_uL < 3 || phys.wbc_k_uL > 20) aps += 2;
  }
  if (phys.gcs_total !== undefined) {
    if (phys.gcs_total < 6) aps += 12;
    else if (phys.gcs_total < 10) aps += 8;
    else if (phys.gcs_total < 13) aps += 4;
  }
  return aps;
}

function computeAdmissionDxPoints(dx) {
  const dxPoints = {
    cardiac_arrest: 25,
    sepsis_severe: 18,
    septic_shock: 25,
    trauma_multi: 22,
    burns: 28,
    cardiac_surgery_elective: 10,
    cardiogenic_shock: 25,
    respiratory_failure: 18,
    gi_bleed: 12,
    stroke_hemorrhagic: 22,
    stroke_ischemic: 15,
    surgical_elective: 8,
    medical_general: 12
  };
  return dxPoints[dx] || 12;
}

function estimateMortality(score) {
  for (const r of APACHE_IV_MORTALITY.ranges) {
    if (score <= r.max) return { low: r.mortality_low, high: r.mortality_high };
  }
  return { low: 0.95, high: 0.99 };
}

function buildNihssRecommendations(total, input) {
  const recs = [];
  if (total >= 6 && !input.known_hemorrhage) {
    recs.push({ action: 'STAT non-contrast CT head to exclude hemorrhage', level: 'critical' });
    recs.push({ action: 'CT angiography head/neck to identify large vessel occlusion (LVO)', level: 'high' });
    if (input.symptom_onset_hours !== undefined && input.symptom_onset_hours <= 4.5) {
      recs.push({ action: 'IV alteplase (tPA) 0.9 mg/kg (max 90 mg) within 4.5 hours of onset, after excluding contraindications', level: 'critical' });
    }
    if (input.symptom_onset_hours !== undefined && input.symptom_onset_hours <= 6) {
      recs.push({ action: 'Mechanical thrombectomy (stent retriever) if LVO within 6 hours', level: 'critical' });
    } else if (input.symptom_onset_hours !== undefined && input.symptom_onset_hours <= 24) {
      recs.push({ action: 'CT perfusion for extended-window thrombectomy (DEFUSE-3 6-16h, DAWN 6-24h)', level: 'high' });
    }
  }
  if (total >= 15) {
    recs.push({ action: 'Admit to NICU/stroke unit. Q1h neuro checks. Maintain BP <180/105 post-tPA', level: 'high' });
  } else if (total > 0) {
    recs.push({ action: 'Stroke unit admission. Q4h neuro checks.', level: 'standard' });
  }
  if (input.known_hemorrhage) {
    recs.push({ action: 'Hemorrhagic stroke: reverse anticoagulation, BP control (<140 systolic), neurosurgery consult', level: 'critical' });
  }
  return recs;
}

module.exports = { nihssScore, apacheIV, NIHSS_SEVERITY };
