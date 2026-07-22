// Rheumatology Activity Engine: DAS28-CRP for RA, SLEDAI-2K for SLE
// Pure deterministic, no I/O, no side effects

'use strict';

const DAS28_CRP_SEVERITY = {
  remission: { max: 2.6, label: 'Remission' },
  low: { min: 2.6, max: 3.2, label: 'Low disease activity' },
  moderate: { min: 3.2, max: 5.1, label: 'Moderate activity' },
  high: { min: 5.1, label: 'High activity' }
};

const SLEDAI_SEVERITY = {
  no_activity: { max: 0, label: 'No activity' },
  mild: { min: 1, max: 5, label: 'Mild flare' },
  moderate: { min: 6, max: 10, label: 'Moderate flare' },
  severe: { min: 11, max: 19, label: 'Severe flare' },
  very_severe: { min: 20, label: 'Very severe flare' }
};

function das28crp(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['tender_joints_28', 'swollen_joints_28', 'crp_mg_L', 'patient_global_vas_0_100'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (input.tender_joints_28 < 0 || input.tender_joints_28 > 28) throw new Error('tender_joints_28 must be 0-28');
  if (input.swollen_joints_28 < 0 || input.swollen_joints_28 > 28) throw new Error('swollen_joints_28 must be 0-28');
  if (input.crp_mg_L < 0) throw new Error('crp_mg_L must be ≥ 0');
  if (input.patient_global_vas_0_100 < 0 || input.patient_global_vas_0_100 > 100) throw new Error('patient_global_vas_0_100 must be 0-100');

  // DAS28-CRP = 0.56 × sqrt(TJC28) + 0.28 × sqrt(SJC28) + 0.36 × ln(CRP+1) + 0.014 × PtGA + 0.96
  const tjc = Math.sqrt(input.tender_joints_28);
  const sjc = Math.sqrt(input.swollen_joints_28);
  const crpTerm = 0.36 * Math.log(input.crp_mg_L + 1);
  const ptga = 0.014 * input.patient_global_vas_0_100;
  const das28 = 0.56 * tjc + 0.28 * sjc + crpTerm + ptga + 0.96;
  const score = Math.round(das28 * 100) / 100;

  let severity = 'high';
  let action = '';
  if (score < 2.6) { severity = 'remission'; action = 'Taper DMARDs if deep remission ≥6 months. Continue scheduled follow-up.'; }
  else if (score <= 3.2) { severity = 'low'; action = 'Continue current DMARD. Tight control: recheck in 1-3 months.'; }
  else if (score <= 5.1) { severity = 'moderate'; action = 'Step-up: add or escalate csDMARD (MTX, LEF) or bDMARD (TNF-i, JAK-i, IL-6-i).'; }
  else { severity = 'high'; action = 'Major treatment change: add/switch bDMARD, glucocorticoid bridge, structural progression likely.'; }

  const recommendations = buildDas28Recommendations(score, input);

  return {
    das28: score,
    components: { TJC28: input.tender_joints_28, SJC28: input.swollen_joints_28, CRP_mg_L: input.crp_mg_L, PtGA: input.patient_global_vas_0_100 },
    severity,
    action,
    recommendations,
    notes: [
      'DAS28-CRP: thresholds 2.6 (remission), 3.2 (low), 5.1 (high).',
      'DAS28-ESR uses 1.08×ln(ESR) and different constant (1.08 vs 0.96); thresholds same.',
      'SDAI and CDAI are alternative composite measures.',
      'T2T (treat-to-target) target: remission or LDA within 6 months.'
    ],
    citations: ['DAS28-CRP (Prevoo 1995 modified by Fransen 2003)', 'EULAR 2022 RA Recommendations', 'ACR 2021 RA Guideline']
  };
}

function sledai2k(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['seizure', 'psychosis', 'organic_brain_syndrome', 'visual_disturbance', 'cranial_neuropathy', 'lupus_headache', 'cva', 'vasculitis', 'myositis', 'arthritis', 'rash', 'alopecia', 'mucosal_ulcers', 'pleurisy', 'pericarditis', 'fever', 'hematuria_5rbc', 'proteinuria_500mg_d', 'casts', 'leukopenia', 'lymphopenia', 'thrombocytopenia', 'low_complement', 'elevated_dsdna', 'rash_active', 'alopecia_active', 'mucosal_ulcers_active'];
  for (const k of required) {
    if (input[k] === undefined) input[k] = 0;
  }

  // Weight each descriptor per SLEDAI-2K
  const weighted = {
    seizure: input.seizure * 8,
    psychosis: input.psychosis * 8,
    organic_brain_syndrome: input.organic_brain_syndrome * 8,
    visual_disturbance: input.visual_disturbance * 8,
    cranial_neuropathy: input.cranial_neuropathy * 8,
    lupus_headache: input.lupus_headache * 8,
    cva: input.cva * 8,
    vasculitis: input.vasculitis * 8,
    myositis: input.myositis * 4,
    arthritis: input.arthritis * 4,
    rash: input.rash * 2,
    alopecia: input.alopecia * 2,
    mucosal_ulcers: input.mucosal_ulcers * 2,
    pleurisy: input.pleurisy * 2,
    pericarditis: input.pericarditis * 2,
    fever: input.fever * 1,
    hematuria_5rbc: input.hematuria_5rbc * 4,
    proteinuria_500mg_d: input.proteinuria_500mg_d * 4,
    casts: input.casts * 4,
    leukopenia: input.leukopenia * 1,
    lymphopenia: input.lymphopenia * 1,
    thrombocytopenia: input.thrombocytopenia * 1,
    low_complement: input.low_complement * 2,
    elevated_dsdna: input.elevated_dsdna * 2
  };

  const total = Object.values(weighted).reduce((sum, v) => sum + v, 0);

  let severity = 'severe';
  let action = '';
  if (total === 0) { severity = 'no_activity'; action = 'Continue maintenance therapy (HCQ, MMF, AZA). Routine lupus labs every 3-6 months.'; }
  else if (total <= 5) { severity = 'mild'; action = 'Mild flare: optimize HCQ. Topical steroids for rash. NSAIDs for arthritis. Target low-dose prednisone if needed.'; }
  else if (total <= 10) { severity = 'moderate'; action = 'Moderate flare: increase glucocorticoid (prednisone 20-40mg taper). Optimize immunosuppressant (MMF, AZA, MTX).'; }
  else if (total <= 19) { severity = 'severe'; action = 'Severe flare: IV methylprednisolone 500-1000mg daily × 3 days. Consider cyclophosphamide or rituximab.'; }
  else { severity = 'very_severe'; action = 'Very severe flare (nephritis, CNS): IV cyclophosphamide or rituximab. Plasmapheresis if crisis. ICU if needed.'; }

  return {
    sledai: total,
    components: weighted,
    severity,
    action,
    notes: [
      'SLEDAI-2K (Gladman 2002): range 0-105; descriptors present in last 10 days.',
      'SLEDAI-2K modifies original by including persistent disease activity (rash, alopecia, mucosal ulcers, low complement, elevated anti-dsDNA).',
      'BILAG is an alternative organ-based score (A=severe flare, B=moderate, C=mild stable, D=no activity, E=inactive).'
    ],
    citations: ['SLEDAI-2K (Gladman 2002)', 'BILAG (Hay 1993)', 'EULAR 2024 SLE Recommendations', 'ACR 2024 Lupus Nephritis']
  };
}

function buildDas28Recommendations(score, input) {
  const recs = [{ action: 'T2T (treat-to-target): aim for remission or low disease activity within 6 months', level: 'standard' }];
  if (input.crp_mg_L > 10 && input.swollen_joints_28 >= 3) {
    recs.push({ action: 'Significant inflammation: consider ultrasound or MRI to assess erosive disease', level: 'moderate' });
  }
  if (score >= 5.1) {
    recs.push({ action: 'Add biologic: TNF inhibitor (adalimumab, etanercept) or JAK inhibitor (tofacitinib, upadacitinib) or IL-6 (tocilizumab)', level: 'high' });
    recs.push({ action: 'Glucocorticoid bridge: prednisone 5-15mg daily, taper to ≤5mg within 8 weeks', level: 'moderate' });
  } else if (score >= 3.2) {
    recs.push({ action: 'Optimize methotrexate to 25mg SC weekly + folic acid 5mg weekly', level: 'high' });
    if (input.swollen_joints_28 >= 2) recs.push({ action: 'Consider triple therapy (MTX + SSZ + HCQ) if poor response to MTX alone', level: 'moderate' });
  }
  recs.push({ action: 'Screen for TB, hepatitis B/C, and counsel on infection risk before starting bDMARDs', level: 'standard' });
  return recs;
}

module.exports = { das28crp, sledai2k, DAS28_CRP_SEVERITY, SLEDAI_SEVERITY };
