// Pulmonology engine: Polysomnography interpretation (AHI, ODI)
// Based on AASM CPG 2021 + ICSD-3

function interpretSleepStudy(input) {
  if (!input || input.ahi === undefined || input.odi === undefined || input.min_spo2 === undefined || input.tst_hours === undefined) {
    throw new Error('interpretSleepStudy: ahi, odi, min_spo2, tst_hours required');
  }
  const { ahi, odi, min_spo2, tst_hours, sleep_efficiency, rem_pct,
          arousal_index, periodic_limb_movement_index, predominant_event_type = 'obstructive' } = input;
  let osaSeverity = 'normal';
  if (ahi >= 5 && ahi < 15) osaSeverity = 'mild_OSA';
  else if (ahi >= 15 && ahi < 30) osaSeverity = 'moderate_OSA';
  else if (ahi >= 30) osaSeverity = 'severe_OSA';
  let severity = osaSeverity;
  if (min_spo2 < 80) severity = 'severe_OSA_with_hypoxemia';
  const recommendations = [];
  if (osaSeverity === 'mild_OSA' && predominant_event_type === 'positional') {
    recommendations.push({ action: 'Positional therapy (avoid supine)', urgency: 'routine', cite: 'AASM-Positional-therapy' });
  }
  if (osaSeverity === 'mild_OSA' || osaSeverity === 'moderate_OSA') {
    recommendations.push({ action: 'Lifestyle: weight loss if BMI ≥25, avoid alcohol before bed, sleep hygiene', urgency: 'routine', cite: 'AASM-CPG-OSA' });
  }
  if (osaSeverity === 'moderate_OSA' || osaSeverity === 'severe_OSA') {
    recommendations.push({ action: 'CPAP titration study (split-night or full-night)', urgency: 'urgent', cite: 'AASM-CPAP-titration' });
  }
  if (osaSeverity === 'severe_OSA' || min_spo2 < 80) {
    recommendations.push({ action: 'Do not drive until treated. Evaluate for commercial driving restrictions.', urgency: 'urgent', cite: 'AASM-driving-guidelines' });
  }
  if (periodic_limb_movement_index && periodic_limb_movement_index >= 15) {
    recommendations.push({ action: 'Periodic limb movement disorder — consider pramipexole or ropinirole', urgency: 'routine', cite: 'AASM-PLM' });
  }
  if (sleep_efficiency && sleep_efficiency < 85) {
    recommendations.push({ action: 'Poor sleep efficiency — assess for insomnia, anxiety, depression', urgency: 'routine', cite: 'AASM-Insomnia' });
  }
  return {
    value: ahi,
    severity,
    notes: `AHI ${ahi}, ODI ${odi}, min SpO2 ${min_spo2}%, TST ${tst_hours}h, sleep efficiency ${sleep_efficiency || 'N/A'}%, REM ${rem_pct || 'N/A'}%`,
    ahi,
    odi,
    minSpO2: min_spo2,
    sleepEfficiency: sleep_efficiency,
    predominantEventType: predominant_event_type,
    recommendations,
    citations: ['AASM-CPG-OSA-2021', 'ICSD-3']
  };
}

module.exports = { interpretSleepStudy };
