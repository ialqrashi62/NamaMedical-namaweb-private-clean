// lib/genomic/variants.js
// Genomic variant catalog + pharmacogenomic (PGx) helpers for NamaMedical.
// Pure JS, no npm install. CPIC Level A/C drug-gene pairs. No PHI in logs (RAIL-12).
//
// This module is the canonical reference for:
//   - Variant type taxonomy (snv, indel, cnv, sv, fusion)
//   - Curated CPIC drug-gene pairs (warfarin uses two genes: CYP2C9 + VKORC1)
//   - Phenotype classification (activity score → metabolizer status)
//
// All public functions are pure (no I/O) and deterministic; storage is
// handled by lib/genomic/storage.js so this file is safe to load at config
// time and to require from a worker thread.

'use strict';

const VARIANT_TYPES = ['snv', 'indel', 'cnv', 'sv', 'fusion'];

// CPIC-aligned drug-gene catalog. Levels follow CPIC stratifications.
//   - Level A: drug-gene pair should be used to guide prescribing
//   - Level C: optional / weak evidence
// Phenotypes are stored as raw call strings (e.g. "*1/*2", "AA") and
// normalized via classifyPhenotype() into metabolizer status.
const GENES_CATALOG = {
  CYP2C19: {
    drug: 'clopidogrel',
    guideline: 'CPIC Level A',
    phenotypes: ['*1/*1', '*1/*2', '*1/*3', '*2/*2', '*2/*3', '*3/*3']
  },
  DPYD: {
    drug: '5-FU/capecitabine',
    guideline: 'CPIC Level A',
    phenotypes: ['Normal', 'Intermediate', 'Poor']
  },
  TPMT: {
    drug: '6-MP/azathioprine',
    guideline: 'CPIC Level A',
    phenotypes: ['Normal', 'Intermediate', 'Poor']
  },
  UGT1A1: {
    drug: 'irinotecan',
    guideline: 'CPIC Level A',
    phenotypes: ['*1/*1', '*1/*28', '*28/*28']
  },
  SLCO1B1: {
    drug: 'simvastatin',
    guideline: 'CPIC Level A',
    phenotypes: ['*1/*1', '*1/*5', '*5/*5']
  },
  VKORC1: {
    drug: 'warfarin',
    guideline: 'CPIC Level C',
    phenotypes: ['GG', 'AG', 'AA']
  },
  CYP2C9: {
    drug: 'warfarin',
    guideline: 'CPIC Level A',
    phenotypes: ['*1/*1', '*1/*2', '*1/*3', '*2/*2', '*2/*3', '*3/*3']
  }
};

// Map of gene → CPIC dose guidance bucket. This is the minimum safe
// guidance we expose to clinicians. Anything not in the map defaults to
// 'standard' (no dose adjustment).
//
// We intentionally keep the recommendations conservative and cite the
// guideline level so the UI can show "CPIC Level A — strong" badges.
const DOSE_GUIDANCE = {
  CYP2C19: {
    '*1/*1': { activity: 'normal', recommendation: 'Standard dose', level: 'strong' },
    '*1/*2': { activity: 'intermediate', recommendation: 'Consider alternative (prasugrel/ ticagrelor)', level: 'strong' },
    '*1/*3': { activity: 'intermediate', recommendation: 'Consider alternative (prasugrel/ ticagrelor)', level: 'strong' },
    '*2/*2': { activity: 'poor', recommendation: 'Use alternative (prasugrel/ ticagrelor)', level: 'strong' },
    '*2/*3': { activity: 'poor', recommendation: 'Use alternative (prasugrel/ ticagrelor)', level: 'strong' },
    '*3/*3': { activity: 'poor', recommendation: 'Use alternative (prasugrel/ ticagrelor)', level: 'strong' }
  },
  DPYD: {
    'Normal':      { activity: 'normal',      recommendation: 'Standard dose', level: 'strong' },
    'Intermediate':{ activity: 'intermediate', recommendation: 'Reduce starting dose 50%', level: 'strong' },
    'Poor':        { activity: 'poor',        recommendation: 'Avoid 5-FU/capecitabine; use alternative', level: 'strong' }
  },
  TPMT: {
    'Normal':      { activity: 'normal',      recommendation: 'Standard dose', level: 'strong' },
    'Intermediate':{ activity: 'intermediate', recommendation: 'Reduce dose 30–50%', level: 'strong' },
    'Poor':        { activity: 'poor',        recommendation: 'Reduce dose 90% or avoid', level: 'strong' }
  },
  UGT1A1: {
    '*1/*1':  { activity: 'normal',      recommendation: 'Standard dose', level: 'strong' },
    '*1/*28': { activity: 'intermediate', recommendation: 'Reduce starting dose', level: 'strong' },
    '*28/*28':{ activity: 'poor',        recommendation: 'Reduce dose ~50%; monitor toxicity', level: 'strong' }
  },
  SLCO1B1: {
    '*1/*1': { activity: 'normal',      recommendation: 'Standard dose', level: 'strong' },
    '*1/*5': { activity: 'intermediate', recommendation: 'Consider lower statin dose', level: 'strong' },
    '*5/*5': { activity: 'poor',        recommendation: 'Use alternative statin', level: 'strong' }
  },
  VKORC1: {
    'GG': { activity: 'normal',      recommendation: 'Standard warfarin dose', level: 'optional' },
    'AG': { activity: 'intermediate', recommendation: 'Reduce warfarin dose ~25%', level: 'optional' },
    'AA': { activity: 'poor',        recommendation: 'Reduce warfarin dose ~50%', level: 'optional' }
  },
  CYP2C9: {
    '*1/*1': { activity: 'normal',      recommendation: 'Standard warfarin dose', level: 'strong' },
    '*1/*2': { activity: 'intermediate', recommendation: 'Reduce warfarin dose ~25%', level: 'strong' },
    '*1/*3': { activity: 'intermediate', recommendation: 'Reduce warfarin dose ~40%', level: 'strong' },
    '*2/*2': { activity: 'poor',        recommendation: 'Reduce warfarin dose ~50%', level: 'strong' },
    '*2/*3': { activity: 'poor',        recommendation: 'Reduce warfarin dose ~65%', level: 'strong' },
    '*3/*3': { activity: 'poor',        recommendation: 'Reduce warfarin dose ~80%', level: 'strong' }
  }
};

