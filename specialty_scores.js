/**
 * specialty_scores.js — Gate 1 pure clinical score engine for specialty modules.
 *
 * Server-side authority for clinical scores that were previously trusted from the
 * client (spoof risk): Glasgow Coma Scale (GCS), DAS28 (rheumatology disease
 * activity, ESR & CRP variants), and NIHSS (stroke severity). Mirrors the
 * ob_engine.js / nursing_scores.js pattern: pure functions (no I/O, no DB), and
 * fail-CLOSED on incomplete/invalid critical input — returning
 * { ok:false, band:'Incomplete', error } or a null score rather than a falsely
 * reassuring default (a missing GCS component must never silently become 15).
 *
 * محرك حساب الدرجات السريرية للتخصصات (حساب من جهة الخادم — لا يثق بأي "score" من العميل).
 */
'use strict';

/** Parse an integer that must be finite; returns null on any non-numeric/NaN input. */
function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
}

/** Parse a finite number (allows decimals); null on non-numeric/NaN. */
function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ===================== Glasgow Coma Scale (GCS) =====================
// Components: eye 1-4, verbal 1-5, motor 1-6. Total 3-15.
// Bands: 3-8 Severe, 9-12 Moderate, 13-15 Mild.
function gcsBand(total) {
    if (total <= 8) return 'Severe';
    if (total <= 12) return 'Moderate';
    return 'Mild';
}

function computeGCS(input) {
    const fail = (error) => ({ ok: false, total: null, band: 'Incomplete', error });
    if (!input || typeof input !== 'object') return fail('GCS input missing');
    const eye = toInt(input.eye);
    const verbal = toInt(input.verbal);
    const motor = toInt(input.motor);
    if (eye === null || verbal === null || motor === null) {
        return fail('GCS requires eye, verbal and motor components');
    }
    if (eye < 1 || eye > 4) return fail('GCS eye out of range (1-4)');
    if (verbal < 1 || verbal > 5) return fail('GCS verbal out of range (1-5)');
    if (motor < 1 || motor > 6) return fail('GCS motor out of range (1-6)');
    const total = eye + verbal + motor;
    return { ok: true, total, band: gcsBand(total), components: { eye, verbal, motor } };
}

// ===================== DAS28 (Disease Activity Score, 28 joints) =====================
// TJC28/SJC28 in 0-28; GH = patient global health VAS 0-100.
// DAS28-ESR = 0.56*sqrt(TJC28) + 0.28*sqrt(SJC28) + 0.70*ln(ESR) + 0.014*GH  (ESR > 0)
// DAS28-CRP = 0.56*sqrt(TJC28) + 0.28*sqrt(SJC28) + 0.36*ln(CRP+1) + 0.014*GH + 0.96  (CRP >= 0)
// Category: <2.6 Remission, 2.6-3.2 Low, >3.2-5.1 Moderate, >5.1 High.
function das28Category(score) {
    if (score < 2.6) return 'Remission';
    if (score <= 3.2) return 'Low';
    if (score <= 5.1) return 'Moderate';
    return 'High';
}

function validateDas28Common(input) {
    if (!input || typeof input !== 'object') return { error: 'DAS28 input missing' };
    const tjc28 = toInt(input.tjc28);
    const sjc28 = toInt(input.sjc28);
    const gh = toNum(input.gh);
    if (tjc28 === null || sjc28 === null || gh === null) {
        return { error: 'DAS28 requires tjc28, sjc28 and gh (global health)' };
    }
    if (tjc28 < 0 || tjc28 > 28) return { error: 'TJC28 out of range (0-28)' };
    if (sjc28 < 0 || sjc28 > 28) return { error: 'SJC28 out of range (0-28)' };
    if (gh < 0 || gh > 100) return { error: 'GH (global health VAS) out of range (0-100)' };
    return { tjc28, sjc28, gh };
}

function computeDAS28ESR(input) {
    const fail = (error) => ({ ok: false, score: null, category: 'Incomplete', error });
    const base = validateDas28Common(input);
    if (base.error) return fail(base.error);
    const esr = toNum(input.esr);
    if (esr === null) return fail('DAS28-ESR requires esr');
    if (esr <= 0) return fail('ESR must be > 0 (ln undefined otherwise)');
    const raw = 0.56 * Math.sqrt(base.tjc28) + 0.28 * Math.sqrt(base.sjc28)
        + 0.70 * Math.log(esr) + 0.014 * base.gh;
    const score = round2(raw);
    return { ok: true, score, category: das28Category(score), variant: 'ESR' };
}

