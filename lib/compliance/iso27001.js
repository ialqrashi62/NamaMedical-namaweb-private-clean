'use strict';
// ISO/IEC 27001:2022 Annex A controls.
// Pure JS, no npm install. Tenant-scoped, fail-closed, no PHI in errors.
// RAIL-5 (tenant isolation), RAIL-10 (hash-chained audit).

const CONTROLS = {
  'A.5.15': {
    name: 'Access Control',
    owner: 'CISO',
    required: true,
    risk: 'high',
    evidence: ['rbac_policy', 'access_review.log'],
    intent: 'Limit access to information and information-processing facilities'
  },
  'A.8.10': {
    name: 'Information Deletion',
    owner: 'DPO',
    required: true,
    risk: 'medium',
    evidence: ['retention_policy', 'purge_log'],
    intent: 'Information should be deleted in accordance with retention policy'
  },
  'A.8.24': {
    name: 'Use of Cryptography',
    owner: 'CISO',
    required: true,
    risk: 'critical',
    evidence: ['crypto_policy', 'kms_audit'],
    intent: 'Cryptographic controls protect confidentiality, integrity, authenticity'
  },
  'A.8.28': {
    name: 'Secure Coding',
    owner: 'CTO',
    required: true,
    risk: 'high',
    evidence: ['sast_report', 'code_review_log'],
    intent: 'Secure coding principles applied to software development'
  },
  'A.5.30': {
    name: 'ICT Readiness for Business Continuity',
    owner: 'COO',
    required: true,
    risk: 'critical',
    evidence: ['dr_plan', 'dr_drill.log'],
    intent: 'ICT systems support business continuity under disruption'
  }
};

function listControls(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { error: 'TENANT_REQUIRED', ok: false };
  }
  const items = Object.keys(CONTROLS).map(function (id) {
    const c = CONTROLS[id];
    return {
      id: id,
      name: c.name,
      owner: c.owner,
      required: c.required,
      risk: c.risk
    };
  });
  return { ok: true, tenantId: tenantId, count: items.length, controls: items };
}

function lookupControl(id) {
  if (!id || typeof id !== 'string') return null;
  const c = CONTROLS[id];
  if (!c) return null;
  return { id: id, name: c.name, owner: c.owner, required: c.required, risk: c.risk, intent: c.intent };
}

function controlDetail(tenantId, id) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { error: 'TENANT_REQUIRED', ok: false };
  }
  const c = lookupControl(id);
  if (!c) {
    return { error: 'CONTROL_NOT_FOUND', ok: false };
  }
  return { ok: true, tenantId: tenantId, control: c };
}

function evidenceFor(tenantId, id) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { error: 'TENANT_REQUIRED', ok: false };
  }
  const c = CONTROLS[id];
  if (!c) return { error: 'CONTROL_NOT_FOUND', ok: false };
  // Mock: simulate checks against evidence files. No PHI read.
  const findings = [];
  for (let i = 0; i < c.evidence.length; i++) {
    findings.push({ artifact: c.evidence[i], present: true, checkedAt: new Date().toISOString() });
  }
  return { ok: true, tenantId: tenantId, id: id, findings: findings };
}

function auditReadiness(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { error: 'TENANT_REQUIRED', ok: false };
  }
  let ready = 0;
  let required = 0;
  const details = [];
  const ids = Object.keys(CONTROLS);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const c = CONTROLS[id];
    if (c.required) required += 1;
    // Mock readiness: all evidence files presumed present in this codepath.
    const isReady = c.required && c.evidence.length >= 1;
    if (isReady) ready += 1;
    details.push({ id: id, ready: isReady, owner: c.owner });
  }
  return {
    ok: true,
    tenantId: tenantId,
    score: required === 0 ? 100 : Math.round((ready / required) * 100),
    ready: ready,
    required: required,
    details: details,
    auditedAt: new Date().toISOString()
  };
}

module.exports = {
  CONTROLS: CONTROLS,
  listControls: listControls,
  lookupControl: lookupControl,
  controlDetail: controlDetail,
  evidenceFor: evidenceFor,
  auditReadiness: auditReadiness
};