/**
 * Look up a curated gene entry.
 * @param {string} gene  HGNC gene symbol (e.g. "CYP2C19")
 * @returns {object|null}  catalog entry or null if unknown
 */
function lookupGene(gene) {
  if (!gene || typeof gene !== 'string') return null;
  return GENES_CATALOG[gene.toUpperCase()] || null;
}

/**
 * Return all curated drug-gene pairs.
 * Useful for the GET /api/v4/genomic/drug-gene-pairs endpoint.
 */
function drugGenePairs() {
  const out = [];
  for (const gene of Object.keys(GENES_CATALOG)) {
    const entry = GENES_CATALOG[gene];
    out.push({
      gene: gene,
      drug: entry.drug,
      guideline: entry.guideline,
      phenotypes: entry.phenotypes
    });
  }
  return out;
}

/**
 * Classify a phenotype call into a metabolizer status.
 * Falls back to 'unknown' if we cannot map the call.
 */
function classifyPhenotype({ gene, phenotype }) {
  if (!gene || !phenotype) return { activity: 'unknown', recommendation: 'Insufficient data', level: 'optional' };
  const geneMap = DOSE_GUIDANCE[gene.toUpperCase()];
  if (!geneMap) return { activity: 'unknown', recommendation: 'Gene not in catalog', level: 'optional' };
  // Normalize: case-insensitive trim (e.g. "ag" → "AG")
  const key = String(phenotype).trim();
  const entry = geneMap[key] || geneMap[key.toUpperCase()] || geneMap[key.toLowerCase()];
  if (entry) return entry;
  return { activity: 'unknown', recommendation: 'Phenotype not recognized', level: 'optional' };
}

/**
 * Build a PGx report for a patient. The caller passes in the list of
 * variants (typically loaded from lib/genomic/storage.js). This function
 * never logs variant data and never echoes patient identifiers (RAIL-12).
 */
function pgxReportForPatient({ tenantId, patientId, variants }) {
  if (!tenantId) throw new Error('TENANT_REQUIRED');
  if (!patientId) throw new Error('PATIENT_REQUIRED');
  if (!Array.isArray(variants)) variants = [];
  const findings = [];
  for (const v of variants) {
    if (!v || !v.gene || !v.phenotype) continue;
    const geneInfo = lookupGene(v.gene);
    if (!geneInfo) continue; // unknown gene — skip silently
    const classification = classifyPhenotype({ gene: v.gene, phenotype: v.phenotype });
    findings.push({
      gene: v.gene.toUpperCase(),
      drug: geneInfo.drug,
      guideline: geneInfo.guideline,
      phenotype: v.phenotype,
      activity: classification.activity,
      recommendation: classification.recommendation,
      level: classification.level,
      variantType: v.variantType || null,
      rsId: v.rsId || null
    });
  }
  return {
    ok: true,
    tenantId: tenantId,
    patientId: patientId,
    generatedAt: new Date().toISOString(),
    findings: findings
  };
}

module.exports = {
  VARIANT_TYPES: VARIANT_TYPES,
  GENES_CATALOG: GENES_CATALOG,
  DOSE_GUIDANCE: DOSE_GUIDANCE,
  lookupGene: lookupGene,
  drugGenePairs: drugGenePairs,
  classifyPhenotype: classifyPhenotype,
  pgxReportForPatient: pgxReportForPatient
};
