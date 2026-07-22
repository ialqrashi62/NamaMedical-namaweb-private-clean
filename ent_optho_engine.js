// ENT & Ophthalmology Engine: PTA hearing loss + Snellen VA + IOP glaucoma risk
// Pure deterministic, no I/O, no side effects

'use strict';

const PTA_GRADES = {
  normal: { max: 20, label: 'Normal' },
  mild: { min: 20, max: 40, label: 'Mild hearing loss' },
  moderate: { min: 40, max: 70, label: 'Moderate hearing loss' },
  severe: { min: 70, max: 90, label: 'Severe hearing loss' },
  profound: { min: 90, label: 'Profound hearing loss (deaf)' }
};

const VA_GRADES = {
  normal: { logmar_min: -0.3, logmar_max: 0.3, label: 'Normal vision' },
  mild: { logmar_min: 0.3, logmar_max: 0.5, label: 'Mild visual impairment' },
  moderate: { logmar_min: 0.5, logmar_max: 1.0, label: 'Moderate VI (low vision)' },
  severe: { logmar_min: 1.0, logmar_max: 1.3, label: 'Severe VI' },
  blind: { logmar_min: 1.3, label: 'Blindness (logMAR >1.3 or CF/HM/LP only)' }
};

function pureToneAverage(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (!input.thresholds_500_4000_hz) throw new Error('thresholds_500_4000_hz required (object with 500, 1000, 2000, 4000 dB)');
  const required = ['db_500', 'db_1000', 'db_2000', 'db_4000'];
  for (const k of required) {
    if (input.thresholds_500_4000_hz[k] === undefined) throw new Error(`thresholds_500_4000_hz.${k} required`);
  }

  // 4-frequency PTA per WHO (500, 1000, 2000, 4000 Hz)
  const pta = (input.thresholds_500_4000_hz.db_500 + input.thresholds_500_4000_hz.db_1000 + input.thresholds_500_4000_hz.db_2000 + input.thresholds_500_4000_hz.db_4000) / 4;
  const ptaRounded = Math.round(pta * 10) / 10;

  let grade = 'normal';
  let action = '';
  if (ptaRounded < 20) { grade = 'normal'; action = 'Normal hearing. No intervention needed.'; }
  else if (ptaRounded < 40) { grade = 'mild'; action = 'Mild hearing loss: monitor with annual audiogram. Hearing aid if symptomatic. Communication strategies.'; }
  else if (ptaRounded < 70) { grade = 'moderate'; action = 'Moderate hearing loss: hearing aid recommended. Consider ENT workup (asymmetric, sudden, otologic symptoms).'; }
  else if (ptaRounded < 90) { grade = 'severe'; action = 'Severe hearing loss: strong hearing aid candidacy. ENT/audiology workup. Consider cochlear implant evaluation if profound.'; }
  else { grade = 'profound'; action = 'Profound hearing loss: cochlear implant evaluation if bilateral. Sign language. ENT referral for cause.'; }

  return {
    pta: ptaRounded,
    ear: input.ear || 'binaural',
    grade,
    action,
    notes: [
      'PTA (Pure-Tone Average): average of thresholds at 500, 1000, 2000, 4000 Hz.',
      'WHO hearing loss grades: 0 (normal) = PTA <20 dB, mild 20-40, moderate 40-70, severe 70-90, profound ≥90 dB.',
      'For asymmetric loss (≥15 dB difference between ears), investigate retrocochlear pathology (acoustic neuroma).',
      'Speech Reception Threshold (SRT) and Word Recognition Score (WRS) complement PTA.'
    ],
    citations: ['WHO Hearing Loss Grades 1991', 'AAO-HNS Clinical Practice Guidelines']
  };
}

function visualAcuity(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.snellen_20x === undefined) throw new Error('snellen_20x required (e.g., 20/20 → 20; 20/40 → 40)');
  if (input.snellen_20x <= 0) throw new Error('snellen_20x must be positive');

  // Convert Snellen 20/x to logMAR
  const logmar = Math.log10(input.snellen_20x / 20);
  const logmarRounded = Math.round(logmar * 10) / 10;

  let grade = 'normal';
  let action = '';
  if (logmar < 0.3) { grade = 'normal'; action = 'Normal vision. Continue routine eye exams (q1-2 years for healthy adults).'; }
  else if (logmar < 0.5) { grade = 'mild'; action = 'Mild VI: corrective lenses likely. Refraction. Glaucoma screen.'; }
  else if (logmar < 1.0) { grade = 'moderate'; action = 'Moderate VI (low vision): corrective lenses, low-vision aids (magnifier, large-print, bright lighting).'; }
  else if (logmar < 1.3) { grade = 'severe'; action = 'Severe VI: low-vision rehabilitation. Optometrist/ophthalmologist specialist. Adaptive devices.'; }
  else { grade = 'blind'; action = 'Legal blindness (best-corrected VA <20/200 or logMAR >1.3). Registration. Mobility training. Support services.'; }

  return {
    snellen: `20/${Math.round(input.snellen_20x)}`,
    logmar: logmarRounded,
    grade,
    action,
    notes: [
      'Snellen 20/20 = logMAR 0.0. 20/200 = logMAR 1.0 (legal blindness in US).',
      'LogMAR is preferred for research and statistics; Snellen is more familiar clinically.',
      'Best corrected VA (BCVA) is the standard measurement; pinhole VA can rule out refractive error.',
      'In Saudi Arabia, driving requires BCVA ≥20/40 in better eye, ≥20/70 in worse eye.'
    ],
    citations: ['WHO Visual Impairment Categories 2019', 'AAO Preferred Practice Patterns 2023']
  };
}

