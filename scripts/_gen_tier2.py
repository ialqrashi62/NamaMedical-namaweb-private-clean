#!/usr/bin/env python3
"""
gen_tier2.py — generate Tier-2 dept engines (30 depts) in namaweb/engines/<dept>/initial_assessment.engine.js
These extend the Tier-1 hexagonal Engine base, run for additional non-T1 depts.
Each runs: ctx -> red flags -> drug safety -> RAG -> LLM stub (no network) -> output.

Idempotent: skips if file exists.
Run: python scripts/gen_tier2.py
"""
import os, textwrap

OUT = os.path.join(os.path.dirname(__file__), '..', 'engines')
os.makedirs(OUT, exist_ok=True)

# Tier-2 depts (additional to Tier-1's 21)
TIER2_DEPTS = [
    'allergy',  'bariatrics', 'burn', 'cardiac_surgery', 'covid',
    'cytogenetics',   'dialysis', 'elective_surgery', 'endocrine_surg',
    'fetal_med',  'genetic_counsel', 'geriatric',  'hand_surg',
    'hyperbaric',  'infect_ctrl',  'interv_rad', 'ivf',
    'liver_tx',  'lymphatic',   'maternal_fetal',   'neonatal',
    'neuro_rehab',  'nuclear_med',  'occupational_med',   'pain',
    'palliative', 'pediatric_card', 'perinatal',    'plastic_surg',
    'rehab',  'renal_tx',
]

RAW = r'''
// AUTO-GEN T2 — __DEPT__/__FILE__
// Tier-2 dept engine. Extends shared Engine base (post-guardrails, hash-chained audit).
// Mandatory: ctx.tenantId, ctx.providerId, ctx.roles. Patient context (PHI) is never logged.

'use strict';

const { Engine } = require('../../lib');

const RED_FLAGS = [
  // {kind:'vital', id:'low_o2', any: [{key:'spo2', op:'<', value:90}], severity:'hard' },
  // Add 3-5 dept-specific red flags here at HARM-DETECT time. Pass [] for placeholder.
];

const DRUG_BLOCKS = [
  // {match:['drug_a','drug_b'], severity:'hard', why:'interaction name' },
];

class __CLASS__Assessment extends Engine {
  constructor() {
    super({
      dept: '__DEPT__',
      redFlags: RED_FLAGS,
      drugBlocks: DRUG_BLOCKS,
      citationMin: 0.7,
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
    });
  }

  async run(input, ctx) {
    // input = { patientId, condition, complaints?, vitals?, labs?, medications?, allergy? }
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });

    const chunks = await this.rag.search(ctx, text || input.condition || '__DEPT__');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nDepartment: __DEPT__ (Tier-2)',
      '\nContext: ' + JSON.stringify({ patientId: input && input.patientId, condition: input && input.condition }),
      'Produce a structured clinician-facing draft assessment with citations.',
    ].join('');

    const llmDraft = this.llmStub(promptText);
    const citations = chunks.map((c, i) => ({ source: c.source || 'rag', score: c.score || 0, idx: i + 1 }));

    return this.compose({
      redFlags: this.lastRedFlags || [],
      drugAlerts: this.lastDrugAlerts || [],
      chunks: chunks.length,
      citations,
      draft: llmDraft,
      audit: this.auditLast(),
    });
  }
}

module.exports = __CLASS__Assessment;
'''
TEMPLATE = RAW

def class_name(dept):
    parts = dept.split('_')
    return ''.join(p.capitalize() for p in parts)

def main():
    made = []
    skipped = []
    for dept in TIER2_DEPTS:
        ddir = os.path.join(OUT, dept)
        os.makedirs(ddir, exist_ok=True)
        path = os.path.join(ddir, 'initial_assessment.engine.js')
        if os.path.exists(path):
            skipped.append(path)
            continue
        with open(path, 'w', encoding='utf-8') as f:
            body = TEMPLATE.replace('__DEPT__', dept).replace('__CLASS__', class_name(dept)).replace('__FILE__', 'initial_assessment.engine.js')
            f.write(body)
        made.append(path)
    print('TIER-2 engines made:', len(made))
    for m in made:
        print(' +', m.replace('\\\\','/').split('/engines/')[-1])
    print('TIER-2 engines skipped (existing):', len(skipped))

if __name__ == '__main__':
    main()
