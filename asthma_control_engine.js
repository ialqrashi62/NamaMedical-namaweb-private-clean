// Pulmonology engine: Asthma control (GINA 2024) + step up/down
// Based on GINA 2024 Strategy + ERS-ICM Asthma 2023

const GINA_STEPS = [
  { step: 1, treatment: 'PRN SABA only (now discouraged — prefer ICS-formoterol PRN)' },
  { step: 2, treatment: 'Low-dose ICS-formoterol PRN' },
  { step: 3, treatment: 'Low-dose ICS-LABA daily' },
  { step: 4, treatment: 'Medium-dose ICS-LABA' },
  { step: 5, treatment: 'High-dose ICS-LABA + LAMA' },
  { step: 6, treatment: 'High-dose ICS-LABA + LAMA + biologics' }
];

function assessAsthmaControl(input) {
  if (!input || input.current_step === undefined || input.fev1_pct === undefined) {
    throw new Error('assessAsthmaControl: current_step and fev1_pct required');
  }
  const { symptoms_per_week = 0, night_awakenings_per_month = 0, SABA_use_per_week = 0,
          activity_limitation = false, exacerbations_last_12m = 0, current_step, fev1_pct, act_score } = input;
  let control = 'uncontrolled';
  if (act_score !== undefined) {
    if (act_score >= 20) control = 'well_controlled';
    else if (act_score >= 16) control = 'partly_controlled';
    else control = 'uncontrolled';
  } else {
    const wellControlled = symptoms_per_week <= 2 && night_awakenings_per_month <= 2 &&
                           SABA_use_per_week <= 2 && !activity_limitation && exacerbations_last_12m === 0;
    const partlyCriteria = (symptoms_per_week > 2 ? 1 : 0) +
                            (night_awakenings_per_month > 2 ? 1 : 0) +
                            (SABA_use_per_week > 2 ? 1 : 0) +
                            (activity_limitation ? 1 : 0);
    if (wellControlled) control = 'well_controlled';
    else if (partlyCriteria <= 2) control = 'partly_controlled';
  }
  let recommendedStep = current_step;
  if (control === 'uncontrolled' && current_step < 6) recommendedStep = current_step + 1;
  else if (control === 'well_controlled' && current_step > 1) recommendedStep = Math.max(1, current_step - 1);
  const recommendations = [];
  if (control === 'uncontrolled') {
    recommendations.push({
      action: `Step up to GINA step ${recommendedStep}: ${GINA_STEPS[recommendedStep - 1].treatment}`,
      urgency: 'urgent',
      cite: 'GINA-2024-step-up'
    });
  } else if (control === 'partly_controlled') {
    recommendations.push({
      action: `Check adherence + inhaler technique. Consider step up to GINA step ${recommendedStep}: ${GINA_STEPS[recommendedStep - 1].treatment}`,
      urgency: 'routine',
      cite: 'GINA-2024-adherence'
    });
  } else if (control === 'well_controlled' && current_step > 1) {
    recommendations.push({
      action: `Consider step down to GINA step ${recommendedStep}: ${GINA_STEPS[recommendedStep - 1].treatment}`,
      urgency: 'routine',
      cite: 'GINA-2024-step-down'
    });
  }
  recommendations.push({ action: 'Annual flu vaccine + pneumococcal vaccine', urgency: 'routine', cite: 'GINA-2024-vaccines' });
  if (exacerbations_last_12m >= 2) {
    recommendations.push({
      action: 'Frequent exacerbations — consider biologics (omalizumab, mepolizumab, dupilumab)',
      urgency: 'urgent',
      cite: 'GINA-2024-biologics'
    });
  }
  return {
    value: fev1_pct,
    severity: control,
    notes: `Symptoms ${symptoms_per_week}/wk, night awakenings ${night_awakenings_per_month}/mo, SABA use ${SABA_use_per_week}/wk, ACT ${act_score !== undefined ? act_score : 'N/A'}`,
    control,
    currentStep: current_step,
    recommendedStep,
    recommendations,
    citations: ['GINA-2024-strategy', 'ERS-ICM-Asthma-2023']
  };
}

module.exports = { assessAsthmaControl, GINA_STEPS };
