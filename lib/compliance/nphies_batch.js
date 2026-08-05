'use strict';
// NPHIES nightly batch check — validates claim payloads before batch submission.
// Returns a list of issues per claim. No network calls in sandbox.

function newNphiesBatch() {
  function check({ claims }) {
    const issues = [];
    for (const c of claims || []) {
      if (!c.tenantId) issues.push({ id: c.id, code: 'TENANT_MISSING' });
      if (!c.patientId) issues.push({ id: c.id, code: 'PATIENT_MISSING' });
      if (!c.items || !c.items.length) issues.push({ id: c.id, code: 'ITEMS_MISSING' });
      if (c.total && c.total < 0) issues.push({ id: c.id, code: 'NEGATIVE_TOTAL' });
    }
    return { ok: issues.length === 0, issues, total: (claims || []).length };
  }
  return { check };
}

module.exports = { newNphiesBatch };
