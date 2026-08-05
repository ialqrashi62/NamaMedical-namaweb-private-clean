
// AUTO-GEN T6 procedural — icu/workflows/sepsis_1h/bundle.engine.js
'use strict';

const { Engine } = require('../../../../lib');

class Sepsis1hBundle extends Engine {
  constructor() {
    super({
      dept: 'icu/sepsis_1h',
      parentDept: 'icu',
      workflow: 'sepsis_1h',
      procedureLabel: 'Sepsis 1-hour Bundle',
      scope: 'All ICU',
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
    const chunks = await this.rag.search(ctx, text || 'sepsis_1h');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nProcedure bundle: Sepsis 1-hour Bundle',
      '\nScope: All ICU',
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

module.exports = Sepsis1hBundle;



