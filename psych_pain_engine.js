// Psychiatry & Pain Engine: PHQ-9 (depression) + GAD-7 (anxiety) + Wong-Baker Faces
// Pure deterministic, no I/O, no side effects

'use strict';

const PHQ9_SEVERITY = {
  minimal: { max: 4, label: 'Minimal' },
  mild: { min: 5, max: 9, label: 'Mild' },
  moderate: { min: 10, max: 14, label: 'Moderate' },
  moderately_severe: { min: 15, max: 19, label: 'Moderately severe' },
  severe: { min: 20, label: 'Severe' }
};

const GAD7_SEVERITY = {
  minimal: { max: 4, label: 'Minimal' },
  mild: { min: 5, max: 9, label: 'Mild' },
  moderate: { min: 10, max: 14, label: 'Moderate' },
  severe: { min: 15, label: 'Severe' }
};

function phq9Score(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['q1_anhedonia', 'q2_mood', 'q3_sleep', 'q4_energy', 'q5_appetite', 'q6_self_esteem', 'q7_concentration', 'q8_motor', 'q9_self_harm'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
    if (![0, 1, 2, 3].includes(input[k])) throw new Error(`${k} must be 0-3 (Not at all / Several days / More than half days / Nearly every day)`);
  }

  const total = required.reduce((sum, k) => sum + input[k], 0);

  let severity = 'severe';
  let action = '';
  if (total < 5) { severity = 'minimal'; action = 'Minimal depression. Routine screening at next visit. Supportive counseling.'; }
  else if (total <= 9) { severity = 'mild'; action = 'Mild depression: watchful waiting, behavioral activation, counseling. Reassess in 2-4 weeks.'; }
  else if (total <= 14) { severity = 'moderate'; action = 'Moderate depression: SSRI (sertraline, escitalopram) ± psychotherapy. Reassess in 2-4 weeks.'; }
  else if (total <= 19) { severity = 'moderately_severe'; action = 'Moderately severe depression: SSRI/SNRI + CBT or other psychotherapy. Consider combination therapy.'; }
  else { severity = 'severe'; action = 'Severe depression: SSRI + psychotherapy, consider ECT, TMS, or augmentation. Specialist referral.'; }

  const suicialIdeationFlag = input.q9_self_harm >= 1;
  let safety = '';
  if (suicialIdeationFlag) {
    safety = ' SUICIDAL IDEATION REPORTED: assess severity (thoughts only, plan, means, intent), safety contract, restrict means (firearms, medications), emergency psychiatric consult. Admit if not safe.';
  }

  return {
    phq9: total,
    severity,
    action: action + safety,
    suicialIdeation: suicialIdeationFlag,
    notes: [
      'PHQ-9 (Kroenke 2001): 0-27. Maps to DSM-5 depressive disorder criteria.',
      'Q9 (suicidal ideation): any positive score mandates further safety assessment.',
      'PHQ-9 ≥10 has 88% sensitivity / 88% specificity for major depression.',
      'SSRI 4-6 weeks to assess response. Augment or switch if inadequate.'
    ],
    citations: ['PHQ-9 (Kroenke 2001, JGIM)', 'APA 2019 Major Depressive Disorder Guidelines']
  };
}

function gad7Score(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['q1_nervous', 'q2_worry_control', 'q3_worry_too_much', 'q4_relaxation_difficulty', 'q5_restless', 'q6_annoyed', 'q7_afraid'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
    if (![0, 1, 2, 3].includes(input[k])) throw new Error(`${k} must be 0-3`);
  }

  const total = required.reduce((sum, k) => sum + input[k], 0);

  let severity = 'severe';
  let action = '';
  if (total < 5) { severity = 'minimal'; action = 'Minimal anxiety. Routine screening.'; }
  else if (total <= 9) { severity = 'mild'; action = 'Mild anxiety: self-help, relaxation, sleep hygiene, lifestyle. Reassess 2-4 weeks.'; }
  else if (total <= 14) { severity = 'moderate'; action = 'Moderate anxiety: CBT (first-line) ± SSRI/SNRI. Avoid benzodiazepines as first-line for chronic anxiety.'; }
  else { severity = 'severe'; action = 'Severe anxiety: SSRI/SNRI + CBT, specialist referral. Consider short-term benzodiazepine bridge.'; }

  return {
    gad7: total,
    severity,
    action,
    notes: [
      'GAD-7 (Spitzer 2006): 0-21. Score ≥10 has 89% sensitivity / 82% specificity for GAD.',
      'Also screens for panic, social anxiety, PTSD.',
      'Benzodiazepines: only short-term (≤2 weeks) for acute crisis; risk of dependence.',
      'CBT and SSRIs/SNRIs are first-line for chronic anxiety (5-8 weeks to effect).'
    ],
    citations: ['GAD-7 (Spitzer 2006, Arch Intern Med)', 'APA 2020 Anxiety Treatment Guidelines']
  };
}

function wongBakerFaces(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.face_score === undefined) throw new Error('face_score required');
  if (![0, 2, 4, 6, 8, 10].includes(input.face_score)) throw new Error('face_score must be 0, 2, 4, 6, 8, or 10');

  const faces = {
    0: { label: 'No hurt', description: 'No pain at all', emoji: '😄' },
    2: { label: 'Hurts little bit', description: 'Mild, barely noticeable', emoji: '🙂' },
    4: { label: 'Hurts little more', description: 'Mild-moderate, distracting', emoji: '😐' },
    6: { label: 'Hurts even more', description: 'Moderate, can be ignored for periods', emoji: '😟' },
    8: { label: 'Hurts whole lot', description: 'Severe, hard to focus', emoji: '😩' },
    10: { label: 'Hurts worst', description: 'Worst possible, unbearable', emoji: '😭' }
  };

  let action = '';
  if (input.face_score <= 2) action = 'No/mild pain: comfort measures, non-pharmacologic. Reassess q4h.';
  else if (input.face_score <= 4) action = 'Mild-moderate pain: acetaminophen 1g PO/PR q6h OR ibuprofen 400mg PO q6h. Non-pharmacologic (heat, repositioning, relaxation).';
  else if (input.face_score <= 6) action = 'Moderate pain: opioid PRN (tramadol 50-100mg q6h or codeine 30-60mg q6h) + non-opioid. Address underlying cause.';
  else if (input.face_score <= 8) action = 'Severe pain: opioid (morphine 5-10mg PO or oxycodone 5-10mg PO q4h PRN) + non-opioid. Reassess 1h after dose. Pain team consult if refractory.';
  else action = 'Worst pain: urgent pain team consult, IV opioids (morphine 2-4mg IV q15min PRN), nerve block if applicable. Reassess q30min.';

  return {
    painScore: input.face_score,
    face: faces[input.face_score],
    action,
    notes: [
      'Wong-Baker FACES: validated for children ≥3 years and adults with cognitive/communication barriers.',
      'Numeric Rating Scale (NRS 0-10) preferred in cognitively intact adults.',
      'Pain is the 5th vital sign; reassess with vitals and after each intervention.',
      'Avoid meperidine and codeine in elderly, renal failure, pregnancy, lactation.'
    ],
    citations: ['Wong-Baker FACES (Wong 1988)', 'WHO Analgesic Ladder 1986 (revised 2020)']
  };
}

module.exports = { phq9Score, gad7Score, wongBakerFaces, PHQ9_SEVERITY, GAD7_SEVERITY };
