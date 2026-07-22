// Trauma Score Engine: GCS + ISS + RTS + Revised Trauma Score
// Pure deterministic, no I/O, no side effects

'use strict';

const GCS_SEVERITY = {
  mild: { min: 13, max: 15, label: 'Mild brain injury' },
  moderate: { min: 9, max: 12, label: 'Moderate brain injury' },
  severe: { min: 3, max: 8, label: 'Severe brain injury' }
};

const ISS_SEVERITY = {
  minor: { max: 8, label: 'Minor' },
  moderate: { min: 9, max: 15, label: 'Moderate' },
  serious: { min: 16, max: 24, label: 'Serious' },
  severe: { min: 25, max: 49, label: 'Severe' },
  critical: { min: 50, label: 'Critical (max ISS 75)' }
};

const GCS_EYE = { 4: 0, 3: 1, 2: 2, 1: 3 };
const GCS_VERBAL = { 5: 0, 4: 1, 3: 2, 2: 3, 1: 4 };
const GCS_MOTOR = { 6: 0, 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };

function glasgowComaScale(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['eye', 'verbal', 'motor'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (input.eye < 1 || input.eye > 4) throw new Error('eye must be 1-4');
  if (input.verbal < 1 || input.verbal > 5) throw new Error('verbal must be 1-5');
  if (input.motor < 1 || input.motor > 6) throw new Error('motor must be 1-6');

  const total = input.eye + input.verbal + input.motor;

  let severity = 'severe';
  let action = '';
  if (total >= 13) { severity = 'mild'; action = 'Mild TBI: observation, consider imaging if LOC, anticoagulation, or focal deficit.'; }
  else if (total >= 9) { severity = 'moderate'; action = 'Moderate TBI: CT head, ICU admission, frequent neuro checks. ICP monitor if not improving.'; }
  else { severity = 'severe'; action = 'Severe TBI: intubate if GCS ≤8, hyperventilation target PaCO2 35, CT head, neurosurgery consult, ICP monitor, elevate head 30°.'; }

  return {
    gcs: total,
    components: { eye: input.eye, verbal: input.verbal, motor: input.motor },
    severity,
    action,
    notes: [
      'GCS 3-15. Components: Eye (1-4), Verbal (1-5), Motor (1-6).',
      'GCS 8 or less: intubation indicated. GCS ≤5: severe brain injury, mortality >50%.',
      'GCS 15 with LOC, amnesia, or focal deficit: still consider CT (Canadian CT Head Rule, NOC).',
      'Pediatric GCS is similar but with different verbal component (infants 1-5).'
    ],
    citations: ['GCS (Teasdale 1974, Lancet)', 'Advanced Trauma Life Support 10e (ACS 2018)']
  };
}

function injurySeverityScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (!Array.isArray(input.injuries) || input.injuries.length < 1) throw new Error('injuries array required with at least 1 AIS-coded injury');

  for (const inj of input.injuries) {
    if (inj.ais_severity < 1 || inj.ais_severity > 6) throw new Error('Each injury needs ais_severity 1-6');
  }

  // ISS = sum of squares of 3 highest AIS from 6 body regions
  const sorted = [...input.injuries].sort((a, b) => b.ais_severity - a.ais_severity).slice(0, 3);
  const score = sorted.reduce((sum, inj) => sum + (inj.ais_severity * inj.ais_severity), 0);

  // If any AIS=6, ISS auto = 75
  const final = input.injuries.some(i => i.ais_severity === 6) ? 75 : score;

  let severity = 'critical';
  let action = '';
  if (final < 9) { severity = 'minor'; action = 'Minor trauma: observe, discharge if stable and no concerning findings.'; }
  else if (final <= 15) { severity = 'moderate'; action = 'Moderate trauma: admit for observation, monitor for delayed complications.'; }
  else if (final <= 24) { severity = 'serious'; action = 'Serious trauma: ICU admission, comprehensive evaluation, early surgical consult.'; }
  else if (final < 50) { severity = 'severe'; action = 'Severe trauma: ICU, damage control resuscitation, multi-specialty consult.'; }
  else { severity = 'critical'; action = 'Critical (often unsurvivable): full resuscitation, family meeting, palliative care if appropriate.'; }

  return {
    iss: final,
    components: { three_highest_ais: sorted.map(i => i.ais_severity) },
    severity,
    action,
    notes: [
      'ISS 0-75. AIS 6 in any region = auto 75 (max).',
      'AIS 1: minor, 2: moderate, 3: serious, 4: severe, 5: critical, 6: unsurvivable.',
      'ISS ≥16 = major trauma; typically requires trauma center admission.',
      'Mortality: ISS 1-8 ~1%, 9-15 ~5%, 16-24 ~10%, 25-40 ~25%, >40 ~50%+.'
    ],
    citations: ['ISS (Baker 1974, J Trauma)', 'AIS Dictionary 2015 (AAAM)', 'CDC Field Triage 2011']
  };
}

function revisedTraumaScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['gcs_total', 'systolic_bp_mmHg', 'resp_rate'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (input.gcs_total < 3 || input.gcs_total > 15) throw new Error('gcs_total must be 3-15');

  // RTS components with coded values
  const gcsRTS = input.gcs_total >= 13 ? 4 : input.gcs_total >= 9 ? 3 : input.gcs_total >= 6 ? 2 : input.gcs_total >= 4 ? 1 : 0;
  const sbpRTS = input.systolic_bp_mmHg > 89 ? 4 : input.systolic_bp_mmHg >= 76 ? 3 : input.systolic_bp_mmHg >= 50 ? 2 : input.systolic_bp_mmHg >= 1 ? 1 : 0;
  const rrRTS = input.resp_rate >= 10 && input.resp_rate <= 29 ? 4 : input.resp_rate >= 30 ? 3 : input.resp_rate >= 6 ? 2 : input.resp_rate >= 1 ? 1 : 0;

  // RTS = 0.9368 × GCS + 0.7326 × SBP + 0.2908 × RR
  const rts = Math.round((0.9368 * gcsRTS + 0.7326 * sbpRTS + 0.2908 * rrRTS) * 100) / 100;

  let severity = 'critical';
  let action = '';
  if (rts >= 7.84) { severity = 'mild'; action = 'Mild trauma: routine evaluation, may discharge if stable.'; }
  else if (rts >= 6.0) { severity = 'moderate'; action = 'Moderate trauma: trauma team activation, comprehensive evaluation, close monitoring.'; }
  else if (rts >= 4.0) { severity = 'severe'; action = 'Severe trauma: full trauma team, ICU admission, damage control resuscitation.'; }
  else if (rts > 0) { severity = 'critical'; action = 'Critical trauma: massive transfusion protocol, immediate surgical intervention, high mortality.'; }
  else { severity = 'unsurvivable'; action = 'Consider futility; family meeting; palliative care.'; }

  return {
    rts,
    components: { gcs_coded: gcsRTS, sbp_coded: sbpRTS, rr_coded: rrRTS },
    severity,
    action,
    notes: [
      'RTS 0-7.84. Higher = better prognosis. Triage tool for field decisions.',
      'Champion 1989. Range-based coded values: 4 best, 0 worst.',
      'Used in TRISS methodology (RTS + ISS + age) for probability of survival.'
    ],
    citations: ['RTS (Champion 1989, J Trauma)', 'TRISS (Boyd 1987, J Trauma)']
  };
}

module.exports = { glasgowComaScale, injurySeverityScore, revisedTraumaScore, GCS_SEVERITY, ISS_SEVERITY };
