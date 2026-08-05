
// AUTO-GEN Tier-3 — palliative_onc/initial_assessment.engine.js
// Tier-3 dept engine. Extends shared Engine base.
'use strict';

const { Engine } = require('../../lib');

class PalliativeOncAssessment extends Engine {
  constructor() {
    super({
      dept: 'palliative_onc',
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
    const chunks = await this.rag.search(ctx, text || input.condition || 'palliative_onc');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nDepartment: palliative_onc (Tier-3)',
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

module.exports = PalliativeOncAssessment;
