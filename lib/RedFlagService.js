'use strict';

/**
 * RedFlagService — server-side authority (safety rails).
 * HARD severity => engine MUST refuse / escalate.
 * SOFT severity => engine SHOULD escalate but provider can override.
 *
 * Rules per dept are loaded from .ai-brain at boot (or embedded here).
 */

const { randomUUID } = require('crypto');

// Default rules — Tier-1 coverage.
// Per-dept extensions can be registered via register(deptId, rules).
const DEFAULT_RULES = [
  // ====== Universal ======
  { id: 'GLOBAL-RF-001', severity: 'HARD', keywordAny: ['anaphylaxis','anaphylactic'], action: 'STAT epi + admit', slaMin: 1 },
  { id: 'GLOBAL-RF-002', severity: 'HARD', keywordAny: ['cardiac arrest'], action: 'STAT ACLS + ICU', slaMin: 1 },

  // ====== Cardiology ======
  { id: 'CARD-RF-001', dept: 'CARD', severity: 'HARD', keywordAny: ['st-elevation','stemi','lbbb new'], action: 'STAT cath lab', slaMin: 90 },
  { id: 'CARD-RF-002', dept: 'CARD', severity: 'HARD', vitalRule: v => v.sbp && v.sbp < 90 && v.hr && v.hr > 100, action: 'STAT cardiogenic shock pathway', slaMin: 5 },
  { id: 'CARD-RF-S01', dept: 'CARD', severity: 'SOFT', keywordAny: ['chest pain','angina'], action: 'urgent cardiology consult' },

  // ====== Pulmonology ======
  { id: 'PULM-RF-001', dept: 'PULM', severity: 'HARD', vitalRule: v => v.spo2 != null && v.spo2 < 88 && v.rr && v.rr > 30, action: 'STAT O2 + ICU', slaMin: 5 },
  { id: 'PULM-RF-002', dept: 'PULM', severity: 'HARD', keywordAny: ['hemoptysis massive','hemoptysis > 100','hemoptysis >200'], action: 'STAT bronchoscopy + IR', slaMin: 30 },
  { id: 'PULM-RF-003', dept: 'PULM', severity: 'HARD', keywordAny: ['pneumothorax tension'], action: 'STAT needle decompression', slaMin: 1 },

  // ====== Gastroenterology ======
  { id: 'GI-RF-001', dept: 'GI', severity: 'HARD', keywordAny: ['variceal bleed','massive hematemesis'], action: 'STAT EGD + octreotide', slaMin: 60 },
  { id: 'GI-RF-002', dept: 'GI', severity: 'HARD', keywordAny: ['boerhaave'], action: 'STAT CT + surgery', slaMin: 60 },
  { id: 'GI-RF-003', dept: 'GI', severity: 'HARD', keywordAny: ['mesenteric ischemia'], action: 'STAT CTA + surgery', slaMin: 60 },

  // ====== Nephrology ======
  { id: 'NEPH-RF-001', dept: 'NEPH', severity: 'HARD', labRule: l => l.k != null && l.k >= 6.5, action: 'STAT EKG + calcium gluconate', slaMin: 5 },
  { id: 'NEPH-RF-002', dept: 'NEPH', severity: 'HARD', labRule: l => l.k != null && l.k > 7.0, action: 'Emergency dialysis prep', slaMin: 30 },

  // ====== Oncology ======
  { id: 'ONC-RF-001', dept: 'ONC', severity: 'HARD', vitalRule: v => v.temp_c != null && v.temp_c >= 38.3 && (v.hr && v.hr > 100), action: 'Neutropenic fever bundle', slaMin: 60 },
  { id: 'ONC-RF-002', dept: 'ONC', severity: 'HARD', labRule: l => l.anc != null && l.anc < 0.5, action: 'Neutropenic precautions', slaMin: 60 },

  // ====== Endocrinology ======
  { id: 'ENDO-RF-001', dept: 'ENDO', severity: 'HARD', labRule: l => l.glucose != null && (l.glucose < 50 || l.glucose > 600), action: 'STAT glucose mgmt', slaMin: 15 },
  { id: 'ENDO-RF-002', dept: 'ENDO', severity: 'HARD', labRule: l => l.hco3 != null && l.hco3 < 10, action: 'DKA / HHS protocol', slaMin: 30 },

  // ====== Infectious Diseases ======
  { id: 'ID-RF-001', dept: 'ID', severity: 'HARD', vitalRule: v => v.sbp && v.sbp < 90 && v.temp_c != null && v.temp_c >= 38.3, action: 'Sepsis 1-h bundle', slaMin: 60 },

  // ====== ER ======
  { id: 'ER-RF-001', dept: 'ER', severity: 'HARD', vitalRule: v => (v.gcs != null && v.gcs <= 8), action: 'Airway management', slaMin: 1 },
  { id: 'ER-RF-002', dept: 'ER', severity: 'HARD', vitalRule: v => v.sbp && v.sbp < 90, action: 'Shock workup + IV/2', slaMin: 5 },

  // ====== OBG ======
  { id: 'OBG-RF-001', dept: 'OBG', severity: 'HARD', keywordAny: ['abruption','placenta previa','eclampsia','ectopic ruptured'], action: 'STAT OB-GYN + OR', slaMin: 5 },
  { id: 'OBG-RF-002', dept: 'OBG', severity: 'HARD', vitalRule: v => v.gestationWeeks != null && v.gestationWeeks < 34 && v.contractions, action: 'Tocolysis + betamethasone', slaMin: 30 },

  // ====== PEDS ======
  { id: 'PEDS-RF-001', dept: 'PEDS', severity: 'HARD', vitalRule: v => v.ageMonths != null && v.ageMonths < 3 && v.temp_c != null && v.temp_c >= 38.0, action: 'Septic workup neonate', slaMin: 60 },
  { id: 'PEDS-RF-002', dept: 'PEDS', severity: 'HARD', vitalRule: v => v.ageMonths != null && v.ageMonths < 6 && v.apnea, action: 'PICU + RSV panel', slaMin: 30 },

  // ====== Surgery ======
  { id: 'SURG-RF-001', dept: 'SURG', severity: 'HARD', keywordAny: ['perforation','peritonitis','fasciitis necrotizing'], action: 'STAT OR', slaMin: 60 },

  // ====== NEURO ======
  { id: 'NEURO-RF-001', dept: 'NEURO', severity: 'HARD', vitalRule: v => v.gcs != null && v.gcs < 9, action: 'Stroke pathway / ICU', slaMin: 30 },
  { id: 'NEURO-RF-002', dept: 'NEURO', severity: 'HARD', keywordAny: ['status epilepticus'], action: 'STAT benzo + ICU', slaMin: 5 },

  // ====== ORTHO / ENT / OPHTH / URO ======
  { id: 'ORTHO-RF-001', dept: 'ORTHO', severity: 'HARD', keywordAny: ['compartment syndrome'], action: 'STAT fasciotomy', slaMin: 60 },
  { id: 'ENT-RF-001',   dept: 'ENT',   severity: 'HARD', keywordAny: ['foreign body airway'], action: 'STAT rigid bronchoscopy', slaMin: 30 },
  { id: 'OPHTH-RF-001', dept: 'OPHTH', severity: 'HARD', keywordAny: ['retinal detachment','chemical burn eye','glaucoma acute'], action: 'STAT ophthal', slaMin: 30 },
  { id: 'URO-RF-001',   dept: 'URO',   severity: 'HARD', keywordAny: ['testicular torsion'], action: 'STAT OR (4h)', slaMin: 240 },

  // ====== ANES / ICU ======
  { id: 'ANES-RF-001', dept: 'ANES', severity: 'HARD', keywordAny: ['malignant hyperthermia'], action: 'STAT dantrolene', slaMin: 5 },
  { id: 'ICU-RF-001',   dept: 'ICU',   severity: 'HARD', vitalRule: v => v.lactate != null && v.lactate >= 4, action: 'Septic shock bundle', slaMin: 60 },

  // ====== DERM / RHEUM / PSYC ======
  { id: 'DERM-RF-001',  dept: 'DERM',  severity: 'HARD', keywordAny: ['stevens-johnson','sjs','ten'], action: 'STAT ICU + burn unit', slaMin: 60 },
  { id: 'RHEUM-RF-001', dept: 'RHEUM', severity: 'HARD', keywordAny: ['cord compression'], action: 'STAT MRI + surgery', slaMin: 60 },
  { id: 'PSYC-RF-001',  dept: 'PSYC',  severity: 'HARD', keywordAny: ['suicidal ideation imminent'], action: 'STAT psych + 1:1 sitter', slaMin: 5 },
];

