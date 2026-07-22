// Pulmonology engine: COPD severity (GOLD 2024) + treatment algorithm
// Based on GOLD 2024 Report + ATS COPD 2023

function copdSeverity(input) {
  if (!input || input.fev1_pct === undefined || input.cat_score === undefined || input.exacerbations_last_12m === undefined) {
    throw new Error('copdSeverity: fev1_pct, cat_score, exacerbations_last_12m required');
  }
  const { fev1_pct, cat_score, exacerbations_last_12m, hospitalization_last_12m = 0,
          mMRC_dyspnea = 0, smoke_status = 'former', eosinophils_cells_ul = 0 } = input;
  let goldStage = 'GOLD1';
  if (fev1_pct < 80) goldStage = 'GOLD1';
  if (fev1_pct < 50) goldStage = 'GOLD2';
  if (fev1_pct < 30) goldStage = 'GOLD3';
  if (fev1_pct < 30) goldStage = 'GOLD4';
  let group = 'A';
  const highSymptoms = (cat_score >= 10) || (mMRC_dyspnea >= 2);
  const highRisk = (exacerbations_last_12m >= 2) || (hospitalization_last_12m >= 1);
  if (highRisk) group = 'E';
  else if (highSymptoms) group = 'B';
  let firstLine = 'LAMA';
  if (group === 'B' && eosinophils_cells_ul < 100) firstLine = 'LABA+LAMA';
  if (group === 'B' && eosinophils_cells_ul >= 300) firstLine = 'ICS+LABA';
  if (group === 'E' && eosinophils_cells_ul < 100) firstLine = 'LABA+LAMA';
  if (group === 'E' && eosinophils_cells_ul >= 300) firstLine = 'ICS+LABA+LAMA';
  if (group === 'E' && eosinophils_cells_ul >= 100 && eosinophils_cells_ul < 300) firstLine = 'LABA+LAMA';
  let addOn = null;
  if (group === 'E' && hospitalization_last_12m >= 1) {
    addOn = 'Consider azithromycin prophylaxis (if not contraindicated)';
  }
  const recommendations = [
    { action: `${firstLine} as first-line maintenance therapy`, urgency: 'routine', cite: 'GOLD-2024-ABCD' },
    { action: 'Smoking cessation (if current smoker)', urgency: 'urgent', cite: 'GOLD-2024-risk-factors' },
    { action: 'Annual flu vaccine + pneumococcal vaccine', urgency: 'routine', cite: 'GOLD-2024-vaccines' },
    { action: 'Pulmonary rehabilitation (PR) — if mMRC ≥2 or exacerbation', urgency: 'routine', cite: 'GOLD-2024-PR' }
  ];
  if (addOn) recommendations.push({ action: addOn, urgency: 'routine', cite: 'GOLD-2024-exacerbations' });
  if (cat_score >= 20) {
    recommendations.push({ action: 'Severe symptom burden — consider triple therapy escalation', urgency: 'urgent', cite: 'GOLD-2024' });
  }
  if (hospitalization_last_12m >= 1) {
    recommendations.push({ action: 'Recent hospitalization — schedule follow-up within 7 days', urgency: 'urgent', cite: 'GOLD-2024-followup' });
  }
  return {
    value: fev1_pct,
    severity: `GOLD${group === 'A' ? '1' : group === 'B' ? '2' : group === 'E' ? '3' : '4'}-${group}`,
    notes: `FEV1 ${fev1_pct}% predicted, CAT ${cat_score}, exacerbations ${exacerbations_last_12m}/yr, hospitalizations ${hospitalization_last_12m}/yr, eos ${eosinophils_cells_ul} cells/μL`,
    goldStage,
    goldGroup: group,
    firstLine,
    recommendations,
    citations: ['GOLD-2024-report', 'ATS-COPD-2023']
  };
}

module.exports = { copdSeverity };
