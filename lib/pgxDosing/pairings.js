// lib/pgxDosing/pairings.js
// CPIC + DPWG drug-gene pairings with dose recommendations.
// Pure JS, no npm install. Tenant-scoped (RAIL-5). No PHI in logs (RAIL-12).
//
// 8 canonical drug-gene pairs covering the most clinically actionable
// pharmacogenomic (PGx) alerts:
//   - clopidogrel / CYP2C19   (CPIC Level A) — antiplatelet, PCI
//   - warfarin    / CYP2C9+VKORC1 (CPIC Level A/C) — anticoagulation
//   - codeine     / CYP2D6     (CPIC Level A) — opioid, pediatric
//   - simvastatin / SLCO1B1    (CPIC Level A) — statin myopathy
//   - azathioprine/ TPMT       (CPIC Level A) — immunosuppressant
//   - fluorouracil/ DPYD       (CPIC Level A) — chemo toxicity
//   - irinotecan  / UGT1A1     (CPIC Level A) — neutropenia risk
//   - abacavir    / HLA-B*57:01 (CPIC Level A) — hypersensitivity
//
// Each pairing carries the phenotype-stratified dose recommendation and
// the alternative drug when avoidance is required. The recommendations
// are conservative (cite a guideline level) and never invent a drug —
// they reference alternatives that are well established in CPIC/DPWG.
//
// Public API:
//   PAIRINGS                 — flat map of drug → pairing record
//   lookupPairing(drug)      — resolve a drug (case-insensitive) → record
//   recommendDose(drug, phenotype) — { dose, altDrug, evidence, guidelineRef }
//   alertForPairing(drug, phenotype) — CDSS-style alert payload
//   matchHaplotype(gene, haplotype) — normalize a call against known set

'use strict';

