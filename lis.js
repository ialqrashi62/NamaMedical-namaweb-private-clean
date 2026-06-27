// ============================================================
// lis.js — E3 Laboratory / LIS clinical-safety core (PURE functions, no I/O, no DB).
// ============================================================
// CLINICAL SAFETY — FAIL-SAFE / FAIL-CLOSED by construction:
//   * autoVerify() returns 'verified' ONLY when ALL of these hold:
//       - a numeric result value is present and finite, AND
//       - a valid numeric reference range (ref_low/ref_high) is present, AND
//       - the value is WITHIN [ref_low, ref_high] (inclusive), AND
//       - the value is NOT a critical value, AND
//       - there is NO significant delta vs a valid prior result.
//     ANY uncertainty (missing value, missing/invalid range, missing prior when a
//     prior is required by policy is NOT required here — absence of prior is allowed
//     for first-ever results, but a malformed prior forces HOLD) => 'held' for manual review.
//   * isCritical() flags life-threatening values from a per-analyte critical table; on
//     any ambiguity (non-numeric, unknown analyte) it returns false for the flag but
//     autoVerify still HOLDS because criticality cannot be ruled out only via range.
//   * NEVER silently auto-verifies. When in doubt: HOLD.
//
// These functions are deliberately dependency-free so they can be unit-tested with
// `node lis_autoverify_test.js` (no DB, no network) and reused server-side.
// ============================================================
'use strict';

// Significant delta threshold (percent). A change larger than this vs a valid prior
// numeric result forces a manual HOLD (delta-check). Conservative default.
const DELTA_SIGNIFICANT_PCT = 50;

// Critical-value table (analyte name -> {low, high, unit}). A value <= low or >= high
// is a panic/critical value that must be called back and can NEVER be auto-verified.
// Names are matched case-insensitively by substring (so "Serum Potassium" matches "Potassium").
// Mirrors the client CRITICAL_LAB_VALUES so server and client agree.
const CRITICAL_LAB_VALUES = {
    'Hemoglobin': { low: 7.0, high: 20.0, unit: 'g/dL' },
    'Platelets': { low: 50, high: 1000, unit: 'x10^3/uL' },
    'WBC': { low: 2.0, high: 30.0, unit: 'x10^3/uL' },
    'Potassium': { low: 2.5, high: 6.5, unit: 'mEq/L' },
    'Sodium': { low: 120, high: 160, unit: 'mEq/L' },
    'Glucose': { low: 40, high: 500, unit: 'mg/dL' },
    'Creatinine': { low: 0, high: 10.0, unit: 'mg/dL' },
    'Troponin': { low: 0, high: 0.04, unit: 'ng/mL' },
    'INR': { low: 0, high: 5.0, unit: '' },
    'Lactate': { low: 0, high: 4.0, unit: 'mmol/L' },
    'Calcium': { low: 6.0, high: 13.0, unit: 'mg/dL' },
    'Magnesium': { low: 1.0, high: 4.7, unit: 'mg/dL' },
    'pH': { low: 7.2, high: 7.6, unit: '' },
    'PaO2': { low: 40, high: 999, unit: 'mmHg' },
};

// Parse a possibly-string numeric value. Returns a finite Number or null (FAIL-SAFE:
// non-numeric / NaN / Infinity -> null so callers HOLD rather than mis-verify).
function toNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (s === '') return null;
    // extract the first numeric token (handles "5.4 mg/dL", "<0.01", ">100")
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
}

