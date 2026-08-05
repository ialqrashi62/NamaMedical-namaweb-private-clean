'use strict';

/**
 * Port contracts (hexagonal).
 * Any implementation (Postgres, vector, in-mem) must satisfy these.
 */

class PatientPort {
  // eslint-disable-next-line no-unused-vars
  async getContext(patientId, tenantId) {
    throw new Error('PatientPort.getContext not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async getActiveMedications(patientId, tenantId) {
    throw new Error('PatientPort.getActiveMedications not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async getAllergies(patientId, tenantId) {
    throw new Error('PatientPort.getAllergies not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async getPregnancy(patientId, tenantId) {
    throw new Error('PatientPort.getPregnancy not implemented');
  }
}

class GuidelinePort {
  async search(query, corpora, tenantId, opts = {}) {
    throw new Error('GuidelinePort.search not implemented');
  }
  async cite(citationId) {
    throw new Error('GuidelinePort.cite not implemented');
  }
}

class RAGPort {
  // eslint-disable-next-line no-unused-vars
  async retrieve(req /* {query, corpus, topK, tenantId, filter} */) {
    throw new Error('RAGPort.retrieve not implemented');
  }
  async reset() {
    /* no-op for in-mem */
  }
}

class CalculatorPort {
  async listForDept(deptId) {
    throw new Error('CalculatorPort.listForDept not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async run(name, input, ctx) {
    throw new Error('CalculatorPort.run not implemented');
  }
}

class AuditPort {
  // eslint-disable-next-line no-unused-vars
  async record(row) {
    throw new Error('AuditPort.record not implemented');
  }
}

class RedFlagDetector {
  // eslint-disable-next-line no-unused-vars
  async detect(input, ctxBundle, tenantId) {
    throw new Error('RedFlagDetector.detect not implemented');
  }
}

class DrugInteractionChecker {
  // eslint-disable-next-line no-unused-vars
  async check(req /* {proposed, currentMeds, allergies, pregnancy, renal, hepatic} */) {
    throw new Error('DrugInteractionChecker.check not implemented');
  }
}

class SFDARegistry {
  // eslint-disable-next-line no-unused-vars
  async isRegistered(drugCode) {
    throw new Error('SFDARegistry.isRegistered not implemented');
  }
  // eslint-disable-next-line no-unused-vars
  async blackbox(drugCode) {
    throw new Error('SFDARegistry.blackbox not implemented');
  }
}

class LLMAdapter {
  // eslint-disable-next-line no-unused-vars
  async invoke(req /* {promptId, vars, maxTokens, temperature} */) {
    throw new Error('LLMAdapter.invoke not implemented');
  }
}

class PromptRegistry {
  async get(promptId, version) {
    throw new Error('PromptRegistry.get not implemented');
  }
  async compile(promptId, vars) {
    throw new Error('PromptRegistry.compile not implemented');
  }
}

class Redactor {
  // eslint-disable-next-line no-unused-vars
  redactLog(obj) {
    throw new Error('Redactor.redactLog not implemented');
  }
  redactOutput(obj) {
    return obj;
  }
}

module.exports = {
  PatientPort,
  GuidelinePort,
  RAGPort,
  CalculatorPort,
  AuditPort,
  RedFlagDetector,
  DrugInteractionChecker,
  SFDARegistry,
  LLMAdapter,
  PromptRegistry,
  Redactor,
};