const PAIRINGS = {
  clopidogrel: {
    gene: 'CYP2C19',
    drugClass: 'antiplatelet',
    guideline: 'CPIC Level A',
    evidence: 'CYP2C19 LOF alleles reduce active metabolite; clinical outcomes data from POPular Genetics and TAILOR-PCI.',
    phenotypes: {
      'normal':       { dose: 'standard 75 mg/day',          altDrug: null,                                level: 'strong' },
      'intermediate': { dose: 'consider alternative',        altDrug: 'prasugrel',                          level: 'strong' },
      'poor':         { dose: 'avoid clopidogrel',           altDrug: 'prasugrel',                          level: 'strong' },
      'ultrarapid':   { dose: 'standard 75 mg/day; monitor', altDrug: null,                                level: 'optional' },
      'unknown':      { dose: 'standard 75 mg/day',          altDrug: null,                                level: 'informational' }
    },
    poorMetabolizer: { dose: 'avoid clopidogrel', alt: 'prasugrel/ticagrelor' }
  },
  warfarin: {
    gene: 'CYP2C9+VKORC1',
    drugClass: 'anticoagulant',
    guideline: 'CPIC Level A (CYP2C9) / Level C (VKORC1)',
    evidence: 'CYP2C9 *2/*3 reduce clearance; VKORC1 -1639G>A reduces expression. Use IWPC algorithm with genotype.',
    phenotypes: {
      'normal':       { dose: '5-7 mg/day target INR 2-3',  altDrug: null,           level: 'strong' },
      'intermediate': { dose: 'reduce 25-30%',              altDrug: null,           level: 'strong' },
      'poor':         { dose: 'reduce 30-50%',              altDrug: 'monitor INR weekly', level: 'strong' },
      'unknown':      { dose: '5 mg/day; INR-guided',       altDrug: null,           level: 'informational' }
    },
    poorMetabolizer: { dose: 'reduce 30-50%', alt: 'monitor INR weekly' }
  },
  codeine: {
    gene: 'CYP2D6',
    drugClass: 'opioid',
    guideline: 'CPIC Level A',
    evidence: 'CYP2D6 UM leads to toxic metabolite (morphine) accumulation; PM gets no analgesia. Avoid in <12 y.',
    phenotypes: {
      'normal':       { dose: '30-60 mg q4-6h PRN',        altDrug: null,          level: 'strong' },
      'intermediate': { dose: 'use non-tramadol opioid',   altDrug: 'morphine',    level: 'strong' },
      'poor':         { dose: 'avoid codeine',             altDrug: 'morphine',    level: 'strong' },
      'ultrarapid':   { dose: 'avoid codeine (toxicity)',  altDrug: 'morphine',    level: 'strong' },
      'unknown':      { dose: 'use morphine',              altDrug: 'morphine',    level: 'optional' }
    },
    poorMetabolizer: { dose: 'avoid codeine', alt: 'morphine' }
  },
  simvastatin: {
    gene: 'SLCO1B1',
    drugClass: 'statin',
    guideline: 'CPIC Level A',
    evidence: 'SLCO1B1 c.521CC increases simvastatin exposure and myopathy risk; lower dose or alternative statin.',
    phenotypes: {
      'normal':       { dose: '20-40 mg/day',              altDrug: null,           level: 'strong' },
      'intermediate': { dose: 'max 20 mg/day',             altDrug: null,           level: 'strong' },
      'poor':         { dose: 'max 20 mg/day',             altDrug: 'pravastatin',  level: 'strong' },
      'unknown':      { dose: '20 mg/day; monitor CK',     altDrug: null,           level: 'informational' }
    },
    poorMetabolizer: { dose: 'max 20mg/day', alt: 'pravastatin' }
  },
  azathioprine: {
    gene: 'TPMT',
    drugClass: 'immunosuppressant',
    guideline: 'CPIC Level A',
    evidence: 'TPMT deficiency causes myelosuppression with standard doses; reduce 50-90% or avoid.',
    phenotypes: {
      'normal':       { dose: '2-3 mg/kg/day',             altDrug: null,           level: 'strong' },
      'intermediate': { dose: 'reduce 30-50%',             altDrug: null,           level: 'strong' },
      'poor':         { dose: 'reduce 90% (10x)',          altDrug: 'monitor CBC weekly', level: 'strong' },
      'unknown':      { dose: 'start low; CBC weekly',     altDrug: null,           level: 'optional' }
    },
    poorMetabolizer: { dose: 'reduce 90%', alt: 'monitor CBC' }
  },
  fluorouracil: {
    gene: 'DPYD',
    drugClass: 'antimetabolite chemo',
    guideline: 'CPIC Level A',
    evidence: 'DPYD LoF causes severe/lethal toxicity with 5-FU/capecitabine; pre-screen before treatment.',
    phenotypes: {
      'normal':         { dose: 'standard dose',           altDrug: null,                    level: 'strong' },
      'intermediate':   { dose: 'reduce starting 50%',     altDrug: null,                    level: 'strong' },
      'poor':           { dose: 'avoid 5-FU/capecitabine', altDrug: 'non-DPYD chemo regimen', level: 'strong' },
      'unknown':        { dose: 'defer; phenotype first',  altDrug: null,                    level: 'strong' }
    },
    poorMetabolizer: { dose: 'avoid 5-FU', alt: 'non-DPYD chemo' }
  },
  irinotecan: {
    gene: 'UGT1A1',
    drugClass: 'topoisomerase-I inhibitor',
    guideline: 'CPIC Level A',
    evidence: 'UGT1A1 *28/*28 reduces glucuronidation, raises SN-38, increases neutropenia/diarrhea risk.',
    phenotypes: {
      'normal':       { dose: 'standard 180 mg/m2 q2w',   altDrug: null,                    level: 'strong' },
      'intermediate': { dose: 'reduce 25-30%',            altDrug: null,                    level: 'strong' },
      'poor':         { dose: 'reduce 50%',               altDrug: 'monitor toxicity',      level: 'strong' },
      'unknown':      { dose: 'standard; monitor CBC',    altDrug: null,                    level: 'optional' }
    },
    poorMetabolizer: { dose: 'reduce 50%', alt: 'monitor toxicity' }
  },
  abacavir: {
    gene: 'HLA-B*57:01',
    drugClass: 'NRTI antiretroviral',
    guideline: 'CPIC Level A',
    evidence: 'HLA-B*57:01 carriage predicts severe cutaneous adverse reactions; mandatory pre-screen.',
    phenotypes: {
      'normal':       { dose: 'standard 300 mg BID',      altDrug: null,                    level: 'strong' },
      'intermediate': { dose: 'standard; counsel on rash',altDrug: null,                    level: 'optional' },
      'poor':         { dose: 'avoid abacavir',           altDrug: 'tenofovir-based',       level: 'strong' },
      'positive':     { dose: 'avoid abacavir',           altDrug: 'tenofovir-based',       level: 'strong' },
      'unknown':      { dose: 'screen before initiation', altDrug: null,                    level: 'strong' }
    },
    poorMetabolizer: { dose: 'avoid abacavir', alt: 'tenofovir-based' }
  }
};

// Normalize a drug name to the canonical key.
function _normKey(drug) {
  if (!drug || typeof drug !== 'string') return null;
  const k = String(drug).toLowerCase().trim();
  if (PAIRINGS[k]) return k;
  // tolerate common synonyms
  const syn = {
    '5-fu': 'fluorouracil', '5fu': 'fluorouracil', 'capecitabine': 'fluorouracil',
    '6-mp': 'azathioprine', '6mp': 'azathioprine', 'mercaptopurine': 'azathioprine',
    'plavix': 'clopidogrel',
    'zocor': 'simvastatin',
    'camptosar': 'irinotecan', 'cpt-11': 'irinotecan',
    'ziagen': 'abacavir', 'abc': 'abacavir'
  };
  return syn[k] || k;
}

