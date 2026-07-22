// Palliative Care Performance Engine: Karnofsky + ECOG + PPS
// Pure deterministic, no I/O, no side effects

'use strict';

const KARNOFSKY_BANDS = {
  able_normal: { min: 80, label: 'Able to carry on normal activity, no special care needed' },
  unable_work: { min: 50, max: 70, label: 'Unable to work, able to live at home, varying degrees of assistance' },
  unable_care: { min: 10, max: 40, label: 'Unable to care for self, requires institutional/hospital care' },
  moribund: { max: 0, label: 'Moribund' }
};

const ECOG_BANDS = {
  active: { val: 0, label: 'Fully active, no restrictions' },
  restricted: { val: 1, label: 'Restricted in physically strenuous activity' },
  ambulatory: { val: 2, label: 'Ambulatory, capable of all self-care but no work' },
  limited: { val: 3, label: 'Limited self-care, confined to bed/chair >50% of day' },
  disabled: { val: 4, label: 'Completely disabled, no self-care' },
  dead: { val: 5, label: 'Dead' }
};

function karnofskyScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.karnofsky === undefined || input.karnofsky === null) throw new Error('karnofsky score required');
  if (input.karnofsky < 0 || input.karnofsky > 100 || input.karnofsky % 10 !== 0) throw new Error('karnofsky must be multiple of 10 in 0-100');

  let band = 'moribund';
  if (input.karnofsky >= 80) band = 'able_normal';
  else if (input.karnofsky >= 50) band = 'unable_work';
  else if (input.karnofsky >= 10) band = 'unable_care';

  let action = '';
  if (input.karnofsky >= 80) action = 'Curative or maintenance therapy. Routine oncology follow-up. Symptom control as needed.';
  else if (input.karnofsky >= 50) action = 'Consider palliative care consultation. Disease-directed therapy if appropriate. Symptom management priority.';
  else if (input.karnofsky >= 10) action = 'Palliative care primary. Symptom control, goals-of-care conversation. Hospice evaluation if prognosis <6 months.';
  else action = 'Comfort-focused care. Hospice if not already enrolled. Family meeting for goals of care.';

  return {
    karnofsky: input.karnofsky,
    band,
    action,
    notes: [
      'Karnofsky Performance Status (1949): 0 (dead) - 100 (normal, no complaints).',
      'KPS 70+ generally eligible for clinical trials. KPS 50-70 = ambulatory, capable of self-care.',
      'KPS <50 = requires considerable assistance; transition to palliative care.',
      'KPS <30 = terminal; hospice appropriate if not already enrolled.'
    ],
    citations: ['Karnofsky Performance Status (Karnofsky 1949)', 'NCCN Palliative Care 2024']
  };
}

function ecogScore(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.ecog === undefined || input.ecog === null) throw new Error('ecog required');
  if (![0, 1, 2, 3, 4, 5].includes(input.ecog)) throw new Error('ecog must be 0-5');

  const labels = ['',
    'Asymptomatic (fully active)',
    'Symptomatic but completely ambulatory (restricted in physically strenuous activity)',
    'Symptomatic, <50% in bed during the day (ambulatory, capable of all self-care)',
    'Symptomatic, >50% in bed (limited self-care)',
    'Bedbound (completely disabled)',
    'Dead'
  ];
  const action = input.ecog === 0
    ? 'Continue current therapy. Routine monitoring.'
    : input.ecog === 1
    ? 'Continue therapy, monitor closely. Consider dose reduction if toxicity develops.'
    : input.ecog === 2
    ? 'Symptomatic management priority. Continue therapy if benefit; hospice evaluation if declining.'
    : input.ecog === 3
    ? 'Palliative care primary. Hospice evaluation. Goals-of-care conversation. Limit aggressive interventions.'
    : input.ecog === 4
    ? 'Comfort-focused care. Hospice. Avoid hospitalizations. Family meeting for end-of-life preferences.'
    : 'Deceased. Bereavement support for family.';

  return {
    ecog: input.ecog,
    label: labels[input.ecog],
    action,
    notes: [
      'ECOG (Zubrod 1960, Oken 1982): 0 (fully active) - 5 (dead). 6-level scale.',
      'Inverse of KPS: ECOG 0 = KPS 100; ECOG 1 = KPS 80-90; ECOG 2 = KPS 60-70; ECOG 3 = KPS 40-50; ECOG 4 = KPS 10-30.',
      'Clinical trial eligibility typically ECOG 0-1 or 0-2.'
    ],
    citations: ['ECOG/Zubrod (Oken 1982, Am J Clin Oncol)']
  };
}

function pallPerformanceScale(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  // PPS = ambulation + activity + self-care + intake + consciousness, each on % scale
  const required = ['ambulation', 'activity', 'self_care', 'oral_intake', 'consciousness'];
  for (const k of required) {
    if (input[k] === undefined) input[k] = 100;  // default to best
  }

  // PPS = lowest of the 5 components (per Victoria Hospice PPS v2)
  const pps = Math.min(input.ambulation, input.activity, input.self_care, input.oral_intake, input.consciousness);

  let action = '';
  if (pps >= 70) action = 'PPS 70-100: stable disease or early decline. Maintain independence, monitor for progression.';
  else if (pps >= 50) action = 'PPS 50-60: transition phase. ADL support needed. Consider home health, palliative care involvement.';
  else if (pps >= 30) action = 'PPS 30-40: significant decline. Hospice evaluation. Caregiver support, equipment needs (hospital bed, oxygen).';
  else if (pps >= 10) action = 'PPS 10-20: end of life. Intensive comfort care. Family at bedside. Avoid non-beneficial interventions.';
  else action = 'PPS 0: actively dying. Comfort medications, family support, dignity in death.';

  return {
    pps,
    components: { ambulation: input.ambulation, activity: input.activity, self_care: input.self_care, oral_intake: input.oral_intake, consciousness: input.consciousness },
    action,
    notes: [
      'PPS (Anderson 1996, Victoria Hospice): 0 (dead) - 100 (normal).',
      'PPS is the lowest of: ambulation, activity, self-care, oral intake, consciousness level.',
      'PPS ≤70% commonly considered for palliative care; ≤50% for hospice (Medicare/Medicaid criteria).',
      'Prognostication tool: PPS 10-20 = median survival days, PPS 30-40 = weeks, PPS 50+ = months.'
    ],
    citations: ['PPS v2 (Victoria Hospice 1996, revised 2012)']
  };
}

module.exports = { karnofskyScore, ecogScore, pallPerformanceScale, KARNOFSKY_BANDS, ECOG_BANDS };
