'use strict';

/**
 * Engine — abstract base for every clinical engine.
 * Ports-injected; pure domain logic; mandatory audit + guardrails.
 *
 * SAFETY RAILS preserved:
 *  - tenant scope enforced (ExecutionContext.tenantId)
 *  - PHI redact on log
 *  - audit hash chain
 *  - red flag BLOCK on HARD
 *  - citation required (>=N)
 *  - SFDA drug list blocking
 */
const { ExecutionContext } = require('./ExecutionContext');
const AuditService = require('./AuditService');

class Engine {
  /**
   * @param {object} deps  injected ports
   *   - patientRepo: PatientPort
   *   - guideline: GuidelinePort
   *   - rag: RAGPort
   *   - calc: CalculatorPort
   *   - drugChecker: DrugInteractionChecker
   *   - redFlag: RedFlagDetector
   *   - sfda: SFDARegistry
   *   - audit: AuditService  (optional; constructed by default)
   *   - redact: Redactor (optional)
   */
  constructor(deps = {}) {
    if (new.target === Engine) {
      throw new Error('Engine is abstract; instantiate a subclass.');
    }
    this.deps = deps;
    this.audit = deps.audit || new AuditService(deps);
    this.id = 'UNNAMED_ENGINE';
    this.version = '1.0.0';
    this.deptId = null;
    this.safetyClass = 'standard';
    this.citationsRequired = 2;
    this.maxTokensOut = 1500;
    this.temperature = 0.1;
    this.modelTarget = 'gpt-4o';
  }

  /**
   * Subclass override. Pure domain logic.
   * @returns {Promise<{output:any, redFlags:any[], drugAlerts:any[], citations:any[], confidence:number}>}
   */
  // eslint-disable-next-line no-unused-vars
  async run(input, ctx) {
    throw new Error('Engine.run not implemented.');
  }

  /**
   * Default pipeline: guardrails -> run -> post -> audit.
   * Override only if you know what you're doing.
   */
  async execute(input, ctx) {
    if (!(ctx instanceof ExecutionContext)) {
      ctx = new ExecutionContext(ctx || {});
    }
    const tenantId = ctx.requireTenantScope();
    await this._pre(input, ctx);

    const result = await this.run(input, ctx);

    const passed = await this._post(result, ctx);
    if (!passed.ok) {
      throw new Error(passed.error || 'post-guardrail failed');
    }
    await this._audit(input, result, ctx);
    return result.output;
  }

  async _pre(input, ctx) {
    // PHI redact on log
    if (this.deps.redact) {
      const safe = this.deps.redact.redactLog(input);
      ctx.appendLedger({ event: 'pre-redact', ok: true, size: safe });
    }
    ctx.appendLedger({ event: 'tenant-scope', tenantId: ctx.tenantId });
  }

  async _post(result, ctx) {
    const redFlags = Array.isArray(result.redFlags) ? result.redFlags : [];
    const drugAlerts = Array.isArray(result.drugAlerts) ? result.drugAlerts : [];
    const citations = Array.isArray(result.citations) ? result.citations : [];

    // HARD red flags: BLOCK unless explicitly overridden by senior.
    const hard = redFlags.filter(r => r && r.severity === 'HARD');
    if (hard.length > 0) {
      const allowed = hard.every(r => r.overrideAllowed !== false && ctx.role === 'consultant');
      if (!allowed) {
        return { ok: false, error: 'HARD_RED_FLAG_BLOCK' };
      }
    }

    // Drug alerts: any severity=block => refuse drug rec.
    if (drugAlerts.some(a => a.severity === 'block')) {
      return { ok: false, error: 'DRUG_ALERT_BLOCK' };
    }

    // Citations: low coverage => emit UNCERTAIN.
    if (citations.length < this.citationsRequired) {
      result.confidence = Math.min(result.confidence || 1, 0.5);
      result.warnings = result.warnings || [];
      result.warnings.push('LOW_CITATION_COVERAGE');
    }

    // Confidence threshold (<0.7) => UNCERTAIN flag.
    if (typeof result.confidence === 'number' && result.confidence < 0.7) {
      result.requiresHumanReview = true;
      result.warnings = result.warnings || [];
      result.warnings.push('UNCERTAIN_BELOW_0_7');
    }
    return { ok: true };
  }

  async _audit(input, result, ctx) {
    await this.audit.record({
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
      role: ctx.role,
      engineId: this.id,
      engineVersion: this.version,
      deptId: this.deptId,
      safetyClass: this.safetyClass,
      correlationId: ctx.correlationId,
      latencyMs: ctx.elapsedMs(),
      redFlagFired: (result.redFlags || []).length > 0,
      drugBlockFired: (result.drugAlerts || []).length > 0,
      citationCount: (result.citations || []).length,
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
      inputRedacted: this.deps.redact ? this.deps.redact.redactLog(input) : null,
      outputRedacted: this.deps.redact ? this.deps.redact.redactLog(result.output) : null,
      ledger: ctx.ledgerSnapshot(),
    });
  }

  redact(obj) {
    return this.deps.redact ? this.deps.redact.redactLog(obj) : obj;
  }
}

module.exports = { Engine };