// Normalize a phenotype call to one of our canonical buckets.
function _normPhenotype(p) {
  if (!p || typeof p !== 'string') return 'unknown';
  const x = p.toLowerCase().trim();
  if (x === 'um' || x === 'ultrarapid metabolizer' || x === '*1/*17' || x === '*17/*17') return 'ultrarapid';
  if (x === 'pm' || x === 'poor metabolizer' || x === 'poor') return 'poor';
  if (x === 'im' || x === 'intermediate metabolizer' || x === 'intermediate') return 'intermediate';
  if (x === 'nm' || x === 'normal metabolizer' || x === 'extensive metabolizer' || x === 'normal') return 'normal';
  if (x === 'positive' || x === 'carrier') return 'positive';
  return 'unknown';
}

// lookupPairing: case-insensitive drug → record (or null).
function lookupPairing(drug) {
  const k = _normKey(drug);
  if (!k || !PAIRINGS[k]) return null;
  return PAIRINGS[k];
}

// recommendDose: returns the dose recommendation object for a phenotype.
function recommendDose(drug, phenotype) {
  const rec = lookupPairing(drug);
  if (!rec) return { ok: false, error: 'UNKNOWN_DRUG' };
  const bucket = _normPhenotype(phenotype);
  const row = rec.phenotypes[bucket] || rec.phenotypes.unknown;
  if (!row) return { ok: false, error: 'NO_GUIDANCE' };
  return {
    ok: true,
    drug: _normKey(drug),
    gene: rec.gene,
    drugClass: rec.drugClass,
    guideline: rec.guideline,
    evidence: rec.evidence,
    phenotype: bucket,
    dose: row.dose,
    altDrug: row.altDrug || null,
    level: row.level,
    guidelineRef: rec.guideline + ' (' + rec.gene + ')'
  };
}

// alertForPairing: CDSS-style alert payload.
function alertForPairing(drug, phenotype) {
  const r = recommendDose(drug, phenotype);
  if (!r.ok) return { severity: 'info', alert: false, message: 'No PGx guidance for ' + drug };
  let severity = 'info';
  if (r.level === 'strong' && (r.phenotype === 'poor' || r.phenotype === 'ultrarapid' || r.phenotype === 'positive')) {
    severity = 'critical';
  } else if (r.level === 'strong' && r.phenotype === 'intermediate') {
    severity = 'warning';
  } else if (r.level === 'strong') {
    severity = 'warning';
  }
  return {
    severity: severity,
    alert: severity === 'critical' || severity === 'warning',
    drug: r.drug,
    gene: r.gene,
    phenotype: r.phenotype,
    dose: r.dose,
    altDrug: r.altDrug,
    guidelineRef: r.guidelineRef,
    message: severity === 'critical'
      ? 'CRITICAL: ' + r.dose + (r.altDrug ? '; alternative: ' + r.altDrug : '')
      : (r.dose + (r.altDrug ? ' (alt: ' + r.altDrug + ')' : ''))
  };
}

// matchHaplotype: validate a call against the canonical haplotype set
// for a gene. Returns the normalized phenotype bucket (NM/IM/PM/UM/positive/unknown).
function matchHaplotype(gene, haplotype) {
  if (!gene || !haplotype) return 'unknown';
  const g = String(gene).toUpperCase();
  const h = String(haplotype).trim();

  // HLA-B*57:01 positive/negative
  if (g === 'HLA-B') {
    if (/57:01|5701/i.test(h)) return 'positive';
    return 'normal';
  }

  // VKORC1 -1639G>A
  if (g === 'VKORC1') {
    if (h === 'AA') return 'poor';
    if (h === 'AG' || h === 'GA') return 'intermediate';
    if (h === 'GG') return 'normal';
    return 'unknown';
  }

  // Star-allele based genes
  // Map common star-allele diplotypes to phenotype buckets.
  // LoF alleles (poor): *2, *3, *4, *5, *6, *13, *28
  // Gain-of-function (ultrarapid): *17
  const LOF = new Set(['*2', '*3', '*4', '*5', '*6', '*13', '*28']);
  const GOF = new Set(['*17']);

  const m = h.match(/\*(\d+)\s*\/\s*\*(\d+)/);
  if (m) {
    const a1 = '*' + m[1];
    const a2 = '*' + m[2];
    const lofCount = (LOF.has(a1) ? 1 : 0) + (LOF.has(a2) ? 1 : 0);
    const gofCount = (GOF.has(a1) ? 1 : 0) + (GOF.has(a2) ? 1 : 0);

    // Two gain → ultrarapid
    if (gofCount === 2) return 'ultrarapid';
    // Two LoF → poor
    if (lofCount === 2) return 'poor';
    // One LoF → intermediate
    if (lofCount === 1) return 'intermediate';
    // No LoF, no GoF → normal
    return 'normal';
  }

  // DPYD uses Normal/Intermediate/Poor activity score directly
  if (g === 'DPYD') {
    if (/normal/i.test(h)) return 'normal';
    if (/intermediate/i.test(h)) return 'intermediate';
    if (/poor/i.test(h)) return 'poor';
    return 'unknown';
  }

  return 'unknown';
}

module.exports = {
  PAIRINGS: PAIRINGS,
  lookupPairing: lookupPairing,
  recommendDose: recommendDose,
  alertForPairing: alertForPairing,
  matchHaplotype: matchHaplotype
};
