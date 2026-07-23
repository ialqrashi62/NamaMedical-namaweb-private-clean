// utils/clinical_utils.js
// Shared clinical utility functions used by engines/* modules.
// Stub implementation: provides safe defaults so engines/pulmonology_engine.js
// and any future engines can destructure helpers without runtime errors.
// Real clinical helpers should be added here per use case.

'use strict';

const clinical_utils = {
    // Numeric helpers
    isNumber: (v) => typeof v === 'number' && !isNaN(v),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    round: (v, decimals = 2) => {
        const f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    },
    // Validation helpers
    requireFields: (obj, fields) => {
        const missing = fields.filter(f => obj[f] == null);
        if (missing.length) throw new Error('Missing required field(s): ' + missing.join(', '));
    },
    // Severity scale
    severityRank: { low: 0, moderate: 1, high: 2, critical: 3 },
    // PHI / safety constants
    PHI_LOG_REDACT: true,
    MAX_DOSE_CHECK_DEFAULT: true
};

module.exports = clinical_utils;
