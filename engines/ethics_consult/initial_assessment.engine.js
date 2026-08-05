
// AUTO-GEN Tier-4 — ethics_consult/initial_assessment.engine.js
// Tier-4 dept engine. Extends shared Engine base.
'use strict';

const { Engine } = require('../../lib');

class EthicsConsultAssessment extends Engine {
  constructor() {
    super({
      dept: 'ethics_consult',
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
    const chunks = await this.rag.search(ctx, text || input.condition || 'ethics_consult');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nDepartment: ethics_consult (Tier-4)',
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

module.exports = EthicsConsultAssessment;
