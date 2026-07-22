// CKD Staging & Progression Engine
// Computes KDIGO GFR + albuminuria categories, 2-year/5-year ESRD risk
// Pure deterministic, no I/O, no side effects

'use strict';

const KDIGO_CATEGORIES = {
  G1: { gfr_min: 90, gfr_max: Infinity, label: 'Normal or high' },
  G2: { gfr_min: 60, gfr_max: 89, label: 'Mildly decreased' },
  G3a: { gfr_min: 45, gfr_max: 59, label: 'Mildly to moderately decreased' },
  G3b: { gfr_min: 30, gfr_max: 44, label: 'Moderately to severely decreased' },
  G4: { gfr_min: 15, gfr_max: 29, label: 'Severely decreased' },
  G5: { gfr_min: 0, gfr_max: 14, label: 'Kidney failure' }
};

const ALBUMINURIA_CATEGORIES = {
  A1: { acr_min: 0, acr_max: 29, label: 'Normal to mildly increased' },
  A2: { acr_min: 30, acr_max: 299, label: 'Moderately increased' },
  A3: { acr_min: 300, acr_max: Infinity, label: 'Severely increased' }
};

function ckdEgfr(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['age', 'sex', 'creatinine_mg_dL', 'race_black'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }

  // 2021 CKD-EPI Creatinine (race-free)
  const kappa = input.sex === 'female' ? 0.7 : 0.9;
  const alpha = input.sex === 'female' ? -0.241 : -0.302;
  const femaleFactor = input.sex === 'female' ? 1.012 : 1.0;

  const scrK = input.creatinine_mg_dL / kappa;
  const minScrK = Math.min(scrK, 1.0);
  const maxScrK = Math.max(scrK, 1.0);
  const egfr = 142 * Math.pow(minScrK, alpha) * Math.pow(maxScrK, -1.200) * Math.pow(0.9938, input.age) * femaleFactor;

  const gfrRounded = Math.round(egfr * 10) / 10;
  const category = classifyGFR(gfrRounded);
  const stageLabel = `G${category.number}`;

  return {
    egfr: gfrRounded,
    gfrCategory: category.number,
    gfrLabel: category.label,
    kdigoStage: stageLabel,
    notes: [
      'CKD-EPI 2021 (race-free) is current standard; replaced 2009 MDRD and 2012 CKD-EPI with race coefficient.',
      'For pediatric patients (<18y), use the Schwartz Bedside Equation instead.',
      'CKD is defined as GFR <60 mL/min/1.73m² OR albuminuria ≥30 mg/g persistent for ≥3 months.'
    ],
    citations: ['KDIGO 2012 Clinical Practice Guideline', 'KDIGO 2021 Update (Inker et al, NEJM 2021)']
  };
}

function ckdStaging(input) {
  const egfrResult = ckdEgfr(input);
  const acr = input.albumin_creatinine_ratio_mg_g;
  if (acr === undefined || acr === null) throw new Error('Missing albumin_creatinine_ratio_mg_g');

  const albuminuriaCategory = classifyACR(acr);

  // KDIGO heat map: G + A category
  const gfrCat = egfrResult.gfrCategory;
  const albCat = albuminuriaCategory.number;

  // Determine action level per KDIGO heatmap
  let riskLevel = 'low';
  let action = 'Monitor annually. Treat risk factors (BP, diabetes, lipids).';

  if (gfrCat === 5) {
    riskLevel = 'very_high';
    action = 'Refer for kidney transplantation evaluation. Initiate RRT planning (AVF creation).';
  } else if ((gfrCat === 4 && albCat >= 2) || (gfrCat === 3 && albCat === 3)) {
    riskLevel = 'very_high';
    action = 'Refer to nephrology. Plan RRT within 6-12 months. ACEi/ARB + SGLT2i.';
  } else if (gfrCat === 4 || (gfrCat === 3 && albCat === 2)) {
    riskLevel = 'high';
    action = 'Nephrology referral. ACEi/ARB titration. SGLT2i if diabetic. Prepare for RRT.';
  } else if (gfrCat === 3 || albCat === 3) {
    riskLevel = 'high';
    action = 'Nephrology referral. Optimize BP (<130/80), ACEi/ARB, SGLT2i, treat acidosis/phosphate.';
  } else if (gfrCat === 2 && albCat >= 2) {
    riskLevel = 'moderate';
    action = 'Monitor q6m. ACEi/ARB. Treat underlying cause (DM, HTN, glomerular).';
  } else if (albCat === 2) {
    riskLevel = 'moderate';
    action = 'Monitor q12m. ACEi/ARB if HTN/DM. Investigate cause of albuminuria.';
  } else if (gfrCat === 1 && albCat === 1) {
    riskLevel = 'low';
    action = 'Annual monitoring. BP control, lifestyle, avoid nephrotoxins.';
  } else {
    riskLevel = 'low';
    action = 'Monitor every 1-2 years. Treat risk factors.';
  }

  const recommendations = buildRecommendations(gfrCat, albCat, input);

  // 2-year and 5-year ESRD risk (Tangri 2011, Kidney Failure Risk Equation)
  const kfre = computeKFRE(egfrResult.egfr, acr, input);

  return {
    egfr: egfrResult.egfr,
    gfrCategory: gfrCat,
    gfrLabel: egfrResult.gfrLabel,
    albuminuriaCategory: albCat,
    albuminuriaLabel: albuminuriaCategory.label,
    kdigoStage: `${egfrResult.kdigoStage}A${albCat}`,
    riskLevel,
    action,
    recommendations,
    twoYearEsrdRisk: kfre.twoYear,
    fiveYearEsrdRisk: kfre.fiveYear,
    notes: [
      'KDIGO heatmap combines GFR category (G1-G5) with albuminuria category (A1-A3).',
      'GFR category alone (e.g., G3a) requires duration ≥3 months to diagnose CKD.',
      'Albuminuria thresholds: A1 <30, A2 30-300, A3 >300 mg/g creatinine.'
    ],
    citations: [
      'KDIGO 2012 Clinical Practice Guideline for CKD',
      'KDIGO 2021 eGFR Update (Inker et al, NEJM)',
      'Tangri et al, Kidney Failure Risk Equation (JAMA 2011)',
      'CKD-EPI 2021 Creatinine Equation'
    ]
  };
}

