// lib/denial/classifier.js
// Denial-code classifier (P18).
// 18 standard CARC/RARC codes → category + appealability + suggested action.
// Pure JS, no npm install, no PHI in error messages (RAIL-12).

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DenialClassifier = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  var DENIAL_CODES = {
    'CO-16':  { category: 'eligibility',             description: 'Claim/service lacks information',                              appealable: true  },
    'CO-18':  { category: 'duplicate_claim',          description: 'Exact duplicate claim/service',                                 appealable: true  },
    'CO-22':  { category: 'coordination_of_benefits', description: 'This care may be covered by another payer',                     appealable: true  },
    'CO-29':  { category: 'time_limit',              description: 'Time limit for filing has expired',                             appealable: false },
    'CO-50':  { category: 'medical_necessity',        description: 'Non-covered services / medical necessity',                      appealable: true  },
    'CO-96':  { category: 'bundling',                 description: 'Non-covered charges',                                          appealable: true  },
    'CO-97':  { category: 'bundling',                 description: 'Service bundled into another payment',                         appealable: true  },
    'CO-109': { category: 'coverage',                description: 'Claim not covered by this payer',                               appealable: true  },
    'CO-197': { category: 'precertification',         description: 'Precertification / authorization absent',                       appealable: true  },
    'CO-204': { category: 'coverage',                description: 'Service/equipment not covered',                                 appealable: true  },
    'PR-1':   { category: 'deductible',              description: 'Deductible amount',                                            appealable: false },
    'PR-2':   { category: 'coinsurance',             description: 'Coinsurance amount',                                           appealable: false },
    'PR-27':  { category: 'expenses_incurred',       description: 'Expenses incurred after coverage terminated',                   appealable: true  },
    'PR-204': { category: 'coverage',                description: 'Service not covered under patient plan',                        appealable: true  },
    'OA-23':  { category: 'coordination_of_benefits',description: 'Primary payer already paid',                                   appealable: true  },
    'OA-109': { category: 'not_covered_by_payer',    description: 'Claim not covered by this payer (informational)',              appealable: false },
    'OA-18':  { category: 'duplicate_claim',         description: 'Exact duplicate claim/service (informational)',                appealable: false },
    'OA-22':  { category: 'coordination_of_benefits',description: 'Care may be covered by another payer (informational)',         appealable: true  }
  };

  // Suggested workflow action per category.
  var SUGGESTED_ACTIONS = {
    eligibility:             'request_missing_info',
    duplicate_claim:         'merge_or_resubmit',
    coordination_of_benefits:'attach_primary_eob',
    time_limit:              'close_write_off',
    medical_necessity:       'appeal_with_clinical_notes',
    bundling:                'appeal_modifier_review',
    coverage:                'appeal_policy_citation',
    precertification:        'retro_authorization_review',
    deductible:              'bill_patient',
    coinsurance:             'bill_patient',
    expenses_incurred:       'appeal_with_dates_of_service',
    not_covered_by_payer:    'close_write_off'
  };

  function _norm(code) {
    if (!code || typeof code !== 'string') return '';
    return code.toUpperCase().trim();
  }

  function classify(denialCode) {
    var k = _norm(denialCode);
    if (!k) {
      return { code: null, category: 'unknown', description: 'Unknown denial code', appealable: false, known: false };
    }
    var entry = DENIAL_CODES[k];
    if (!entry) {
      return { code: k, category: 'unknown', description: 'Unmapped denial code: ' + k, appealable: true, known: false };
    }
    return {
      code: k,
      category: entry.category,
      description: entry.description,
      appealable: !!entry.appealable,
      known: true
    };
  }

  function isAppealable(denialCode) {
    if (!denialCode) return false;
    var info = classify(denialCode);
    return !!info.appealable;
  }

  function suggestedAction(denialCode) {
    if (!denialCode) return 'manual_review';
    var info = classify(denialCode);
    if (!info.known) return 'manual_review';
    return SUGGESTED_ACTIONS[info.category] || 'manual_review';
  }

  function listCodes() {
    var out = [];
    for (var k in DENIAL_CODES) {
      if (Object.prototype.hasOwnProperty.call(DENIAL_CODES, k)) out.push(k);
    }
    return out.sort();
  }

  function listCategories() {
    var seen = {};
    var out = [];
    for (var k in DENIAL_CODES) {
      if (!Object.prototype.hasOwnProperty.call(DENIAL_CODES, k)) continue;
      var c = DENIAL_CODES[k].category;
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out.sort();
  }

  return {
    DENIAL_CODES: DENIAL_CODES,
    SUGGESTED_ACTIONS: SUGGESTED_ACTIONS,
    classify: classify,
    isAppealable: isAppealable,
    suggestedAction: suggestedAction,
    listCodes: listCodes,
    listCategories: listCategories
  };
});
