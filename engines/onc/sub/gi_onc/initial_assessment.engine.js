
// AUTO-GEN T5 sub-unit — onc/gi_onc/initial_assessment.engine.js
'use strict';

const { Engine } = require('../../../../lib');

class GiOncAssessment extends Engine {
  constructor() {
    super({
      dept: 'onc/gi_onc',
      redFlags: [],
      drugBlocks: [],
      citationMin: 0.7,
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
      parentDept: 'onc',
      subunit: 'gi_onc',
    });
  }

  async run(input, ctx) {
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });
    const chunks = await this.rag.search(ctx, text || input.condition || 'gi_onc');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nSub-unit: GI Oncology under onc',
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

module.exports = GiOncAssessment;

