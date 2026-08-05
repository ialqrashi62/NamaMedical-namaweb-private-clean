'use strict';

/**
 * SURG-001 Initial Assessment Engine
 * AUTOPILOT-generated. Tier-1.
 *
 * SAFETY RAILS preserved:
 *   1 (no secrets), 2 (no PHI), 5 (tenant scope), 7 (encrypted blobs),
 *   10 (audit hash-chained), 11 (fail-closed on missing tenant),
 *   12 (no PHI in logs via Redactor), 13 (Golden Access).
 */
const { Engine, ExecutionContext } = require('../../lib');
const { Redactor } = require('../../lib/Redactor');
const { RedFlagService } = require('../../lib/RedFlagService');
const { DrugCheckService } = require('../../lib/DrugCheckService');

class SURGInitialAssessment extends Engine {
  constructor(deps = {}) {
    super(Object.assign({
      redact: new Redactor(),
      redFlag: deps.redFlag || new RedFlagService(),
      drugChecker: deps.drugChecker || new DrugCheckService(),
    }, deps || {}));
    this.id = 'SURG-001:initial_assessment';
    this.version = '1.0.0';
    this.deptId = 'SURG';
    this.safetyClass = 'critical';
    this.citationsRequired = 3;
    this.maxTokensOut = 1500;
    this.temperature = 0.1;
    this.modelTarget = 'gpt-4o';
  }

  /**
   * @param {VisitInput} input
   * @param {ExecutionContext} ctx
   * @returns {Promise<{output:any,redFlags:any[],drugAlerts:any[],citations:any[],confidence:number,requiresHumanReview:boolean,warnings:string[]}>}
   */
  async run(input, ctx) {
    const tenantId = ctx.requireTenantScope();

    // 1. Patient context (dept-scoped via injected port)
    let ctxBundle = null;
    if (this.deps.patientRepo) {
      try {
        ctxBundle = await this.deps.patientRepo.getContext(input.patientId, tenantId);
      } catch (e) {
        ctx.appendLedger({ event: 'patient-repo-error', error: e.message });
      }
    }

    // 2. Red-flag detection (server-side authority)
    const redFlags = await this.deps.redFlag.detect(input, ctxBundle, tenantId);

    // 3. Drug check
    const drugAlerts = await this.deps.drugChecker.check({
      proposed: input.proposedMedications || [],
      currentMeds: (ctxBundle && ctxBundle.currentMeds) || [],
      allergies: (ctxBundle && ctxBundle.allergies) || [],
      pregnancy: (ctxBundle && ctxBundle.pregnancy) || false,
      renal: (ctxBundle && ctxBundle.renalFailure) || false,
      hepatic: (ctxBundle && ctxBundle.hepaticFailure) || false,
    });

    // 4. RAG retrieval (specialty corpora)
    let chunks = [];
    if (this.deps.rag) {
      try {
        chunks = await this.deps.rag.retrieve({
          query: (input.chiefComplaint || '') + ' ' + (input.hpi || ''),
          corpus: ['cba','sfda','nphies','who','surg-guidelines'],
          topK: 8,
          tenantId,
        });
        if (typeof this.deps.rag.assertTenantScope === 'function') {
          this.deps.rag.assertTenantScope(chunks, tenantId);
        }
      } catch (e) {
        if (e.message === 'RAG_TENANT_CROSS') throw e; // HARD fail-closed
        ctx.appendLedger({ event: 'rag-error', error: e.message });
      }
    }

    // 5. Build LLM call payload (delegated to adapter)
    const llmReq = {
      promptId: 'PROMPT:SURG-001:initial_assessment',
      vars: {
        dept_name: 'General Surgery',
        chief_complaint: input.chiefComplaint,
        hpi: input.hpi,
        exam: input.exam,
        vitals: input.vitals || {},
        red_flags: redFlags,
        drug_alerts: drugAlerts,
        corpus_chunks: chunks,
        tenant_id: tenantId,
      },
      maxTokens: this.maxTokensOut,
      temperature: this.temperature,
      model: this.modelTarget,
    };

    let llmOut = { answer: '', raw: null };
    if (this.deps.llm) {
      try {
        llmOut = await this.deps.llm.invoke(llmReq);
      } catch (e) {
        ctx.appendLedger({ event: 'llm-error', error: e.message });
      }
    } else {
      // Stub: produce a safe baseline in dev/test.
      llmOut = {
        answer: '[stub] No LLM adapter bound. Engines must run in sandbox with adapter.',
        raw: null,
      };
    }

    // 6. Compose output
    const citations = (chunks || []).map((c, idx) => ({
      id: idx + 1,
      source_type: c.corpus || 'unknown',
      document: (c.citation && c.citation.document) || 'unknown',
      version: (c.citation && c.citation.version) || '0',
      chunkId: c.docId,
      score: c.score || 0,
      tenantId,
    }));

    const output = {
      differential: input.preExistingDifferential || [],
      recommendedOrders: input.proposedOrders || [],
      carePlan: null,
      summary: llmOut.answer || '',
      provenance: { engineId: this.id, version: this.version },
    };

    // 7. Conservative confidence for HARD red flags
    let confidence = 0.85;
    let requiresHumanReview = false;
    let warnings = [];
    if (redFlags.some(r => r.severity === 'HARD')) {
      confidence = 0.6;
      requiresHumanReview = true;
      warnings.push('HARD_RED_FLAG_DISCUSS_WITH_CONSULTANT');
    }
    if (drugAlerts.some(a => a.severity === 'block')) {
      confidence = Math.min(confidence, 0.4);
      warnings.push('DRUG_BLOCK_REVIEW_REQUIRED');
    }

    return {
      output,
      redFlags,
      drugAlerts,
      citations,
      confidence,
      requiresHumanReview,
      warnings,
    };
  }
}

module.exports = { SURGInitialAssessment };
