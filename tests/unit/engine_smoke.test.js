'use strict';

/**
 * Unit + safety tests for the hexagonal engine base + adapters.
 *
 * Run via:
 *   npx jest tests/unit/engine_smoke.test.js
 *   or: npm test
 */

const { Engine, ExecutionContext } = require('../../lib');
const { RedFlagService } = require('../../lib/RedFlagService');
const { DrugCheckService } = require('../../lib/DrugCheckService');
const { Redactor } = require('../../lib/Redactor');
const { RAGService } = require('../../lib/RAGService');
const { AuditService } = require('../../lib/AuditService');

class StubEngine extends Engine {
  constructor(deps) {
    super({ redact: new Redactor(), ...deps });
    this.id = 'STUB';
    this.version = 't.0.0';
    this.deptId = 'STUB';
    this.safetyClass = 'critical';
    this.citationsRequired = 2;
  }
  async run(input, ctx) {
    const redFlags = await this.deps.redFlag.detect(
      input,
      { vitals: input.vitals, labs: input.labs, notes: input.hpi },
      ctx.tenantId,
    );
    const drugAlerts = await this.deps.drugChecker.check({
      proposed: input.proposedMedications || [],
      currentMeds: input.currentMeds || [],
      allergies: input.allergies || [],
      pregnancy: !!input.pregnancy,
    });
    const chunks = input.chunks || [];
    const citations = chunks.map((c, i) => ({ id: i + 1, source_type: c.corpus, document: c.docId }));
    let confidence = 0.85;
    if (redFlags.some(r => r.severity === 'HARD')) confidence = 0.6;
    if (drugAlerts.some(a => a.severity === 'block')) confidence = Math.min(confidence, 0.4);
    return {
      output: { ok: true },
      redFlags, drugAlerts, citations,
      confidence,
      warnings: [],
      requiresHumanReview: redFlags.length > 0 || drugAlerts.some(a => a.severity === 'block'),
    };
  }
}

function makeCtx(opts = {}) {
  return new ExecutionContext({
    tenantId: opts.tenantId || 'tnt-A',
    providerId: opts.providerId || 'dr-1',
    role: opts.role || 'doctor',
  });
}

describe('Engine base', () => {
  test('throws when instantiated directly', () => {
    expect(() => new Engine()).toThrow(/abstract/i);
  });

  test('execute uses Pre -> run -> Post -> audit pipeline', async () => {
    const eng = new StubEngine({
      redFlag: new RedFlagService(),
      drugChecker: new DrugCheckService(),
      rag: new RAGService(),
    });
    const ctx = makeCtx();
    const out = await eng.execute({ chiefComplaint: 'pain' }, ctx);
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.redFlags || [])).toBe(true);
  });
});