class RedFlagService {
  constructor(opts = {}) {
    this.rules = opts.rules || DEFAULT_RULES;
    this.notify = opts.notify || (async () => {/* noop */});
  }

  register(deptId, extraRules) {
    const filtered = extraRules.filter(r => r.dept === deptId || !r.dept);
    for (const r of filtered) {
      if (!this.rules.find(x => x.id === r.id)) this.rules.push(r);
    }
  }

  async detect(input, ctxBundle, tenantId) {
    const out = [];
    const text = blobText(input, ctxBundle);
    const v = (ctxBundle && ctxBundle.vitals) || (input && input.vitals) || {};
    const l = (ctxBundle && ctxBundle.labs) || {};

    for (const rule of this.rules) {
      let matched = false;
      if (rule.keywordAny && rule.keywordAny.some(k => text.includes(k.toLowerCase()))) matched = true;
      if (!matched && rule.vitalRule && typeof rule.vitalRule === 'function' && rule.vitalRule(v)) matched = true;
      if (!matched && rule.labRule && typeof rule.labRule === 'function' && rule.labRule(l)) matched = true;
      if (matched) {
        out.push({
          id: rule.id,
          severity: rule.severity,
          descriptionAr: rule.action,
          descriptionEn: rule.action,
          actionAr: rule.action,
          actionEn: rule.action,
          escalation: rule.dept || 'oncall',
          slaMin: rule.slaMin || 30,
          overrideAllowed: rule.severity === 'SOFT',
          matchUid: randomUUID(),
          tenantId,
        });
        if (rule.severity === 'HARD') {
          // Fire-and-forget notification
          try { this.notify({ id: rule.id, dept: rule.dept, action: rule.action, tenantId }); } catch (_) {}
        }
      }
    }
    return out;
  }
}

function blobText(input, ctx) {
  const parts = [];
  function safeAdd(x) { if (typeof x === 'string') parts.push(x); }
  safeAdd(input && input.chiefComplaint);
  safeAdd(input && input.hpi);
  safeAdd(input && input.exam);
  if (ctx && ctx.notes) parts.push(ctx.notes);
  return parts.join(' ').toLowerCase();
}

module.exports = { RedFlagService, DEFAULT_RULES };