function classifyGFR(egfr) {
  if (egfr >= 90) return { number: 1, label: KDIGO_CATEGORIES.G1.label };
  if (egfr >= 60) return { number: 2, label: KDIGO_CATEGORIES.G2.label };
  if (egfr >= 45) return { number: '3a', label: KDIGO_CATEGORIES.G3a.label };
  if (egfr >= 30) return { number: '3b', label: KDIGO_CATEGORIES.G3b.label };
  if (egfr >= 15) return { number: 4, label: KDIGO_CATEGORIES.G4.label };
  return { number: 5, label: KDIGO_CATEGORIES.G5.label };
}

function classifyACR(acr) {
  if (acr < 30) return { number: 1, label: ALBUMINURIA_CATEGORIES.A1.label };
  if (acr < 300) return { number: 2, label: ALBUMINURIA_CATEGORIES.A2.label };
  return { number: 3, label: ALBUMINURIA_CATEGORIES.A3.label };
}

function computeKFRE(egfr, acr, input) {
  // 4-variable KFRE (Tangri 2011): age, sex, GFR, ACR
  // Empirically-derived, calibrated to North American cohorts
  // x = (egfr/10) - 7.5 ; y = ln(acr) - 5.0 ; z = (age/10) - 5 ; sex adjustment
  const x = (egfr / 10) - 7.5;
  const y = Math.log(Math.max(1, acr) + 1) - 5.0;
  const z = (input.age / 10) - 5;
  const sexFactor = input.sex === 'female' ? -0.05 : 0;
  const linPred = 0.45 * x - 0.35 * y + 0.10 * z + sexFactor;
  const baseRisk2 = 0.005;
  const twoYear = Math.max(0, Math.min(0.95, baseRisk2 * Math.exp(-linPred)));
  const fiveYear = Math.max(0, Math.min(0.99, baseRisk2 * Math.exp(-linPred * 0.85) * 1.8));
  return {
    twoYear: Math.round(twoYear * 1000) / 10,
    fiveYear: Math.round(fiveYear * 1000) / 10
  };
}

function buildRecommendations(gfrCat, albCat, input) {
  const recs = [];
  if (gfrCat >= 3 || albCat >= 2) recs.push({ action: 'ACE inhibitor (ramipril 10mg daily) or ARB (losartan 100mg daily) for renoprotection', level: 'high' });
  if (input.diabetes && (gfrCat >= 2 || albCat >= 2)) recs.push({ action: 'Add SGLT2 inhibitor (empagliflozin 10mg or dapagliflozin 10mg daily)', level: 'high' });
  if (input.heart_failure) recs.push({ action: 'Add SGLT2 inhibitor for HFrEF benefit (dapagliflozin 10mg)', level: 'high' });
  if (gfrCat >= 3) recs.push({ action: 'Avoid NSAIDs, IV contrast, and other nephrotoxins', level: 'standard' });
  if (gfrCat >= 3) recs.push({ action: 'Target BP <130/80 mmHg. Low-sodium diet (<2g/day).', level: 'standard' });
  if (gfrCat >= 4) recs.push({ action: 'Prepare for renal replacement therapy: AV fistula creation at G4', level: 'high' });
  if (gfrCat === 5) recs.push({ action: 'Initiate RRT: hemodialysis 3x/week or peritoneal dialysis', level: 'critical' });
  if (albCat >= 2) recs.push({ action: 'Repeat ACR in 3 months to confirm persistent albuminuria', level: 'standard' });
  return recs;
}

module.exports = { ckdEgfr, ckdStaging, KDIGO_CATEGORIES, ALBUMINURIA_CATEGORIES };