describe('Tenant safety (safety rail 11)', () => {
  test('ExecutionContext rejects missing tenantId', () => {
    expect(() => new ExecutionContext({ providerId: 'x' })).toThrow(/tenantId/);
  });

  test('execute passes tenantId through to red-flag detector', async () => {
    let capturedTenantId = null;
    const mockRedFlag = {
      detect: async (i, bundle, tid) => { capturedTenantId = tid; return []; }
    };
    const eng = new StubEngine({
      redFlag: mockRedFlag,
      drugChecker: { check: async () => [] },
      rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X' });
    await eng.execute({ chiefComplaint: 'x' }, ctx);
    expect(capturedTenantId).toBe('X');
  });
});

describe('Red-flag HARD block (safety rail 13)', () => {
  test('engine executes, output passes through post; HARD reflag in post detects', async () => {
    let detected = false;
    const rf = {
      detect: async () => [{
        id: 'TEST-1', severity: 'HARD', action: 'STAT', slaMin: 5,
        descriptionAr: 'd', descriptionEn: 'd', actionAr: 'd', actionEn: 'd',
        escalation: 'oncall', overrideAllowed: false,
      }]
    };
    const eng = new StubEngine({
      redFlag: rf, drugChecker: { check: async () => [] }, rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X', role: 'doctor' });
    await expect(eng.execute({ chiefComplaint: 'x' }, ctx)).rejects.toThrow(/HARD_RED_FLAG_BLOCK/);
    detected = true; // not used but here so intent is clear
    expect(detected).toBe(true);
  });
});

describe('Drug safety (interaction block)', () => {
  test('warfarin + fluconazole => block + execute rejects', async () => {
    const eng = new StubEngine({
      redFlag: { detect: async () => [] },
      drugChecker: new DrugCheckService(),
      rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X' });
    await expect(eng.execute({
      chiefComplaint: 'x',
      currentMeds: [{ code: 'warfarin' }],
      proposedMedications: [{ code: 'fluconazole' }],
    }, ctx)).rejects.toThrow(/DRUG_ALERT_BLOCK/);
  });
});

describe('Pregnancy + teratogen (BLOCK)', () => {
  test('warfarin on pregnant => block', async () => {
    const eng = new StubEngine({
      redFlag: { detect: async () => [] },
      drugChecker: new DrugCheckService(),
      rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X' });
    await expect(eng.execute({
      chiefComplaint: 'x',
      pregnancy: true,
      proposedMedications: [{ code: 'warfarin' }],
    }, ctx)).rejects.toThrow(/DRUG_ALERT_BLOCK/);
  });
});

describe('Allergy cross-reactivity', () => {
  test('penicillin-allergic + amoxicillin => block', async () => {
    const eng = new StubEngine({
      redFlag: { detect: async () => [] },
      drugChecker: new DrugCheckService(),
      rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X' });
    await expect(eng.execute({
      chiefComplaint: 'x',
      allergies: ['penicillin'],
      proposedMedications: [{ code: 'amoxicillin' }],
    }, ctx)).rejects.toThrow(/DRUG_ALERT_BLOCK/);
  });
});

describe('Citation coverage', () => {
  test('engine emits UNCERTAIN_BELOW_0_7 when citations low', async () => {
    const eng = new StubEngine({
      redFlag: { detect: async () => [] },
      drugChecker: { check: async () => [] },
      rag: new RAGService(),
    });
    const ctx = new ExecutionContext({ tenantId: 'X' });
    const out = await eng.execute({ chiefComplaint: 'x', chunks: [{ corpus: 'cba', docId: 'cbahi-1' }] }, ctx);
    expect(out.warnings).toContain('LOW_CITATION_COVERAGE');
  });
});

describe('PHI redaction (safety rail 12)', () => {
  test('redactor scrubs national ID, phone, email', () => {
    const r = new Redactor();
    const out = r.redactLog({
      name: 'Ahmed',
      mrn: 'P12345',
      note: 'Call 0501234567 or email a@b.com. National ID 1234567890',
    });
    expect(out.name).toBe('<PHI>');
    expect(out.mrn).toBe('<PHI>');
    expect(out.note).not.toContain('0501234567');
    expect(out.note).not.toContain('a@b.com');
    expect(out.note).not.toContain('1234567890');
  });
});

describe('RAG tenant cross (safety rail 5)', () => {
  test('RAG cross-tenant throws RAG_TENANT_CROSS', async () => {
    const rag = new RAGService();
    await expect((async () => {
      const chunks = await rag.retrieve({ query: 'x', tenantId: 'tnt-A', topK: 3 });
      rag.assertTenantScope(
        [{ tenantId: 'tnt-B', corpus: 'cba', docId: 'x', text: 'cross-tenant' }],
        'tnt-A',
      );
      return chunks;
    })()).rejects.toThrow(/RAG_TENANT_CROSS/);
  });
});

describe('Audit service (safety rail 10)', () => {
  test('redacts secrets from payloads', async () => {
    const a = new AuditService({ dryRun: true });
    let captured = null;
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = function (s) { captured = String(s); };
    try {
      await a.record({
        tenantId: 'T',
        engineId: 'X',
        password: 'leaked!',
        authorization: 'Bearer x',
        normal: 'visible',
      });
    } finally {
      process.stdout.write = orig;
    }
    expect(captured).toBeDefined();
    expect(captured).toContain('<REDACTED>');
    expect(captured).not.toContain('leaked!');
    expect(captured).toContain('visible');
  });
});