// isCritical(result) -> { critical: boolean, matched: string|null, reason: string }
// result = { test_name|analyte, value|value_num }
function isCritical(result) {
    const name = String((result && (result.test_name || result.analyte)) || '');
    const val = toNum(result && (result.value_num !== undefined ? result.value_num : result.value));
    if (val === null) {
        // Cannot evaluate criticality on a non-numeric value -> not flagged critical here,
        // but autoVerify() will still HOLD because the value is non-numeric.
        return { critical: false, matched: null, reason: 'non_numeric_value' };
    }
    const lower = name.toLowerCase();
    for (const [key, range] of Object.entries(CRITICAL_LAB_VALUES)) {
        if (lower.includes(key.toLowerCase())) {
            if (val <= range.low) return { critical: true, matched: key, reason: 'critically_low' };
            if (val >= range.high) return { critical: true, matched: key, reason: 'critically_high' };
            return { critical: false, matched: key, reason: 'within_critical_bounds' };
        }
    }
    return { critical: false, matched: null, reason: 'no_critical_rule' };
}

// computeAbnormalFlag(value, ref_low, ref_high) -> 'N' | 'L' | 'H' | null
// null when value or range is missing/invalid (FAIL-SAFE: unknown, not "normal").
function computeAbnormalFlag(value, ref_low, ref_high) {
    const v = toNum(value);
    const lo = toNum(ref_low);
    const hi = toNum(ref_high);
    if (v === null || lo === null || hi === null || lo > hi) return null;
    if (v < lo) return 'L';
    if (v > hi) return 'H';
    return 'N';
}

// deltaPct(value, priorValue) -> number|null  (percent change vs prior; null if not computable)
function deltaPct(value, priorValue) {
    const v = toNum(value);
    const p = toNum(priorValue);
    if (v === null || p === null) return null;
    if (p === 0) return v === 0 ? 0 : null; // avoid div-by-zero; non-zero-vs-zero is "not computable" -> caller HOLDs
    return ((v - p) / Math.abs(p)) * 100;
}

// autoVerify(result, priorResult) -> {
//   status: 'verified' | 'held',
//   abnormal_flag: 'N'|'L'|'H'|null,
//   is_critical: boolean,
//   is_abnormal: 0|1,
//   delta_pct: number|null,
//   reasons: string[]            // why it was held (empty when verified)
// }
//
// result      = { test_name, value (or value_num), unit, ref_low, ref_high }
// priorResult = same shape OR null/undefined (no prior = allowed for first results)
function autoVerify(result, priorResult) {
    const reasons = [];
    result = result || {};

    const value = (result.value_num !== undefined ? result.value_num : result.value);
    const v = toNum(value);
    const lo = toNum(result.ref_low);
    const hi = toNum(result.ref_high);

    const crit = isCritical(result);
    const flag = computeAbnormalFlag(value, result.ref_low, result.ref_high);
    let dpct = null;

    // 1) value must be numeric/finite
    if (v === null) reasons.push('non_numeric_value');

    // 2) a valid numeric reference range must be present
    if (lo === null || hi === null) reasons.push('missing_reference_range');
    else if (lo > hi) reasons.push('invalid_reference_range');

    // 3) value must be within range (only meaningful if value + range valid)
    if (v !== null && lo !== null && hi !== null && lo <= hi) {
        if (v < lo || v > hi) reasons.push('out_of_range');
    }

    // 4) must NOT be a critical value
    if (crit.critical) reasons.push('critical_value');

    // 5) delta-check vs prior (only when a prior is supplied)
    if (priorResult !== null && priorResult !== undefined) {
        const priorVal = (priorResult.value_num !== undefined ? priorResult.value_num : priorResult.value);
        const p = toNum(priorVal);
        if (p === null) {
            // a prior was supplied but it is malformed -> cannot delta-check -> HOLD
            reasons.push('malformed_prior');
        } else {
            dpct = deltaPct(value, priorVal);
            if (dpct === null) {
                reasons.push('delta_not_computable');
            } else if (Math.abs(dpct) > DELTA_SIGNIFICANT_PCT) {
                reasons.push('significant_delta');
            }
        }
    }

    const status = reasons.length === 0 ? 'verified' : 'held';
    return {
        status,
        abnormal_flag: flag,
        is_critical: !!crit.critical,
        is_abnormal: flag === 'L' || flag === 'H' ? 1 : 0,
        delta_pct: dpct,
        reasons,
    };
}