function glaucomaRisk(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  const required = ['iop_mmHg', 'cup_disc_ratio', 'central_corneal_thickness_um'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null) throw new Error(`Missing required field: ${k}`);
  }
  if (input.iop_mmHg < 0 || input.iop_mmHg > 80) throw new Error('iop_mmHg must be 0-80');
  if (input.cup_disc_ratio < 0 || input.cup_disc_ratio > 1) throw new Error('cup_disc_ratio must be 0-1');
  if (input.central_corneal_thickness_um < 400 || input.central_corneal_thickness_um > 700) throw new Error('CCT must be 400-700');

  let riskPoints = 0;
  const factors = [];

  // IOP
  if (input.iop_mmHg > 30) { riskPoints += 3; factors.push(`IOP ${input.iop_mmHg} mmHg (very high)`); }
  else if (input.iop_mmHg > 21) { riskPoints += 2; factors.push(`IOP ${input.iop_mmHg} mmHg (above normal)`); }
  else if (input.iop_mmHg > 15) { riskPoints += 1; factors.push(`IOP ${input.iop_mmHg} mmHg (normal-high)`); }

  // C/D ratio
  if (input.cup_disc_ratio > 0.8) { riskPoints += 3; factors.push(`C/D ratio ${input.cup_disc_ratio} (advanced cupping)`); }
  else if (input.cup_disc_ratio > 0.6) { riskPoints += 2; factors.push(`C/D ratio ${input.cup_disc_ratio} (suspicious)`); }
  else if (input.cup_disc_ratio > 0.4) { riskPoints += 1; factors.push(`C/D ratio ${input.cup_disc_ratio} (mild)`); }

  // CCT
  if (input.central_corneal_thickness_um < 500) { riskPoints += 2; factors.push(`CCT ${input.central_corneal_thickness_um} (thin cornea)`); }
  else if (input.central_corneal_thickness_um < 540) { riskPoints += 1; factors.push(`CCT ${input.central_corneal_thickness_um} (thin)`); }

  if (input.family_history) { riskPoints += 2; factors.push('Family history of glaucoma'); }
  if (input.age && input.age > 60) { riskPoints += 1; factors.push('Age >60'); }
  if (input.diabetes) { riskPoints += 1; factors.push('Diabetes'); }
  if (input.african_ancestry) { riskPoints += 1; factors.push('African ancestry'); }
  if (input.vf_defect_present) { riskPoints += 3; factors.push('Visual field defect present'); }

  let severity = 'low';
  let action = '';
  if (riskPoints < 3) { severity = 'low'; action = 'Glaucoma suspect: annual comprehensive exam, OCT, VF. Treat IOP if consistently >21 or risk factors present.'; }
  else if (riskPoints < 6) { severity = 'moderate'; action = 'Glaucoma suspect (high risk): initiate treatment (prostaglandin analog). Follow-up q3-6m, OCT, VF q6-12m.'; }
  else { severity = 'high'; action = 'Glaucoma diagnosis likely: initiate treatment, target IOP <20% below baseline. Consider laser (SLT) or surgery if progressive.'; }

  return {
    riskPoints,
    severity,
    factors,
    action,
    notes: [
      'OHTS/EGPS risk factors: age, IOP, C/D ratio, CCT, VF defect.',
      'Open-angle glaucoma is the most common; angle-closure is acute and surgical.',
      'Target IOP reduction 20-50% depending on stage and risk.',
      'Screening: every 1-2 years after age 40, especially with family history.'
    ],
    citations: ['OHTS Trial 2002', 'EGPS 2002', 'AAO Glaucoma PPP 2020']
  };
}

module.exports = { pureToneAverage, visualAcuity, glaucomaRisk, PTA_GRADES, VA_GRADES };
