// OBGYN Extended Engine: Partograph progression + Bishop score for induction
// Pure deterministic, no I/O, no side effects

'use strict';

const CERVICAL_DILATION_CM_HOUR = {
  // WHO partograph alert lines
  ACTIVE_LABOR_DILATION_CM: 4,
  MIN_PROGRESS_CM_PER_HOUR: 1
};

const BISHOP_CATEGORIES = {
  unfavorable: { max: 5, label: 'Unfavorable' },
  intermediate: { min: 5, max: 7, label: 'Intermediate' },
  favorable: { min: 7, label: 'Favorable' }
};

function partographAssessment(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['current_dilation_cm', 'hours_since_4cm', 'parity', 'contractions_per_10min', 'descent_station'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!['nulliparous', 'multiparous'].includes(input.parity)) throw new Error('parity must be nulliparous or multiparous');

  const dilationRate = input.hours_since_4cm > 0 ? (input.current_dilation_cm - 4) / input.hours_since_4cm : 0;
  const expectedRate = input.parity === 'nulliparous' ? 1.0 : 1.2;  // cm/hour
  const alertLineCrossed = dilationRate < expectedRate;

  let severity = 'normal';
  let action = '';
  if (!alertLineCrossed) {
    severity = 'normal';
    action = 'Active labor progressing normally. Continue supportive care, pain control, FHR monitoring q15-30min.';
  } else if (input.contractions_per_10min < 3) {
    severity = 'prolonged_latent';
    action = 'Inadequate contractions. Augment with oxytocin (start 2 mU/min, increase q15-30min). Reassess in 2 hours.';
  } else {
    severity = 'prolonged_active';
    action = 'Protraction disorder. Augment with oxytocin, ensure adequate contractions. If no progress in 2h → arrest of dilation → cesarean section.';
  }

  const recommendations = [
    { action: 'FHR monitoring: intermittent q15-30min in 1st stage, q5-15min in 2nd stage', level: 'standard' },
    { action: 'Maternal vitals q4h, urine output monitoring, hydration', level: 'standard' },
    { action: 'Allow 1 hour latent phase before diagnosing arrest (ACOG 2014)', level: 'standard' }
  ];
  if (input.contractions_per_10min >= 3) recommendations.push({ action: 'Adequate contractions; further augmentation unlikely to help', level: 'high' });
  if (severity === 'prolonged_active') recommendations.push({ action: 'Cesarean section if arrest of dilation despite adequate contractions for ≥2 hours', level: 'critical' });

  return {
    currentDilation: input.current_dilation_cm,
    hoursInActiveLabor: input.hours_since_4cm,
    dilationRateCmPerHour: Math.round(dilationRate * 100) / 100,
    expectedRate: expectedRate,
    alertLineCrossed,
    severity,
    action,
    recommendations,
    notes: [
      'WHO partograph: alert line = 1 cm/hour cervical dilation. Action line = 4 hours behind alert line.',
      'Friedman curve (1955) defined prolonged latent >20h nulliparous / >14h multiparous; active phase arrest = >2h no progress in multiparous, >3h in nulliparous (Zhang 2010 updated).',
      'ACOG 2014: allow 1 hour latent (for low-risk) or 2 hours latent for protracted labor before diagnosing arrest.'
    ],
    citations: [
      'WHO Partograph 1994',
      'Friedman Curve (Friedman 1955)',
      'ACOG Practice Bulletin 2014 (Dystocia)',
      'Zhang et al 2010 Contemporary Labor Curves (NEJM)'
    ]
  };
}

function bishopScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['dilation_cm', 'effacement_pct', 'station', 'consistency', 'position'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (!['firm', 'medium', 'soft'].includes(input.consistency)) throw new Error('consistency must be firm, medium, or soft');
  if (!['posterior', 'mid', 'anterior'].includes(input.position)) throw new Error('position must be posterior, mid, or anterior');

  let dilation = 0;
  if (input.dilation_cm === 0) dilation = 0;
  else if (input.dilation_cm <= 1) dilation = 1;
  else if (input.dilation_cm <= 2) dilation = 2;
  else if (input.dilation_cm <= 3) dilation = 3;
  else dilation = 3;

  let effacement = 0;
  if (input.effacement_pct <= 30) effacement = 0;
  else if (input.effacement_pct <= 50) effacement = 1;
  else if (input.effacement_pct <= 75) effacement = 2;
  else effacement = 3;

  let station = 0;
  if (input.station === -3) station = 0;
  else if (input.station === -2) station = 1;
  else if (input.station === -1 || input.station === 0) station = 2;
  else station = 3;

  const consistency = input.consistency === 'firm' ? 0 : input.consistency === 'medium' ? 1 : 2;
  const position = input.position === 'posterior' ? 0 : input.position === 'mid' ? 1 : 2;

  const total = dilation + effacement + station + consistency + position;

  let category = 'unfavorable';
  let recommendation = '';
  if (total <= 5) {
    category = 'unfavorable';
    recommendation = 'Bishop ≤5: pre-induction cervical ripening recommended. Methods: misoprostol 25µg PV q4h, dinoprostone 10mg PV, or Foley catheter. Reassess in 12-24h.';
  } else if (total <= 7) {
    category = 'intermediate';
    recommendation = 'Bishop 6-7: borderline. Mechanical ripening (Foley) or low-dose misoprostol. Consider induction vs repeat ripening.';
  } else {
    category = 'favorable';
    recommendation = 'Bishop ≥8: favorable for induction. Proceed with amniotomy and oxytocin. High success rate for vaginal delivery.';
  }

  return {
    bishop: total,
    components: { dilation, effacement, station, consistency, position },
    category,
    recommendation,
    notes: [
      'Bishop Score (Bishop 1964): 0-13. ≥6 favorable for induction, ≤5 unfavorable.',
      'Modified Bishop adds previous C-section status.',
      'Nulliparous cervix: parity adjustment suggested (lower threshold).'
    ],
    citations: ['Bishop Score (Bishop 1964)', 'ACOG 2009 Induction of Labor Practice Bulletin']
  };
}

module.exports = { partographAssessment, bishopScore, BISHOP_CATEGORIES };