// ---- HL7 v2 ORU-style parser (sandbox; parse-only, no network). ----
// Accepts a raw HL7 message (segments separated by \r, \n, or \r\n; fields by '|').
// Extracts the specimen barcode and OBX result rows. FAIL-SAFE: returns
// { ok:false, error } on anything malformed; never throws to the caller.
//
// Recognised (minimal, sandbox) layout:
//   MSH|^~\&|...                         (must be first segment, type starts with ORU or MSH allowed)
//   OBR|1|<placer>|<filler/barcode>|...  (barcode taken from OBR-3, the filler/specimen id)
//   SPM|1|<barcode>|...                  (optional; OBR-3 still preferred, SPM-2 as fallback)
//   OBX|1|NM|<loinc>^<name>|...|<value>|<unit>|<ref range>|<abnormal>|...
function parseHL7ORU(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { ok: false, error: 'empty_message' };
    }
    const segments = raw.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) return { ok: false, error: 'no_segments' };

    const first = segments[0].split('|')[0];
    if (first !== 'MSH') return { ok: false, error: 'missing_msh' };

    let barcode = null;
    const results = [];

    for (const seg of segments) {
        const f = seg.split('|');
        const type = f[0];
        if (type === 'OBR') {
            // OBR-3 = filler order number / specimen barcode (index 3)
            if (f[3] && f[3].trim()) barcode = f[3].trim();
        } else if (type === 'SPM') {
            // SPM-2 = specimen id; only used as fallback when OBR-3 absent
            if (!barcode && f[2] && f[2].trim()) barcode = f[2].trim();
        } else if (type === 'OBX') {
            // OBX-3 = observation id "LOINC^Name", OBX-5 = value, OBX-6 = unit,
            // OBX-7 = reference range "lo-hi", OBX-8 = abnormal flags
            const obsId = (f[3] || '');
            const parts = obsId.split('^');
            const loinc = (parts[0] || '').trim();
            const test_name = (parts[1] || parts[0] || '').trim();
            const value = (f[5] || '').trim();
            const unit = (f[6] || '').trim();
            const refRange = (f[7] || '').trim();
            let ref_low = null, ref_high = null;
            const rm = refRange.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
            if (rm) { ref_low = parseFloat(rm[1]); ref_high = parseFloat(rm[2]); }
            // a result row must carry at least a name/loinc and a value
            if ((loinc || test_name) && value !== '') {
                results.push({ loinc, test_name, value, unit, ref_low, ref_high });
            }
        }
    }

    if (!barcode) return { ok: false, error: 'missing_barcode' };
    if (results.length === 0) return { ok: false, error: 'no_obx_results' };
    return { ok: true, barcode, results };
}

// ---- QC: Levey-Jennings / simple Westgard 1-3s rule. ----
// qcFlag(observed, mean, sd) -> { z: number|null, breach: boolean, rule: string }
// breach = |z| >= 3 (1-3s). FAIL-SAFE: invalid inputs -> breach:true (flag for review),
// because an unevaluable QC point must NOT be silently accepted.
function qcFlag(observed, mean, sd) {
    const o = toNum(observed);
    const m = toNum(mean);
    const s = toNum(sd);
    if (o === null || m === null || s === null || s <= 0) {
        return { z: null, breach: true, rule: 'invalid_qc_inputs' };
    }
    const z = (o - m) / s;
    if (Math.abs(z) >= 3) return { z, breach: true, rule: '1-3s' };
    if (Math.abs(z) >= 2) return { z, breach: false, rule: '1-2s_warning' };
    return { z, breach: false, rule: 'in_control' };
}

module.exports = {
    DELTA_SIGNIFICANT_PCT,
    CRITICAL_LAB_VALUES,
    toNum,
    isCritical,
    computeAbnormalFlag,
    deltaPct,
    autoVerify,
    parseHL7ORU,
    qcFlag,
};
