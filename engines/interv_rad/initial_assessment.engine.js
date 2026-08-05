
// AUTO-GEN T2 — interv_rad/initial_assessment.engine.js
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

class IntervRadAssessment extends Engine {
  constructor() {
    super({
      dept: 'interv_rad',
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

    const chunks = await this.rag.search(ctx, text || input.condition || 'interv_rad');

    const promptText = [
      this.registry.compose('SYSTEM_PROMPT_BASE'),
      '\nDepartment: interv_rad (Tier-2)',
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

module.exports = IntervRadAssessment;
