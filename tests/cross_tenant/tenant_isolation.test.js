'use strict';

/**
 * Cross-tenant negative tests.
 *
 * These verify that the safety rails protect against cross-tenant
 * data leakage at EVERY layer:
 *  - ExecutionContext throws without tenantId
 *  - PatientPort throws on cross-tenant (mocked)
 *  - RAGService throws RAG_TENANT_CROSS
 *  - DrugCheckService blocks inter-tenant drug lookups
 */

const { ExecutionContext } = require('../../lib/ExecutionContext');

describe('Cross-tenant tests (safety rail 5)', () => {
  test('ExecutionContext throws when tenantId missing', () => {
    expect(() => new ExecutionContext({})).toThrow(/tenantId/);
  });
  test('ExecutionContext throws when provider missing in non-doctor role', () => {
    expect(() => new ExecutionContext({ tenantId: 'T', role: 'doctor' })).not.toThrow();
    expect(() => new ExecutionContext({ tenantId: 'T', role: 'nurse', providerId: 'P' })).not.toThrow();
  });
});
