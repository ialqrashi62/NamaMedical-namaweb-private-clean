// Sepsis & Early Warning Score 2 (EWS2 / NEWS2 + qSOFA + SOFA)
// Computes NEWS2 (qSOFA-style screening for sepsis per Sepsis-3)
// Pure deterministic, no I/O, no side effects

'use strict';

const NEWS2_SEVERITY = {
  low: { max: 4, label: 'Low risk' },
  low_medium: { min: 3, max: 4, label: 'Low-medium (single 3 = medium)' },
  medium: { min: 5, max: 6, label: 'Medium risk' },
  high: { min: 7, label: 'High risk' }
};

const NEWS2_RESP_RATE = { lt_9: 3, '9_to_11': 1, '12_to_20': 0, '21_to_24': 2, gt_24: 3 };
const NEWS2_SPO2_SCALE_1 = { lt_91: 3, '91_to_93': 2, '94_to_95': 1, gt_95: 0 };
const NEWS2_O2_SUPPLEMENT = { yes: 2, no: 0 };
const NEWS2_TEMP = { lt_35: 3, '35_to_36': 1, '36.1_to_38': 0, '38.1_to_39': 1, gt_39: 2 };
const NEWS2_SBP = { lt_91: 3, '91_to_100': 2, '101_to_110': 1, '111_to_219': 0, gt_219: 3 };
const NEWS2_PULSE = { lt_41: 3, '41_to_50': 1, '51_to_90': 0, '91_to_110': 1, '111_to_130': 2, gt_130: 3 };
const NEWS2_CONSCIOUSNESS = { new_confusion: 3, alert: 0 };

function news2Score(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['resp_rate', 'spo2_pct', 'oxygen_supplement', 'temperature_c', 'systolic_bp_mmHg', 'pulse_bpm', 'consciousness'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!['alert', 'new_confusion'].includes(input.consciousness)) throw new Error('consciousness must be alert or new_confusion');

  const components = {
    resp_rate: scoreRange(input.resp_rate, [[9, Infinity, 0], [12, 20, 0], [21, 24, 2], [25, Infinity, 3]], [['lt_9', 3]]),
    spo2: scoreRange(input.spo2_pct, [[95, Infinity, 0], [94, 95, 1], [91, 93, 2], [0, 90, 3]], []),
    oxygen_supplement: input.oxygen_supplement ? 2 : 0,
    temperature: scoreRange(input.temperature_c, [[36.1, 38.0, 0], [38.1, 39.0, 1], [39.1, Infinity, 2]], [['lt_35', 3], ['35_to_36', 1]]),
    systolic_bp: scoreRange(input.systolic_bp_mmHg, [[111, 219, 0], [101, 110, 1], [91, 100, 2], [0, 90, 3]], [['gt_219', 3]]),
    pulse: scoreRange(input.pulse_bpm, [[51, 90, 0], [91, 110, 1], [111, 130, 2], [131, Infinity, 3]], [['lt_41', 3], ['41_to_50', 1]]),
    consciousness: input.consciousness === 'new_confusion' ? 3 : 0
  };

  const total = Object.values(components).reduce((sum, v) => sum + v, 0);

  let severity = 'low';
  let action = '';
  if (total < 3) { severity = 'low'; action = 'Continue routine monitoring (q4-12h). No escalation needed.'; }
  else if (total <= 4) { severity = 'low_medium'; action = 'Increase monitoring to q1h. Senior review. Consider bloods, ECG, fluids if clinical concern.'; }
  else if (total <= 6) { severity = 'medium'; action = 'Urgent clinical review. Bloods, ECG, CXR, fluids, antibiotics if sepsis suspected. Consider HDU/level-2 care.'; }
  else { severity = 'high'; action = 'Emergency response: critical care outreach, ICU/HDU admission, full sepsis workup, broad-spectrum antibiotics within 1 hour.'; }

  // Sepsis-3 screen (qSOFA + organ dysfunction)
  const qsofa = computeQsofa(input);
  const sepsisFlag = qsofa.score >= 2;
  const septicShockFlag = qsofa.score >= 2 && (input.systolic_bp_mmHg <= 100 || input.lactate_mmol_L >= 2);

  const recommendations = buildSepsisRecommendations(total, sepsisFlag, septicShockFlag, input);

  return {
    news2: total,
    components,
    severity,
    action,
    qsofa,
    sepsisFlag,
    septicShockFlag,
    recommendations,
    notes: [
      'NEWS2 (Royal College of Physicians 2017): 0-20; ≥7 critical, 5-6 medium, 3-4 single 3 = medium.',
      'qSOFA ≥2 → high probability of sepsis, organ dysfunction, ICU.',
      'Sepsis-3 = infection + organ dysfunction (SOFA rise ≥2). Septic shock = vasopressor needed to maintain MAP ≥65 AND lactate >2 mmol/L despite adequate fluid resuscitation.',
      'Sepsis-1 (SIRS-based) is now considered legacy.'
    ],
    citations: [
      'NEWS2 (RCP 2017)',
      'Sepsis-3 (Singer 2016, JAMA)',
      'Surviving Sepsis Campaign 2021 Guidelines',
      'qSOFA (Seymour 2016, JAMA)'
    ]
  };
}

function computeQsofa(input) {
  const items = [];
  if (input.resp_rate >= 22) items.push('rr≥22');
  if (input.systolic_bp_mmHg <= 100) items.push('sbp≤100');
  if (input.consciousness === 'new_confusion') items.push('altered_mental');
  return { score: items.length, items };
}

function scoreRange(val, brackets) {
  for (const [min, max, score] of brackets) {
    if (val >= min && val <= max) return score;
  }
  return 0;
}

function buildSepsisRecommendations(news2, sepsis, septicShock, input) {
  const recs = [];
  if (septicShock) {
    recs.push({ action: 'EMERGENCY: Activate sepsis pathway, transfer to ICU, broad-spectrum antibiotics within 1 hour', level: 'critical' });
    recs.push({ action: 'IV crystalloid 30 mL/kg (RL preferred) within first 3 hours', level: 'critical' });
    recs.push({ action: 'Vasopressor (norepinephrine 5-20 µg/min) if MAP <65 after fluid resuscitation', level: 'critical' });
    recs.push({ action: 'Lactate, blood cultures × 2, broad-spectrum antibiotics (Pip-Tazo 4.5g or meropenem 1g IV)', level: 'critical' });
    recs.push({ action: 'Source control: imaging (CT), surgical consult if indicated', level: 'high' });
  } else if (sepsis) {
    recs.push({ action: 'Sepsis suspected: blood cultures, lactate, broad-spectrum antibiotics within 1 hour', level: 'high' });
    recs.push({ action: 'IV crystalloid 30 mL/kg if hypotensive or lactate ≥2', level: 'high' });
    recs.push({ action: 'Source identification: CXR, urinalysis, procalcitonin', level: 'high' });
  } else if (news2 >= 5) {
    recs.push({ action: 'Urgent clinical review by senior. Bloods, ECG, CXR, sepsis screen if infection suspected.', level: 'high' });
  }
  if (input.lactate_mmol_L !== undefined) {
    if (input.lactate_mmol_L >= 2) recs.push({ action: 'Hyperlactatemia detected: optimize fluid resuscitation, repeat lactate in 2-4 hours', level: 'high' });
  }
  if (news2 >= 7) recs.push({ action: 'High NEWS2: critical care outreach, consider ICU/HDU admission', level: 'high' });
  return recs;
}

module.exports = { news2Score, computeQsofa, NEWS2_SEVERITY };
