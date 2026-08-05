'use strict';
// Legal & Compliance Docs — generates templates for: PDPL consent, HIPAA BAA,
// NDAs, Terms of Service, Privacy Policy.

class LegalDocs {
  constructor() {
    this.docs = {};
  }

  add(name, content) {
    this.docs[name] = content;
  }

  pdplConsent({ tenantName, lang = 'ar-SA' }) {
    if (lang === 'ar-SA') return `نموذج موافقة (PDPL) — ${tenantName}\n\nيمنح المريض موافقته على معالجة بياناته الصحية وفقاً لنظام حماية البيانات الشخصية.`;
    return `PDPL Consent — ${tenantName}\n\nPatient consents to processing of health data per Saudi PDPL.`;
  }

  hipaaBAA({ coveredEntity, baName }) {
    return `Business Associate Agreement (HIPAA).\n\nBetween ${coveredEntity} (CE) and ${baName} (BA).`;
  }

  nda({ party1, party2, jurisdiction = 'KSA' }) {
    return `Non-Disclosure Agreement in ${jurisdiction}.\n\nBetween ${party1} and ${party2}.`;
  }

  termsOfService(opts = {}) {
    const companyName = opts.companyName || 'NamaMedical';
    return `Terms of Service for ${companyName}. Use of this service is governed by Saudi law.`;
  }

  list() { return Object.keys(this.docs); }
}

module.exports = { LegalDocs };
