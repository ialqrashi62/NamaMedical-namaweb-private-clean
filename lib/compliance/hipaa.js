'use strict';
// HIPAA Security Rule (45 CFR §164.302-318) safeguards.
// Pure JS, no npm install. Categories: Administrative, Physical, Technical.
// RAIL-12 (no PHI in errors).

const SAFEGUARDS = {
  administrative: {
    label: 'Administrative Safeguards',
    citation: '45 CFR §164.308',
    items: [
      { id: 'A.SO', name: 'Security Officer', required: true, evidence: ['security_officer_appointment'] },
      { id: 'A.TR', name: 'Workforce Training', required: true, evidence: ['training_log', 'training_attest'] },
      { id: 'A.CP', name: 'Contingency Plan', required: true, evidence: ['dr_plan', 'backup_log', 'dr_drill'] },
      { id: 'A.RA', name: 'Risk Analysis', required: true, evidence: ['risk_register', 'risk_treatment'] },
      { id: 'A.SA', name: 'Sanction Policy', required: true, evidence: ['sanction_register'] }
    ]
  },
  physical: {
    label: 'Physical Safeguards',
    citation: '45 CFR §164.310',
    items: [
      { id: 'P.FA', name: 'Facility Access Controls', required: true, evidence: ['badge_log', 'visitor_log'] },
      { id: 'P.WD', name: 'Workstation Use', required: true, evidence: ['workstation_policy'] },
      { id: 'P.WS', name: 'Workstation Security', required: true, evidence: ['workstation_audit'] },
      { id: 'P.DC', name: 'Device and Media Controls', required: true, evidence: ['media_disposal_log'] }
    ]
  },
  technical: {
    label: 'Technical Safeguards',
    citation: '45 CFR §164.312',
    items: [
      { id: 'T.AC', name: 'Access Control', required: true, evidence: ['rbac_policy', 'access_review.log'] },
      { id: 'T.AU', name: 'Audit Controls', required: true, evidence: ['audit_chain.log'] },
      { id: 'T.IN', name: 'Integrity', required: true, evidence: ['integrity_audit', 'hash_chain'] },
      { id: 'T.TR', name: 'Person or Entity Authentication', required: true, evidence: ['mfa_log', 'auth_audit'] },
      { id: 'T.TP', name: 'Transmission Security', required: true, evidence: ['tls_audit', 'network_acl'] }
    ]
  }
};

function listSafeguards(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { error: 'TENANT_REQUIRED', ok: false };
  }
  return { ok: true, tenantId: tenantId, categories: SAFEGUARDS };
}

function flatten() {
  const out = [];
  const keys = Object.keys(SAFEGUARDS);
  for (let i = 0; i < keys.length; i++) {
    const cat = SAFEGUARDS[keys[i]];
    const items = cat.items;
    for (let j = 0; j < items.length; j++) {
      out.push({
        category: keys[i],
        id: items[j].id,
        name: items[j].name,
        citation: cat.citation,
        required: items[j].required
      });
    }
  }
  return out;
}

function count() {
  return flatten().length;
}

module.exports = {
  SAFEGUARDS: SAFEGUARDS,
  listSafeguards: listSafeguards,
  flatten: flatten,
  count: count
};