function computeDAS28CRP(input) {
    const fail = (error) => ({ ok: false, score: null, category: 'Incomplete', error });
    const base = validateDas28Common(input);
    if (base.error) return fail(base.error);
    const crp = toNum(input.crp);
    if (crp === null) return fail('DAS28-CRP requires crp');
    if (crp < 0) return fail('CRP must be >= 0');
    const raw = 0.56 * Math.sqrt(base.tjc28) + 0.28 * Math.sqrt(base.sjc28)
        + 0.36 * Math.log(crp + 1) + 0.014 * base.gh + 0.96;
    const score = round2(raw);
    return { ok: true, score, category: das28Category(score), variant: 'CRP' };
}

// ===================== NIHSS (Stroke Scale) =====================
// 15 standard items with per-item maxima; total 0-42.
// Bands: 0 None, 1-4 Minor, 5-15 Moderate, 16-20 Moderate-Severe, 21-42 Severe.
const NIHSS_ITEM_MAX = {
    loc: 3, loc_questions: 2, loc_commands: 2, gaze: 2, visual: 3, facial: 3,
    arm_left: 4, arm_right: 4, leg_left: 4, leg_right: 4, ataxia: 2, sensory: 2,
    language: 3, dysarthria: 2, extinction: 2,
};

function nihssBand(total) {
    if (total === 0) return 'None';
    if (total <= 4) return 'Minor';
    if (total <= 15) return 'Moderate';
    if (total <= 20) return 'Moderate-Severe';
    return 'Severe';
}

function computeNIHSS(items) {
    const fail = (error) => ({ ok: false, total: null, band: 'Incomplete', error });
    if (!items || typeof items !== 'object') return fail('NIHSS items missing');
    let total = 0;
    for (const key of Object.keys(NIHSS_ITEM_MAX)) {
        const v = toInt(items[key]);
        if (v === null) return fail(`NIHSS item '${key}' missing or non-integer`);
        if (v < 0 || v > NIHSS_ITEM_MAX[key]) {
            return fail(`NIHSS item '${key}' out of range (0-${NIHSS_ITEM_MAX[key]})`);
        }
        total += v;
    }
    return { ok: true, total, band: nihssBand(total) };
}

/** Range-validate a pre-summed NIHSS total (when item-level data is unavailable). */
function validateNIHSSTotal(v) {
    const fail = (error) => ({ ok: false, total: null, band: 'Incomplete', error });
    const n = toInt(v);
    if (n === null) return fail('NIHSS total non-integer');
    if (n < 0 || n > 42) return fail('NIHSS total out of range (0-42)');
    return { ok: true, total: n, band: nihssBand(n) };
}

// ===================== Shared optional-field contract =====================
// Distinguishes ABSENT (undefined/null/'') — allowed, stored NULL — from INVALID
// (garbage / non-integer / out-of-range) — which must 422, never silently coerce.
// Kills the lenient parseInt('12abc')=12 path and the NaN-passes-comparison trap.
function parseOptionalInt(v, min, max, field) {
    if (v === undefined || v === null || v === '') {
        return { provided: false, ok: true, value: null };
    }
    const n = toInt(v);
    if (n === null || n < min || n > max) {
        return { provided: true, ok: false, value: null, error: `${field || 'value'} must be an integer in ${min}-${max}` };
    }
    return { provided: true, ok: true, value: n };
}

// ===================== GCS component validation (partial-friendly) =====================
// Unified semantics for neurology assessments AND emergency trauma: each provided
// component is strictly range-validated; a PARTIAL set is legitimate (e.g. best-motor
// only in rapid trauma) and yields total NULL — honest, never a reassuring default.
// Any invalid provided component fails the whole validation (fail-closed).
const GCS_COMPONENT_RANGES = { eye: [1, 4], verbal: [1, 5], motor: [1, 6] };

