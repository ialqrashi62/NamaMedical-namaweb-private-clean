
// AUTO-GEN T5 sub-unit — card/lipid/initial_assessment.engine.js
'use strict';

const { Engine } = require('../../../../lib');

class LipidAssessment extends Engine {
  constructor() {
    super({
      dept: 'card/lipid',
      redFlags: [],
      drugBlocks: [],
      citationMin: 0.7,
      requireRedFlag: true,
      requireDrugCheck: true,
      redactor: true,
      auditChain: true,
      parentDept: 'card',
      subunit: 'lipid',
    });
  }

  async run(input, ctx) {
    this.assertTenant(ctx);
    const text = (input && (input.complaints || input.condition)) || '';
    this.checkRedFlags(input, text);
    const drugs = (input && input.medications) || [];
    const allergy = (input && input.allergy) || [];
    this.checkDrugs(drugs, { pregnancy: !!(input && input.pregnancy), allergies: allergy });
    const chunks = await this.rag.search(ctx, text || input.condition || 'lipid');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nSub-unit: Lipid Clinic under card',
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

module.exports = LipidAssessment;

