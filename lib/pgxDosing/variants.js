// lib/pgxDosing/variants.js
// Haplotype catalog + phenotype normalizers for the most clinically
// actionable PGx genes. Pure JS, no npm install. No PHI in logs (RAIL-12).
//
// This module is intentionally narrow: it focuses on the 7 genes that
// drive the 8 drug-gene pairs in pairings.js. The goal is to provide a
// deterministic, deterministic input layer for matchHaplotype() so that
// caller payloads (raw star-allele strings, rsIDs, or activity scores)
// all normalize into the same NM/IM/PM/UM/positive/unknown buckets.

'use strict';

// Canonical haplotype set per gene. Star-allele *1 = wild-type reference.
//   - CYP2C19: *1, *2, *3 (LoF), *17 (GoF)
//   - CYP2C9:  *1, *2, *3 (LoF)
//   - VKORC1:  -1639G>A (AA = reduced expression → PM-like for warfarin)
//   - DPYD:    *2A (rs3918290), *13 (rs55886062), rs67376798 (c.2846A>T)
//   - TPMT:    *2 (rs1800462), *3A (two SNPs: *3B + *3C), *3C (rs1142345)
//   - UGT1A1:  *28 (rs8175347, TA7 repeat in promoter)
//   - HLA-B:   *57:01 (rs2395029 tag) — positive/negative
const HAPLOTYPES = {
  CYP2C19: ['*1', '*2', '*3', '*17'],
  CYP2C9:  ['*1', '*2', '*3'],
  VKORC1:  ['GG', 'AG', 'AA'],
  DPYD:    ['*1', '*2A', '*13', 'rs67376798'],
  TPMT:    ['*1', '*2', '*3A', '*3B', '*3C'],
  UGT1A1:  ['*1', '*28'],
  'HLA-B': ['*57:01-negative', '*57:01-positive']
};

// Loss-of-function alleles per gene (used by pairings.matchHaplotype).
const LOSS_OF_FUNCTION = {
  CYP2C19: new Set(['*2', '*3']),
  CYP2C9:  new Set(['*2', '*3']),
  DPYD:    new Set(['*2A', '*13', 'rs67376798']),
  TPMT:    new Set(['*2', '*3A', '*3B', '*3C']),
  UGT1A1: new Set(['*28'])
};

// Gain-of-function (CYP2C19 *17 only).
const GAIN_OF_FUNCTION = {
  CYP2C19: new Set(['*17'])
};

// Phenotype bucket for a given gene + diplotype / call.
// Returns one of: 'normal', 'intermediate', 'poor', 'ultrarapid',
//                 'positive', 'negative', 'unknown'.
function classify(gene, call) {
  if (!gene || !call) return 'unknown';
  const g = String(gene).toUpperCase().trim();
  const h = String(call).trim();

  // HLA-B*57:01 — positive/negative
  if (g === 'HLA-B' || g === 'HLA-B*57:01') {
    if (/57:01|5701|positive|carrier/i.test(h)) return 'positive';
    if (/negative|absent|wild/i.test(h)) return 'negative';
    return 'unknown';
  }

  // VKORC1 promoter SNP
  if (g === 'VKORC1') {
    if (h === 'AA') return 'poor';
    if (h === 'AG' || h === 'GA') return 'intermediate';
    if (h === 'GG') return 'normal';
    return 'unknown';
  }

  // DPYD activity score (gene-level call, not diplotype)
  if (g === 'DPYD') {
    if (/normal|nm|^[*]1\/[*]1$/i.test(h)) return 'normal';
    if (/intermediate|im/i.test(h)) return 'intermediate';
    if (/poor|pm/i.test(h)) return 'poor';
    return 'unknown';
  }

  // Star-allele based: look for *N/*M
  const m = h.match(/\*(\d+[A-Za-z]?)\s*\/\s*\*(\d+[A-Za-z]?)/);
  if (m) {
    const a1 = '*' + m[1];
    const a2 = '*' + m[2];
    const lof = LOSS_OF_FUNCTION[g] || new Set();
    const gof = GAIN_OF_FUNCTION[g] || new Set();
    const lofCount = (lof.has(a1) ? 1 : 0) + (lof.has(a2) ? 1 : 0);
    const gofCount = (gof.has(a1) ? 1 : 0) + (gof.has(a2) ? 1 : 0);
    if (gofCount === 2) return 'ultrarapid';
    if (lofCount === 2) return 'poor';
    if (lofCount === 1) return 'intermediate';
    if (gofCount === 1 && lofCount === 0) return 'ultrarapid';
    return 'normal';
  }

  // Single-allele input (hemizygous or haploid): interpret as homozygote.
  const single = h.match(/\*(\d+[A-Za-z]?)/);
  if (single) {
    const a1 = '*' + single[1];
    const a2 = a1;
    const lof = LOSS_OF_FUNCTION[g] || new Set();
    const gof = GAIN_OF_FUNCTION[g] || new Set();
    const lofCount = (lof.has(a1) ? 1 : 0) + (lof.has(a2) ? 1 : 0);
    const gofCount = (gof.has(a1) ? 1 : 0) + (gof.has(a2) ? 1 : 0);
    if (gofCount === 2) return 'ultrarapid';
    if (lofCount === 2) return 'poor';
    if (lofCount === 1) return 'intermediate';
    if (gofCount === 1) return 'ultrarapid';
    return 'normal';
  }

  return 'unknown';
}

// List known haplotypes for a gene. Returns [] for unknown genes.
function listHaplotypes(gene) {
  if (!gene) return [];
  const g = String(gene).toUpperCase().trim();
  return (HAPLOTYPES[g] || []).slice();
}

// Returns true if the diplotype is a known LoF homozygote or compound
// heterozygote (gene-level PM).
function isPoorMetabolizer(gene, call) {
  return classify(gene, call) === 'poor';
}

// Return the gene list supported by this module.
function supportedGenes() {
  return Object.keys(HAPLOTYPES).slice();
}

module.exports = {
  HAPLOTYPES: HAPLOTYPES,
  LOSS_OF_FUNCTION: LOSS_OF_FUNCTION,
  GAIN_OF_FUNCTION: GAIN_OF_FUNCTION,
  classify: classify,
  listHaplotypes: listHaplotypes,
  isPoorMetabolizer: isPoorMetabolizer,
  supportedGenes: supportedGenes
};
