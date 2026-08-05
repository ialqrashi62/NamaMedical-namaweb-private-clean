#!/usr/bin/env python3
"""
gen_tier5_subunits.py — generate Tier-5 SUB-UNIT engines.
These are narrower specializations under high-volume depts.
Each extends Engine and shares the dept's red-flag+drug rule namespace.

Pattern:
  <parent_dept>/sub/<subunit>/initial_assessment.engine.js
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'engines')

# Top-volume depts get dedicated sub-units
TIER5 = [
    # Cardiology
    ('card', 'electrophys',     'Cardiac Electrophysiology'),
    ('card', 'heart_failure',   'Heart Failure Clinic'),
    ('card', 'structural',      'Structural Heart'),
    ('card', 'lipid',           'Lipid Clinic'),
    ('card', 'congenital_adult','Adult Congenital'),
    # Pulmonology
    ('pulm', 'sleep',           'Sleep Medicine'),
    ('pulm', 'asthma',          'Severe Asthma'),
    ('pulm', 'cf',              'Cystic Fibrosis'),
    ('pulm', 'thoracic_onco',   'Thoracic Oncology'),
    ('pulm', 'pulmonary_htn',   'Pulmonary Hypertension'),
    # Oncology
    ('onc', 'breast',           'Breast Oncology'),
    ('onc', 'lung',             'Thoracic Oncology (med)'),
    ('onc', 'gi_onc',           'GI Oncology'),
    ('onc', 'heme',             'Hematologic Malignancy'),
    ('onc', 'pain',             'Cancer Pain'),
    # Surgery
    ('surg', 'bariatric',       'Bariatric Surgery'),
    ('surg', 'colorectal',      'Colorectal Surgery'),
    ('surg', 'onc_surg',        'Surgical Oncology'),
    ('surg', 'trauma',          'Trauma Surgery'),
    ('surg', 'transplant',      'Transplant Surgery'),
    # Pediatrics
    ('peds', 'neonatal',        'Neonatology'),
    ('peds', 'cardiology',      'Pediatric Cardiology'),
    ('peds', 'nephrology',      'Pediatric Nephrology'),
    ('peds', 'pulmonology',     'Pediatric Pulmonology'),
    ('peds', 'surgery',         'Pediatric Surgery'),
]

RAW = r'''
// AUTO-GEN T5 sub-unit — __PARENT__/__SUBUNIT__/initial_assessment.engine.js
'use strict';

const { Engine } = require('../../../../lib');

class __CLASS__Assessment extends Engine {
  constructor() {
    super({
      dept: '__PARENT__/__SUBUNIT__',
      redFlags: [],
      drugBlocks: [],
      citationMin: 0.7,
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
      parentDept: '__PARENT__',
      subunit: '__SUBUNIT__',
    });
  }

  async run(input, ctx) {
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });
    const chunks = await this.rag.search(ctx, text || input.condition || '__SUBUNIT__');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nSub-unit: __SUBUNIT_LABEL__ under __PARENT__',
      '\nContext: ' + JSON.stringify({ patientId: input && input.patientId, condition: input && input.condition }),
      'Produce specialized clinician-facing draft assessment with citations.',
    ].join('');

    return this.compose({
      redFlags: this.lastRedFlags || [],
      drugAlerts: this.lastDrugAlerts || [],
      chunks: chunks.length,
      draft: this.llmStub(promptText),
      citations: chunks.map((c, i) => ({ source: c.source || 'rag', score: c.score || 0, idx: i + 1 })),
      audit: this.auditLast(),
    });
  }
}

module.exports = __CLASS__Assessment;
'''

def class_name(s):
    return ''.join(p.capitalize() for p in s.split('_'))

def main():
    made = []
    skipped = []
    for parent, sub, label in TIER5:
        path = os.path.join(OUT, parent, 'sub', sub, 'initial_assessment.engine.js')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and os.path.getsize(path) > 100:
            skipped.append(path)
            continue
        body = (RAW
                .replace('__PARENT__', parent)
                .replace('__SUBUNIT__', sub)
                .replace('__SUBUNIT_LABEL__', label)
                .replace('__CLASS__', class_name(sub)))
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body)
        made.append(path)
    print('TIER-5 made:', len(made), 'skipped:', len(skipped))

if __name__ == '__main__':
    main()
