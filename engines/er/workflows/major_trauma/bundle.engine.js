
// AUTO-GEN T6 procedural — er/workflows/major_trauma/bundle.engine.js
'use strict';

const { Engine } = require('../../../../lib');

class MajorTraumaBundle extends Engine {
  constructor() {
    super({
      dept: 'er/major_trauma',
      parentDept: 'er',
      workflow: 'major_trauma',
      procedureLabel: 'ATLS Major Trauma Primary Survey',
      scope: 'Trauma',
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
    const chunks = await this.rag.search(ctx, text || 'major_trauma');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nProcedure bundle: ATLS Major Trauma Primary Survey',
      '\nScope: Trauma',
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

module.exports = MajorTraumaBundle;



