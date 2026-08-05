#!/usr/bin/env python3
"""
gen_tier3_tier4.py — generate Tier-3 (40) + Tier-4 (20) dept engines.
Each is a stub that loads the same shared Engine base + handles <input, ctx>.

Idempotent: skips if file exists.
Total: 60 new dept engines.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'engines')
os.makedirs(OUT, exist_ok=True)

# Tier-3 (40 depts) — broad coverage
TIER3_DEPTS = [
    'addiction', 'adolescent_med', 'aesthetic', 'andrology', 'bariatric_nutr',
    'biomedical', 'breast_clinic', 'cardiac_rehab', 'child_dev',
    'clinical_ethics', 'community_med', 'derm_cosmetic', 'diabetes_edu',
    'echo', 'electrophys', 'environmental_med', 'fp_mph', 'genetic_med',
    'geriatric_psych', 'gyn_onc', 'hematology', 'hospice', 'im_med',
    'interv_pulm', 'lifestyle_med', 'ltc', 'molecular_path',
    'musculo', 'neuro_icu', 'neuro_rehab_med', 'obesity_med',
    'occup_health', 'palliative_onc', 'peds_endo', 'peds_neuro',
    'periop_med', 'preventive_med', 'pulm_rehab', 'rural_health',
    'sleep_med', 'travel_med', 'tropical_med',
]

# Tier-4 (20 depts) — niche + specialty single-purpose
TIER4_DEPTS = [
    'audiology', 'biorepository', 'burn_outpatient', 'comp_med',
    'dentistry', 'derm_path', 'ent_peds', 'ethics_consult',
    'forensic_path', 'forensic_psych', 'genetic_test', 'hand_therapy',
    'helicopter_med', 'home_pharm', 'infusion', 'ivf_advanced',
    'mass_casualty', 'neuro_opth', 'pain_proc', 'sport_med',
]

RAW = r'''
// AUTO-GEN __TIER__ — __DEPT__/__FILE__
// __TIER__ dept engine. Extends shared Engine base.
'use strict';

const { Engine } = require('../../lib');

class __CLASS__Assessment extends Engine {
  constructor() {
    super({
      dept: '__DEPT__',
      redFlags: [],
      drugBlocks: [],
      citationMin: 0.7,
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
    });
  }

  async run(input, ctx) {
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });
    const chunks = await this.rag.search(ctx, text || input.condition || '__DEPT__');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nDepartment: __DEPT__ (__TIER__)',
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

def class_name(dept):
    parts = dept.split('_')
    return ''.join(p.capitalize() for p in parts)

def gen_for(depts, tier):
    made = []
    skipped = []
    for dept in depts:
        ddir = os.path.join(OUT, dept)
        os.makedirs(ddir, exist_ok=True)
        path = os.path.join(ddir, 'initial_assessment.engine.js')
        if os.path.exists(path) and os.path.getsize(path) > 100:
            skipped.append(path)
            continue
        body = (RAW
                .replace('__DEPT__', dept)
                .replace('__CLASS__', class_name(dept))
                .replace('__TIER__', tier)
                .replace('__FILE__', 'initial_assessment.engine.js'))
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body)
        made.append(path)
    return made, skipped

def main():
    m3, s3 = gen_for(TIER3_DEPTS, 'Tier-3')
    m4, s4 = gen_for(TIER4_DEPTS, 'Tier-4')
    print('TIER-3 made:', len(m3), 'skipped:', len(s3))
    print('TIER-4 made:', len(m4), 'skipped:', len(s4))

if __name__ == '__main__':
    main()
