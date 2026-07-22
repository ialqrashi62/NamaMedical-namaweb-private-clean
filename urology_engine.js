// Urology Engine: IPSS (BPH) + AUA pain index + Renal stone risk (RKS)
// Pure deterministic, no I/O, no side effects

'use strict';

const IPSS_SEVERITY = {
  mild: { max: 7, label: 'Mildly symptomatic' },
  moderate: { min: 8, max: 19, label: 'Moderately symptomatic' },
  severe: { min: 20, max: 35, label: 'Severely symptomatic' }
};

function ipssScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['incomplete_emptying', 'frequency', 'intermittency', 'urgency', 'weak_stream', 'straining', 'nocturia', 'qol_score_0_6'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  for (const k of required.slice(0, 7)) {
    if (![0, 1, 2, 3, 4, 5].includes(input[k])) throw new Error(`${k} must be 0-5`);
  }
  if (input.qol_score_0_6 < 0 || input.qol_score_0_6 > 6) throw new Error('qol_score_0_6 must be 0-6');

  const symptoms = ['incomplete_emptying', 'frequency', 'intermittency', 'urgency', 'weak_stream', 'straining', 'nocturia'];
  const symptomScore = symptoms.reduce((sum, k) => sum + input[k], 0);
  const total = symptomScore + input.qol_score_0_6;

  let severity = 'severe';
  let action = '';
  if (total <= 7) { severity = 'mild'; action = 'Mild BPH: watchful waiting. Lifestyle: limit fluids before bed, avoid alcohol/caffeine. Follow-up in 6-12 months.'; }
  else if (total <= 19) { severity = 'moderate'; action = 'Moderate BPH: medical therapy. α-blocker (tamsulosin 0.4mg daily) OR 5-ARI (finasteride 5mg daily), or combination.'; }
  else { severity = 'severe'; action = 'Severe BPH: consider urology referral, surgical intervention (TURP, laser enucleation, Rezum, Urolift). Rule out retention with bladder scan.'; }

  return {
    ipss: symptomScore,
    qol: input.qol_score_0_6,
    total,
    severity,
    action,
    notes: [
      'IPSS (1992, AUA Symptom Index): 0-35 symptoms + 0-6 QoL. 0-7 mild, 8-19 moderate, 20-35 severe.',
      'First-line medical: α-blocker (rapid onset 2-4 weeks). 5-ARI (slower onset 6-12 months, reduces prostate 20-30%).',
      'Surgical indications: failed medical therapy, retention, recurrent UTI, bladder stones, hematuria, renal failure.',
      'PSA: obtain at baseline, 50% of BPH men have elevated PSA. Monitor prostate cancer risk.'
    ],
    citations: ['IPSS/AUA Symptom Index (Barry 1992)', 'AUA BPH Guidelines 2021', 'EAU 2024 BPH Guidelines']
  };
}

function renalStonesRisk(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['sex', 'age', 'bmi', 'fluid_intake_L_d', 'sodium_g_d', 'animal_protein_g_d', 'oxalate_mg_d', 'calcium_mg_d'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  let riskPoints = 0;
  const factors = [];

  // Age and sex
  if (input.sex === 'male') { riskPoints += 2; factors.push('Male sex'); }
  if (input.age >= 40 && input.age < 60) { riskPoints += 1; factors.push('Age 40-60'); }
  else if (input.age >= 60) { riskPoints += 2; factors.push('Age ≥60'); }

  // BMI
  if (input.bmi >= 30) { riskPoints += 2; factors.push('Obesity (BMI ≥30)'); }
  else if (input.bmi >= 25) { riskPoints += 1; factors.push('Overweight'); }

  // Fluid intake
  if (input.fluid_intake_L_d < 1.5) { riskPoints += 3; factors.push('Low fluid intake (<1.5 L/d)'); }
  else if (input.fluid_intake_L_d < 2.0) { riskPoints += 1; factors.push('Suboptimal fluid intake'); }

  // Sodium
  if (input.sodium_g_d > 5) { riskPoints += 2; factors.push(`High sodium (${input.sodium_g_d} g/d)`); }

  // Animal protein
  if (input.animal_protein_g_d > 100) { riskPoints += 2; factors.push(`High animal protein (${input.animal_protein_g_d} g/d)`); }

  // Oxalate
  if (input.oxalate_mg_d > 200) { riskPoints += 2; factors.push(`High oxalate (${input.oxalate_mg_d} mg/d)`); }

  // Calcium
  if (input.calcium_mg_d < 800) { riskPoints += 2; factors.push(`Low calcium (${input.calcium_mg_d} mg/d)`); }
  else if (input.calcium_mg_d > 1500) { riskPoints += 1; factors.push(`High calcium (${input.calcium_mg_d} mg/d)`); }

  // Family history
  if (input.family_history) { riskPoints += 2; factors.push('Family history'); }
  if (input.recurrent_stones) { riskPoints += 3; factors.push('Recurrent stones'); }

  let severity = 'low';
  let action = '';
  if (riskPoints < 3) { severity = 'low'; action = 'Low risk: encourage hydration ≥2.5 L/d, balanced diet, normal calcium, moderate sodium/protein.'; }
  else if (riskPoints < 6) { severity = 'moderate'; action = 'Moderate risk: hydration ≥3 L/d, dietary modification, consider thiazide (hypercalciuria) or allopurinol (uric acid) if 24h urine abnormal.'; }
  else { severity = 'high'; action = 'High risk: 24-hour urine collection, metabolic workup. Targeted pharmacotherapy (thiazide, potassium citrate, allopurinol). Surgical interventions as needed.'; }

  return {
    riskPoints,
    factors,
    severity,
    action,
    notes: [
      'Most common kidney stone types: calcium oxalate (75%), calcium phosphate (10%), uric acid (8%), struvite (1%, infection), cystine (1%).',
      '24-hour urine: target urine volume ≥2.5 L, calcium <250 mg/d, oxalate <40 mg/d, citrate >320 mg/d, uric acid <600 mg/d.',
      'KSA-specific: high ambient temperature, dehydration common, calcium oxalate predominant.',
      'Tamsulosin 0.4mg daily for ureteral stones 5-10mm (facilitates passage).'
    ],
    citations: ['AUA/EAU 2024 Urolithiasis Guidelines', 'American Urological Association 2019 Medical Management of Kidney Stones']
  };
}

module.exports = { ipssScore, renalStonesRisk, IPSS_SEVERITY };
