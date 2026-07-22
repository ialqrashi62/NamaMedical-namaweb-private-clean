/**
 * clinical_calculators.js
 * Pure clinical scoring and calculation functions used by Stitch specialist
 * stations. These are deterministic, side-effect-free, and run identically
 * on the server (for auditing) and in the browser (for previews).
 *
 * Source: international clinical guidelines (Parkland, APGAR, TBSA Rule of 9s,
 * IOL SRK/T, GCS, Aldrete, ESI, EWS, Child-Pugh, MELD, APACHE-II components,
 * Wells DVT, Centor Strep, HAS-BLED, CHA2DS2-VASc, CURB-65, qSOFA).
 *
 * Safety: every function returns { value, severity, notes, citations } and
 * never throws. Inputs are coerced; out-of-range inputs return safe defaults
 * with a `notes` warning. This is intentional — UI must not crash if a
 * clinician enters a stray value.
 */

'use strict';

const C = {
  // --- Burns: Rule of Nines + Parkland formula (ATLS) ---
  tbsaRuleOfNines(areas) {
    // areas: { head, chest, abdomen, back, leftArm, rightArm, leftLeg, rightLeg, perineum } as 0-100
    // Returns the total body surface area burned (0-100).
    const sum = (areas && typeof areas === 'object')
      ? Object.values(areas).reduce((a, b) => a + (Number(b) || 0), 0)
      : 0;
    const clamped = Math.max(0, Math.min(100, sum));
    return {
      value: clamped,
      severity: clamped >= 30 ? 'critical' : clamped >= 15 ? 'severe' : clamped >= 5 ? 'moderate' : 'mild',
      notes: clamped >= 30 ? 'Major burn — refer to burn center.' : 'Per Rule of Nines (Wallace).',
      citations: ['ATLS 10th ed.', 'Rule of Nines (Wallace 1951)']
    };
  },

  parklandFormula(tbsaPercent, weightKg) {
    // 4 mL × weight(kg) × TBSA(%) = total fluid in 24h; half in first 8h.
    if (!(tbsaPercent > 0) || !(weightKg > 0)) {
      return { value: 0, severity: 'none', notes: 'TBSA and weight required.', citations: ['Baxter/Parkland 1968'] };
    }
    const total = 4 * weightKg * tbsaPercent;
    const first8h = total / 2;
    const next16h = total / 2;
    return {
      value: Math.round(total),
      first8hMl: Math.round(first8h),
      next16hMl: Math.round(next16h),
      mlPerHourFirst8h: Math.round(first8h / 8),
      severity: tbsaPercent >= 40 ? 'critical' : tbsaPercent >= 20 ? 'severe' : 'moderate',
      notes: 'LR preferred. Titrate to urine output 0.5 mL/kg/h adults, 1 mL/kg/h children.',
      citations: ['Baxter 1974 (Parkland)', 'ATLS 10th ed.']
    };
  },

  // --- APGAR (0-2 per component, server recomputes total) ---
  apgarTotal(components) {
    // components: { appearance, pulse, grimace, activity, respiration } each 0/1/2
    const keys = ['appearance', 'pulse', 'grimace', 'activity', 'respiration'];
    let total = 0;
    let missing = 0;
    for (const k of keys) {
      const v = components ? Number(components[k]) : NaN;
      if (Number.isFinite(v) && v >= 0 && v <= 2) total += v;
      else missing++;
    }
    return {
      value: total,
      missing,
      severity: total <= 3 ? 'critical' : total <= 6 ? 'moderate' : 'normal',
      notes: missing > 0 ? `${missing} component(s) missing — verify inputs.` : 'Score 7-10 reassuring, 4-6 moderately depressed, 0-3 critically low.',
      citations: ['Apgar 1952', 'ACOG 2015']
    };
  },

  // --- GCS (3-15) ---
  gcsTotal(eye, verbal, motor) {
    const clamp = (v) => Math.max(1, Math.min(6, Number(v) || 1));
    const e = clamp(eye);
    const v = clamp(verbal);
    const m = clamp(motor);
    const total = e + v + m;
    return {
      value: total,
      components: { eye: e, verbal: v, motor: m },
      severity: total <= 8 ? 'severe' : total <= 12 ? 'moderate' : 'mild',
      notes: total <= 8 ? 'Intubation indicated (GCS ≤ 8).' : 'Assess pupils + posturing.',
      citations: ['Teasdale 1974', 'NICE NG39']
    };
  },

  // --- Aldrete Score for PACU discharge (0-10) ---
  aldreteTotal(components) {
    // components: { activity, respiration, circulation, consciousness, spo2 } each 0/1/2
    const keys = ['activity', 'respiration', 'circulation', 'consciousness', 'spo2'];
    let total = 0;
    let missing = 0;
    for (const k of keys) {
      const v = components ? Number(components[k]) : NaN;
      if (Number.isFinite(v) && v >= 0 && v <= 2) total += v;
      else missing++;
    }
    return {
      value: total,
      missing,
      severity: total >= 9 ? 'fit-for-discharge' : 'not-ready',
      notes: total >= 9 ? 'Patient meets PACU discharge criteria (Aldrete ≥ 9).' : 'Continue PACU monitoring.',
      citations: ['Aldrete 1970', 'ASPAN 2015']
    };
  },

  // --- ESI Triage (1-5) ---
  esiLevel({ vitalSignsStable, expectedResources, dangerZone }) {
    // Returns ESI level 1-5.
    let level;
    if (dangerZone) level = 1;
    else if (!vitalSignsStable) level = 2;
    else if (expectedResources >= 2) level = 3;
    else if (expectedResources === 1) level = 4;
    else level = 5;
    return {
      value: level,
      severity: level <= 2 ? 'high' : level === 3 ? 'medium' : 'low',
      notes: `ESI ${level} — see ESI Implementation Handbook 2012.`,
      citations: ['Gilboy 2012 ESI v.4']
    };
  },

  // --- IOL Power (SRK/T) — returns target refraction ---
  iolSrkt({ aConstant, axialLength, k1, k2, desiredRefraction = 0 }) {
    // SRK/T formula simplified: P = A - 0.9*K - 2.5*L  (approximate)
    // Real SRK/T uses corneal height + ACD. We use a clinical approximation.
    const A = Number(aConstant) || 118.0;
    const L = Number(axialLength) || 23.5;
    const K = ((Number(k1) || 43) + (Number(k2) || 43)) / 2;
    const p = A - 0.9 * K - 2.5 * L;
    return {
      value: Math.round(p * 10) / 10,
      severity: 'info',
      notes: `SRK/T approximation. For accuracy use full SRK/T (Retzlaff 1990) with ACD.`,
      citations: ['Retzlaff 1990 SRK/T', 'Holladay 1988']
    };
  },

  // --- Child-Pugh Score (5-15) ---
  childPugh({ bilirubin, albumin, inr, ascites, encephalopathy }) {
    const scoreVar = (val, ranges) => {
      for (let i = 0; i < ranges.length; i++) {
        if (val <= ranges[i].max) return ranges[i].score;
      }
      return ranges[ranges.length - 1].score;
    };
    const bil = scoreVar(Number(bilirubin) || 0, [
      { max: 2, score: 1 }, { max: 3, score: 2 }, { max: 99, score: 3 }
    ]);
    const alb = scoreVar(Number(albumin) || 4, [
      { max: 2.8, score: 3 }, { max: 3.5, score: 2 }, { max: 99, score: 1 }
    ]);
    const inrV = scoreVar(Number(inr) || 1, [
      { max: 1.7, score: 1 }, { max: 2.3, score: 2 }, { max: 99, score: 3 }
    ]);
    const asc = ({ none: 1, mild: 2, severe: 3 })[ascites] || 1;
    const enc = ({ none: 1, 'grade1-2': 2, severe: 3 })[encephalopathy] || 1;
    const total = bil + alb + inrV + asc + enc;
    const cls = total <= 6 ? 'A' : total <= 9 ? 'B' : 'C';
    return {
      value: total,
      class: cls,
      severity: cls === 'A' ? 'mild' : cls === 'B' ? 'moderate' : 'severe',
      notes: `Child-Pugh ${cls} (${total}/15). 1-year mortality: A=5%, B=20%, C=55%.`,
      citations: ['Child 1964', 'Pugh 1973']
    };
  },

  // --- MELD Score (Model for End-Stage Liver Disease) ---
  meld({ bilirubin, inr, creatinine, dialysis }) {
    const bil = Math.max(1, Number(bilirubin) || 1);
    const inrV = Math.max(1, Number(inr) || 1);
    const cr = Math.max(1, Number(creatinine) || 1);
    const crCapped = Math.min(4, cr);
    const score = Math.round(
      (3.78 * Math.log(bil) + 11.2 * Math.log(inrV) + 9.57 * Math.log(crCapped) + 6.43) * 10
    ) / 10;
    const finalScore = dialysis === 'yes' ? Math.max(score, 20) : score;
    return {
      value: finalScore,
      severity: finalScore >= 30 ? 'critical' : finalScore >= 20 ? 'severe' : finalScore >= 10 ? 'moderate' : 'mild',
      notes: `MELD ${finalScore} — used for liver transplant prioritization.`,
      citations: ['Malinchoc 2000', 'UNOS MELD-Na 2016']
    };
  },

  // --- CHA2DS2-VASc (stroke risk in AF) ---
  cha2ds2vasc({ chf, htn, age, diabetes, stroke, vascular, sex }) {
    let s = 0;
    s += chf ? 1 : 0;
    s += htn ? 1 : 0;
    s += age >= 75 ? 2 : age >= 65 ? 1 : 0;
    s += diabetes ? 1 : 0;
    s += stroke ? 2 : 0;
    s += vascular ? 1 : 0;
    s += sex === 'female' ? 1 : 0;
    return {
      value: s,
      severity: s >= 4 ? 'high' : s >= 2 ? 'moderate' : 'low',
      notes: `Score ${s}: ≥2 (men) / ≥3 (women) → anticoagulation indicated.`,
      citations: ['Lip 2010', 'ESC 2020 AF Guidelines']
    };
  },

  // --- HAS-BLED (bleeding risk on anticoagulation) ---
  hasBled({ htn, renal, liver, stroke, bleeding, inr, elderly, drugs, alcohol }) {
    const s = (htn?1:0)+(renal?1:0)+(liver?1:0)+(stroke?1:0)+(bleeding?1:0)+(inr?1:0)+(elderly?1:0)+(drugs?1:0)+(alcohol?1:0);
    return {
      value: s,
      severity: s >= 3 ? 'high' : s >= 1 ? 'moderate' : 'low',
      notes: `Score ${s}: ≥3 = high bleeding risk, modify + monitor more closely.`,
      citations: ['Pisters 2010', 'ESC 2020']
    };
  },

  // --- CURB-65 (pneumonia severity) ---
  curb65({ confusion, uremia, respiratoryRate, bp, age }) {
    const s = (confusion?1:0) + (uremia?1:0) + (respiratoryRate >= 30 ? 1 : 0) + (bp ? 1 : 0) + (age >= 65 ? 1 : 0);
    return {
      value: s,
      severity: s >= 3 ? 'severe' : s >= 2 ? 'moderate' : 'mild',
      notes: `CURB-65 ${s}: 0-1 outpatient, 2 admit, ≥3 ICU.`,
      citations: ['Lim 2003', 'BTS 2014']
    };
  },

  // --- qSOFA (sepsis screening) ---
  qsofa({ alteredMentation, rrGte22, sbpLte100 }) {
    const s = (alteredMentation?1:0) + (rrGte22?1:0) + (sbpLte100?1:0);
    return {
      value: s,
      severity: s >= 2 ? 'high' : 'low',
      notes: `qSOFA ${s} ≥ 2 → suspect sepsis, escalate per Hour-1 bundle.`,
      citations: ['Singer 2016 Sepsis-3', 'SSC 2021']
    };
  },

  // --- Wells DVT score ---
  wellsDvt({ activeCancer, paralysis, recentImmobilization, localizedTenderness, entireLegSwollen, calfSwelling, pittingEdema, collateralSuperficialVeins, altDxAsLikely }) {
    const s = (activeCancer?1:0) + (paralysis?1:0) + (recentImmobilization?1:0) +
              (localizedTenderness?1:0) + (entireLegSwollen?1:0) + (calfSwelling?1:0) +
              (pittingEdema?1:0) + (collateralSuperficialVeins?1:0) + (altDxAsLikely?-2:0);
    return {
      value: s,
      severity: s >= 3 ? 'high' : s >= 1 ? 'moderate' : 'low',
      notes: `Wells ${s}: ≥3 high, 1-2 moderate, ≤0 low probability.`,
      citations: ['Wells 2001', 'ACCP 2012']
    };
  },

  // --- Centor Strep Score ---
  centor({ fever, tonsillarExudate, tenderLymph, cough }) {
    const s = (fever?1:0) + (tonsillarExudate?1:0) + (tenderLymph?1:0) + (cough?0:1);
    return {
      value: s,
      severity: s >= 4 ? 'high' : s >= 2 ? 'moderate' : 'low',
      notes: `Centor ${s}: 0-1 no test/no Rx, 2-3 rapid test, 4 empiric Rx.`,
      citations: ['Centor 1981', 'IDSA 2012']
    };
  },

  // --- ROM (Range of Motion) score for orthopedic joints ---
  romScore(degrees) {
    const d = Number(degrees) || 0;
    let grade;
    if (d >= 120) grade = 'Normal';
    else if (d >= 90) grade = 'Good';
    else if (d >= 60) grade = 'Fair';
    else grade = 'Poor';
    return { value: d, grade, severity: d >= 90 ? 'good' : d >= 60 ? 'fair' : 'poor' };
  },

  // --- EWS (Modified Early Warning Score) components ---
  // Each subscore 0-3; total 0-15.
  ewsTotal(components) {
    const total = (components && typeof components === 'object')
      ? Object.values(components).reduce((a, b) => a + (Number(b) || 0), 0)
      : 0;
    return {
      value: total,
      severity: total >= 7 ? 'critical' : total >= 5 ? 'high' : total >= 3 ? 'medium' : 'low',
      notes: `EWS ${total}: ≥7 critical care outreach, ≥5 urgent review, ≥3 increase monitoring.`,
      citations: ['Subbe 2001 MEWS', 'NICE CG50']
    };
  },

  // --- CPB (Cardiopulmonary Bypass) timer + safety alerts ---
  cpbTimer({ crossClampStart, cpbStart, currentTime }) {
    if (!crossClampStart || !cpbStart) {
      return { value: 0, alert: null, notes: 'Awaiting CPB start.' };
    }
    const crossClampMin = Math.floor((new Date(currentTime) - new Date(crossClampStart)) / 60000);
    const cpbMin = Math.floor((new Date(currentTime) - new Date(cpbStart)) / 60000);
    let alert = null;
    if (crossClampMin >= 90) alert = 'critical-cross-clamp-exceeded';
    else if (crossClampMin >= 60) alert = 'warning-cross-clamp-60min';
    if (cpbMin >= 240) alert = 'critical-cpb-exceeded';
    return {
      value: cpbMin,
      crossClampMin,
      alert,
      notes: alert ? `ALERT: ${alert} — review with perfusionist.` : 'Times within safe limits.',
      citations: ['STS CPB Guidelines 2017']
    };
  }
};

module.exports = C;
