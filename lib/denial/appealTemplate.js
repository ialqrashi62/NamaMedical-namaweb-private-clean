// lib/denial/appealTemplate.js
// Appeal letter templates by denial category (P18).
// Placeholder-substitution only — no PHI (RAIL-12).
// Stored as plain text + suggested document checklist per category.

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DenialAppeals = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var TEMPLATES = {
    medical_necessity: {
      subject: 'Appeal — Medical Necessity Review (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Date of Service: {{dateOfService}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'We are writing to formally appeal the denial of the above claim, which',
        'was denied for medical necessity. The services rendered were clinically',
        'indicated and supported by peer-reviewed evidence and the patient\'s',
        'documented clinical condition.',
        '',
        'Clinical Rationale:',
        '{{clinicalRationale}}',
        '',
        'We respectfully request that the denial be overturned. Supporting',
        'documentation is attached as listed in the checklist below.',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Physician letter of medical necessity',
        'Relevant progress notes and history',
        'Imaging / lab / diagnostic results',
        'Peer-reviewed clinical guidelines cited',
        'Prior authorization documentation (if any)'
      ]
    },
    eligibility: {
      subject: 'Appeal — Missing Information / Eligibility (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'The denial cites missing information. Please find the requested data',
        'attached. We respectfully request reprocessing of this claim.',
        '',
        'Information Provided:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Corrected UB-04 / CMS-1500',
        'Copy of insurance card (front and back)',
        'Eligibility response from payer portal',
        'Registration worksheet'
      ]
    },
    bundling: {
      subject: 'Appeal — Bundling Edit Review (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'We are appealing the bundling edit applied to this claim. The services',
        'in question are separately reportable per NCCI / payer policy because',
        'they are:',
        '{{clinicalRationale}}',
        '',
        'We request re-adjudication with appropriate modifier application:',
        '  {{modifierRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'NCCI edit lookup',
        'Operative report (if procedure)',
        'Documentation supporting separate service',
        'Modifier rationale (e.g. -59, -XE, -XS, -XU)'
      ]
    },
    time_limit: {
      subject: 'Final Notice — Timely Filing Denial (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'We acknowledge this denial on the basis of timely filing limits. We are',
        'providing the following proof-of-timely-submission documentation as',
        'justification for reopening the claim:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Clearinghouse acknowledgement receipt',
        'Certified mail / fax confirmation',
        'Payer portal submission screenshot',
        'Original claim submission timestamp'
      ]
    },
    coverage: {
      subject: 'Appeal — Coverage Determination (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'We respectfully appeal the determination that the service is not a',
        'covered benefit. The patient\'s plan documents the following benefit:',
        '{{clinicalRationale}}',
        '',
        'We request that the claim be reprocessed under the appropriate plan',
        'benefit and that payment be issued.',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Plan benefit document excerpt',
        'Summary plan description (SPD)',
        'Prior EOB showing similar payment pattern'
      ]
    },
    precertification: {
      subject: 'Appeal — Retro-Authorization Review (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'Authorization could not be obtained in advance because the patient',
        'presented emergently and stabilization of an emergency medical',
        'condition took priority. We respectfully request retro-authorization',
        'under the emergency-services provision.',
        '',
        'Clinical Justification:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'ED triage and progress notes',
        'Emergency screening determination',
        'Admission order / discharge summary',
        'Reason for delay in authorization request'
      ]
    },
    coordination_of_benefits: {
      subject: 'Appeal — Coordination of Benefits (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'We have attached the primary payer EOB confirming adjudication of the',
        'claim. The remaining balance is the patient responsibility and is',
        'appropriately billable to the secondary payer.',
        '',
        'EOB Summary:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Primary payer EOB',
        'Remittance advice showing patient responsibility',
        'Copy of both insurance cards'
      ]
    },
    duplicate_claim: {
      subject: 'Appeal — Duplicate Claim Determination (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'Please review the attached documentation confirming these are distinct',
        'services with different dates of service or providers:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Detailed line-item breakdown',
        'Date-of-service confirmation',
        'Provider NPI validation (if different providers)'
      ]
    },
    deductible: {
      subject: 'Notice — Patient Responsibility / Deductible (Claim {{claimId}})',
      body: [
        'To: {{patientName}} – Billing Department',
        'Re: Account {{claimId}}',
        '',
        'This claim was applied to your insurance deductible. The amount of',
        '{{amount}} is now your responsibility. Please remit payment or contact',
        'our billing office to set up a payment plan.'
      ].join('\n'),
      checklist: [
        'EOB from payer',
        'Patient statement',
        'Balance-transfer record to patient AR'
      ]
    },
    coinsurance: {
      subject: 'Notice — Patient Responsibility / Coinsurance (Claim {{claimId}})',
      body: [
        'To: {{patientName}} – Billing Department',
        'Re: Account {{claimId}}',
        '',
        'Your insurance has processed this claim. The coinsurance portion of',
        '{{amount}} is your responsibility. Please remit payment.'
      ].join('\n'),
      checklist: [
        'EOB from payer',
        'Patient statement'
      ]
    },
    expenses_incurred: {
      subject: 'Appeal — Coverage Termination Review (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Appeals Department',
        'Re: Patient {{patientRef}} / Claim {{claimId}}',
        'Denial Code: {{denialCode}} ({{denialCategory}})',
        '',
        'Dear Appeals Reviewer,',
        '',
        'The dates of service on this claim fall within the patient\'s active',
        'coverage period. Documentation confirming eligibility on the date of',
        'service is attached:',
        '{{clinicalRationale}}',
        '',
        'Sincerely,',
        '{{submitterName}}, {{submitterRole}}'
      ].join('\n'),
      checklist: [
        'Eligibility confirmation on date of service',
        'Premium payment history',
        'Disenrollment / termination letters (if any)'
      ]
    },
    not_covered_by_payer: {
      subject: 'Final Notice — Service Not Covered (Claim {{claimId}})',
      body: [
        'To: {{payerName}} – Billing Department',
        'Re: Account {{claimId}}',
        '',
        'This claim was denied as non-covered. The patient has been notified',
        'of their financial responsibility.'
      ].join('\n'),
      checklist: [
        'Patient notice of non-coverage',
        'Patient AR transfer record'
      ]
    }
  };

  var _DEFAULT_TEMPLATE = {
    subject: 'Appeal Letter (Claim {{claimId}})',
    body: [
      'To: {{payerName}} – Appeals Department',
      'Re: Patient {{patientRef}} / Claim {{claimId}}',
      'Denial Code: {{denialCode}} ({{denialCategory}})',
      '',
      'Dear Appeals Reviewer,',
      '',
      '{{clinicalRationale}}',
      '',
      'Sincerely,',
      '{{submitterName}}, {{submitterRole}}'
    ].join('\n'),
    checklist: [
      'EOB / denial letter',
      'Relevant clinical documentation'
    ]
  };

  function _safe(v) {
    if (v === undefined || v === null) return '';
    return String(v);
  }

  function _fill(tpl, vars) {
    var out = tpl;
    for (var k in vars) {
      if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
      var v = _safe(vars[k]);
      out = out.split('{{' + k + '}}').join(v);
    }
    return out;
  }

  function forCategory(category, vars) {
    var tmpl = TEMPLATES[category] || _DEFAULT_TEMPLATE;
    var merged = {
      claimId: '',
      patientRef: '',
      payerName: '',
      denialCode: '',
      denialCategory: category || '',
      dateOfService: '',
      clinicalRationale: '',
      modifierRationale: '',
      submitterName: '',
      submitterRole: '',
      patientName: '',
      amount: '0.00'
    };
    if (vars && typeof vars === 'object') {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) merged[k] = vars[k];
      }
    }
    return {
      subject: _fill(tmpl.subject, merged),
      body: _fill(tmpl.body, merged),
      checklist: Array.isArray(tmpl.checklist) ? tmpl.checklist.slice() : []
    };
  }

  function mergeCustom(base, customText) {
    var out = { subject: base.subject, body: base.body, checklist: base.checklist.slice() };
    if (!customText || typeof customText !== 'string') return out;
    var trimmed = customText.trim();
    if (!trimmed) return out;
    out.body = out.body + '\n\n--- Additional Notes ---\n' + trimmed;
    return out;
  }

  function listCategories() {
    var out = [];
    for (var k in TEMPLATES) {
      if (Object.prototype.hasOwnProperty.call(TEMPLATES, k)) out.push(k);
    }
    return out.sort();
  }

  return {
    TEMPLATES: TEMPLATES,
    forCategory: forCategory,
    mergeCustom: mergeCustom,
    listCategories: listCategories
  };
});
