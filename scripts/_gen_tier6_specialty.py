#!/usr/bin/env python3
"""
gen_tier6_specialty.py — Tier-6 procedural/clinical specialty engines.
These define narrowed procedure-bundled workflows under high-volume depts.

Pattern: <parent>/workflows/<workflow>/bundle.engine.js
Each bundle is a RAG-augmented clinical decision support engine.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'engines')

TIER6 = [
    # ICU — SIRS/SOFA/qSOFA bundles
    ('icu', 'sepsis_3h',     'Sepsis 1h Bundle', 'All ICU'),
    ('icu', 'sepsis_1h',     'Sepsis 1-hour Bundle', 'All ICU'),
    ('icu', 'ards_low_tidal','ARDSNet Low Tidal', 'MV'),
    ('icu', 'rass_sedation', 'RASS-guided Sedation', 'Mech Vent'),
    # ER — stroke + ACS bundles
    ('er',  'stroke_dtnt',   'Stroke DTN <60', 'Acute Stroke'),
    ('er',  'acs_d2b',       'STEMI Door-to-Balloon', 'ACS'),
    ('er',  'major_trauma',  'ATLS Major Trauma Primary Survey', 'Trauma'),
    ('er',  'anaphylaxis',   'Anaphylaxis 1st-line', 'Allergy'),
    # OBG — hemorrhage bundles
    ('obg', 'pph_bundle',    'Postpartum Hemorrhage Bundle', 'OBG'),
    ('obg', 'eclampsia',     'Eclampsia MgSO4 Loading', 'OBG'),
    ('obg', 'neonatal_resus','Neonatal Resuscitation (NRP)', 'OBG'),
    # Surgery — TIME-OUT + SPA bundle
    ('surg','who_timeout',   'WHO Surgical Safety Checklist', 'Periop'),
    ('surg','spa_qi',        'Surgical Prophylactic Antibiotic', 'QI'),
    ('surg','colorectal_erp','Colorectal Enhanced Recovery', 'ERAS'),
    # Cardiology
    ('card','door_to_balloon','STEMI Door-to-Balloon <90', 'ACS'),
    ('card','anticoag_stroke','AF Stroke Prophylaxis Anticoag', 'Cards'),
    # Pulm
    ('pulm','copd_exac',     'COPD Exacerbation Bundle', 'Pulm'),
    ('pulm','asthma_severe', 'Severe Asthma GINA Step 4-5', 'Pulm'),
    ('pulm','vte_pp',        'VTE Prophylaxis Surgical Inpatient', 'QI'),
    # Medical (new dept)
    ('immed','hospital_fever','Inpatient Fever Workup', 'IM'),
    ('immed','aki_dka',      'AKI + DKA Management', 'IM'),
]

RAW = r'''
// AUTO-GEN T6 procedural — __PARENT__/workflows/__WF__/bundle.engine.js
'use strict';

const { Engine } = require('../../../../../lib');

class __CLASS__Bundle extends Engine {
  constructor() {
    super({
      dept: '__PARENT__/__WF__',
      parentDept: '__PARENT__',
      workflow: '__WF__',
      procedureLabel: '__LABEL__',
      scope: '__SCOPE__',
      redFlags: [],
      drugBlocks: [],
      citationMin: 0.85,           // higher bar for procedural bundles
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
      bundleType: 'procedural',
    });
  }

  async run(input, ctx) {
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });
    const chunks = await this.rag.search(ctx, text || '__WF__');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nProcedure bundle: __LABEL__',
      '\nScope: __SCOPE__',
      '\nContext: ' + JSON.stringify({ patientId: input && input.patientId, condition: input && input.condition }),
      'Produce a clinician-facing, time-stamped, evidence-cited checklist aligned with the procedure bundle.',
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

module.exports = __CLASS__Bundle;
'''

def class_name(s):
    return ''.join(p.capitalize() for p in s.split('_'))

def main():
    made = []
    skipped = []
    for parent, wf, label, scope in TIER6:
        path = os.path.join(OUT, parent, 'workflows', wf, 'bundle.engine.js')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and os.path.getsize(path) > 100:
            skipped.append(path)
            continue
        body = (RAW
                .replace('__PARENT__', parent)
                .replace('__WF__', wf)
                .replace('__LABEL__', label)
                .replace('__SCOPE__', scope)
                .replace('__CLASS__', class_name(wf)))
        with open(path, 'w', encoding='utf-8') as f:
            f.write(body)
        made.append(path)
    print('TIER-6 made:', len(made), 'skipped:', len(skipped))

if __name__ == '__main__':
    main()