function validateGCSComponents(input) {
    const src = input && typeof input === 'object' ? input : {};
    const components = {};
    for (const key of Object.keys(GCS_COMPONENT_RANGES)) {
        const [lo, hi] = GCS_COMPONENT_RANGES[key];
        const p = parseOptionalInt(src[key], lo, hi, `GCS ${key}`);
        if (!p.ok) return { ok: false, complete: false, total: null, band: 'Incomplete', components: null, error: p.error };
        components[key] = p.value;
    }
    const complete = components.eye !== null && components.verbal !== null && components.motor !== null;
    if (!complete) return { ok: true, complete: false, total: null, band: 'Incomplete', components };
    const total = components.eye + components.verbal + components.motor;
    return { ok: true, complete: true, total, band: gcsBand(total), components };
}

// ===================== ICU point totals (server-computed, anti-spoof) =====================
// The icu_assessments table stores POINT values per component; the total is therefore a
// server-side sum — a client-sent sofa_score/apache_ii_score is never trusted. A missing
// component contributes 0 points (cannot fabricate organ failure) but flags incomplete;
// an invalid provided component fails closed.
const SOFA_POINT_FIELDS = { pao2_fio2: 4, platelets: 4, bilirubin: 4, map_vasopressor: 4, gcs: 4, creatinine: 4 };
// APACHE-II simplified point schema: 11 physiologic vars 0-4, creatinine 0-8 (ARF doubling),
// GCS points (15 - GCS) 0-12, age 0-6, chronic health 0-5. Max total = 71.
const APACHE2_POINT_FIELDS = {
    temp: 4, map: 4, hr: 4, rr: 4, pao2: 4, ph: 4, na: 4, k: 4,
    creatinine: 8, hct: 4, wbc: 4, gcs_points: 12, age_points: 6, chronic_points: 5,
};

function sumPointFields(input, fields, label) {
    const src = input && typeof input === 'object' ? input : {};
    let total = 0, providedCount = 0;
    const points = {};
    for (const key of Object.keys(fields)) {
        const p = parseOptionalInt(src[key], 0, fields[key], `${label} ${key}`);
        if (!p.ok) return { ok: false, total: null, complete: false, points: null, error: p.error };
        points[key] = p.value === null ? 0 : p.value;
        if (p.value !== null) { providedCount++; total += p.value; }
    }
    return { ok: true, total, complete: providedCount === Object.keys(fields).length, points };
}

function sumSOFAPoints(input) { return sumPointFields(input, SOFA_POINT_FIELDS, 'SOFA'); }
function sumAPACHE2Points(input) { return sumPointFields(input, APACHE2_POINT_FIELDS, 'APACHE-II'); }

// ===================== APGAR total validation =====================
function validateAPGARTotal(v) {
    const p = parseOptionalInt(v, 0, 10, 'APGAR');
    if (!p.ok) return { ok: false, total: null, error: p.error };
    return { ok: true, total: p.value };
}

// ===================== FEV1/FVC (server-derived ratio) =====================
// The ratio is DERIVED — a client-sent fev1_fvc_ratio is never trusted. Volumes in liters;
// >12 L is implausible for human spirometry. FEV1 > FVC is physiologically inconsistent.
// obstructive_pattern flags ratio < 0.70 (informational, not a diagnosis).
function computeFEV1FVC(fev1, fvc) {
    const fail = (error) => ({ ok: false, ratio: null, error });
    const f1 = toNum(fev1), fv = toNum(fvc);
    if (f1 === null || fv === null) return fail('FEV1/FVC requires both fev1 and fvc');
    if (f1 <= 0 || fv <= 0) return fail('FEV1 and FVC must be positive');
    if (f1 > 12 || fv > 12) return fail('FEV1/FVC volumes implausible (> 12 L)');
    if (f1 > fv) return fail('FEV1 > FVC is physiologically inconsistent');
    const ratio = round2(f1 / fv);
    return { ok: true, ratio, obstructive_pattern: ratio < 0.70 };
}

module.exports = {
    computeGCS, gcsBand, validateGCSComponents,
    computeDAS28ESR, computeDAS28CRP, das28Category,
    computeNIHSS, validateNIHSSTotal, nihssBand,
    NIHSS_ITEM_MAX,
    parseOptionalInt,
    sumSOFAPoints, sumAPACHE2Points,
    validateAPGARTotal,
    computeFEV1FVC,
};
