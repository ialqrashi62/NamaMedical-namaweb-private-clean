// Inflammatory Bowel Disease Activity Engine
// Computes Mayo Score (UC) and CDAI (Crohn's) to assess disease activity
// Pure deterministic, no I/O, no side effects

'use strict';

const MAYO_SEVERITY = {
  remission: { max: 2, label: 'Remission' },
  mild: { min: 3, max: 5, label: 'Mild' },
  moderate: { min: 6, max: 10, label: 'Moderate' },
  severe: { min: 11, max: 12, label: 'Severe' }
};

const CDAI_SEVERITY = {
  remission: { max: 150, label: 'Remission' },
  mild: { min: 150, max: 220, label: 'Mild' },
  moderate: { min: 220, max: 450, label: 'Moderate' },
  severe: { min: 450, label: 'Severe' }
};

function ucMayoScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['stool_frequency_subscore', 'rectal_bleeding_subscore', 'endoscopic_subscore', 'physician_global_subscore'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  for (const k of required) {
    if (![0, 1, 2, 3].includes(input[k])) throw new Error(`${k} must be 0-3 (Mayo subscore)`);
  }

  const partial = input.stool_frequency_subscore + input.rectal_bleeding_subscore + input.endoscopic_subscore;
  const total = partial + input.physician_global_subscore;

  let severity = 'severe';
  let recommendation = '';
  if (total <= 2) { severity = 'remission'; recommendation = 'Continue maintenance (5-ASA, immunomodulator, or biologic). Surveillance colonoscopy every 1-3 years.'; }
  else if (total <= 5) { severity = 'mild'; recommendation = 'Optimize maintenance therapy. Rectal 5-ASA or steroid foam for distal disease. Reassess in 4 weeks.'; }
  else if (total <= 10) { severity = 'moderate'; recommendation = 'Step up therapy: oral steroids (prednisone 40mg taper) or biologic (anti-TNF, vedolizumab, ustekinumab).'; }
  else { severity = 'severe'; recommendation = 'Hospitalization: IV methylprednisolone 60mg/day. Rescue therapy (infliximab or cyclosporine) if steroid-refractory. Surgical consult.'; }

  return {
    totalScore: total,
    partialScore: partial,
    subscores: { stool_frequency: input.stool_frequency_subscore, rectal_bleeding: input.rectal_bleeding_subscore, endoscopy: input.endoscopic_subscore, physician_global: input.physician_global_subscore },
    severity,
    recommendation,
    notes: [
      'Mayo Score: 0-12. Total score = sum of 4 subscores (0-3 each).',
      'Endoscopic subscore: 0=normal, 1=erythema/decreased vascularity, 2=marked erythema/erosions, 3=spontaneous bleeding/ulceration.',
      'Clinical response = decrease in partial Mayo ≥2 OR partial Mayo ≤2.',
      'SCCAI (UK) is alternative when endoscopy not feasible.'
    ],
    citations: ['Mayo Clinic Score (Schroeder 1987)', 'STRIDE-II Treat-to-Target 2020', 'ACG 2019 UC Guidelines']
  };
}

function crohnCDAI(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  // Required CDAI components (Best et al 1976, simplified 8-variable version)
  const required = ['liquid_stools_7d', 'abdominal_pain_7d', 'general_wellbeing_7d', 'hematocrit_pct', 'weight_loss_pct'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  const requiredOptional = ['extraintestinal_complications', 'loperamide_opiate_use', 'abdominal_mass'];
  for (const k of requiredOptional) {
    if (input[k] === undefined) input[k] = 0;  // default to 0
  }

  // Component calculations
  const stoolScore = input.liquid_stools_7d * 2;  // 7-day sum
  const painScore = input.abdominal_pain_7d * 5;  // 0-3 per day x 7
  const wellbeingScore = input.general_wellbeing_7d * 7;  // 0-4 per day x 7

  // Hematocrit: male <47% subtract, female <42% subtract
  let hctScore = 0;
  if (input.sex === 'male') hctScore = Math.max(0, 47 - input.hematocrit_pct) * 6;
  else hctScore = Math.max(0, 42 - input.hematocrit_pct) * 6;

  // Weight loss: % below standard
  const weightScore = input.weight_loss_pct > 0 ? input.weight_loss_pct : 0;

  const total = stoolScore + painScore + wellbeingScore + hctScore + weightScore
    + (input.extraintestinal_complications * 20)
    + (input.loperamide_opiate_use * 30)
    + (input.abdominal_mass * 10);

  let severity = 'severe';
  let recommendation = '';
  if (total < 150) { severity = 'remission'; recommendation = 'Maintain current therapy. Endoscopic/radiographic surveillance per STRIDE-II.'; }
  else if (total <= 220) { severity = 'mild'; recommendation = 'Consider escalation of maintenance. Budesonide for ileal disease. Reassess CRP/calprotectin in 4 weeks.'; }
  else if (total <= 450) { severity = 'moderate'; recommendation = 'Step up: corticosteroids or biologic. CRP >5 mg/L or calprotectin >250 µg/g supports active disease.'; }
  else { severity = 'severe'; recommendation = 'Hospitalization: IV steroids, biologic rescue (infliximab/ustekinumab), surgical consult for complications (abscess, fistula, obstruction).'; }

  return {
    totalScore: Math.round(total),
    components: { stool: stoolScore, pain: painScore, wellbeing: wellbeingScore, hematocrit: Math.round(hctScore), weight_loss: weightScore, extraintestinal: input.extraintestinal_complications * 20, loperamide: input.loperamide_opiate_use * 30, abdominal_mass: input.abdominal_mass * 10 },
    severity,
    recommendation,
    notes: [
      'CDAI ranges 0-600+. Score 150-220 mild, 220-450 moderate, >450 severe, <150 remission.',
      'CDAI is calculated from a 7-day patient diary + labs.',
      'Harvey-Bradshaw Index (HBI) is a simpler 5-item alternative (cutoff <5 remission, 5-7 mild, 8-16 moderate, >16 severe).',
      'STRIDE-II treat-to-target: clinical remission + biomarker normalization + mucosal healing.'
    ],
    citations: ['CDAI (Best 1976, Gastroenterology)', 'Harvey-Bradshaw Index (Harvey 1980)', 'STRIDE-II 2020', 'ECCO 2019 Crohn Guidelines']
  };
}

module.exports = { ucMayoScore, crohnCDAI, MAYO_SEVERITY, CDAI_SEVERITY };
