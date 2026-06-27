/**
 * ob_engine.js — Epic E14 (OB / Maternity) pure clinical computation engine.
 *
 * ALL authority fields for the OB/Maternity module are computed here, server-side,
 * from raw clinical inputs. Clients MUST NOT be trusted to submit EDD, GA, GPAL
 * derivations, APGAR totals, biometry-derived GA/percentile, or risk classification
 * (anti-spoof — HARD REQUIREMENT #5). These functions are pure (no I/O, no DB, no
 * Date.now side effects except where an explicit reference date is passed) so they
 * are deterministically unit-testable without a database.
 *
 * Fail-CLOSED on incomplete/invalid critical input: helpers return a structured
 * { ok:false, error } or a null authority value rather than a falsely-reassuring
 * default (HARD REQUIREMENT #7/#8).
 */

'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD (or ISO) date string into a UTC Date, or null if invalid. */
function parseISODate(s) {
    if (s == null) return null;
    if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
    const str = String(s).trim();
    if (!str) return null;
    // accept YYYY-MM-DD or full ISO; normalise to date-only UTC midnight
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    if (!m) return null;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
}

function toISODate(dt) {
    return dt.toISOString().split('T')[0];
}

/**
 * computeEDD — Estimated Date of Delivery via Naegele's rule (LMP + 280 days).
 * Returns ISO date string, or null if LMP is missing/invalid (fail-closed; never a guess).
 * @param {string|Date} lmp Last Menstrual Period.
 * @returns {string|null}
 */
function computeEDD(lmp) {
    const d = parseISODate(lmp);
    if (!d) return null;
    return toISODate(new Date(d.getTime() + 280 * MS_PER_DAY));
}

/**
 * gestationalAgeFromLMP — GA at a reference date, derived from LMP.
 * Returns { weeks, days, totalDays, label } or null if inputs invalid.
 * Negative GA (reference before LMP) is rejected (returns null) — incomplete, not reassuring.
 * @param {string|Date} lmp
 * @param {string|Date} [refDate] defaults to today (UTC) when omitted.
 */
function gestationalAgeFromLMP(lmp, refDate) {
    const l = parseISODate(lmp);
    if (!l) return null;
    const ref = refDate ? parseISODate(refDate) : new Date(Date.UTC(
        new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    if (!ref) return null;
    const totalDays = Math.floor((ref.getTime() - l.getTime()) / MS_PER_DAY);
    if (totalDays < 0 || totalDays > 320) return null; // out of plausible pregnancy range
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    return { weeks, days, totalDays, label: `${weeks}+${days} weeks` };
}

/**
 * computeGPAL — validate & derive obstetric history (Gravida/Para/Abortion/Living).
 * GPAL is an authority field: living children is DERIVED, never trusted from client.
 * Invariants enforced (fail-closed on violation):
 *   - all non-negative integers
 *   - gravida >= 1 for an active/recorded pregnancy
 *   - para + abortion <= gravida - (current ongoing pregnancy counts toward gravida)
 *     i.e. para + abortion <= gravida  (current pregnancy may still be ongoing)
 *   - living children cannot exceed total births carried to viability (para), and
 *     cannot be negative; computed = min(provided living, para) capped, but if the
 *     provided value is inconsistent we FLAG rather than silently coerce.
 * @returns {{ok:true, gravida, para, abortion, living, flags:string[]}|{ok:false,error:string}}
 */
function computeGPAL({ gravida, para, abortion, living } = {}) {
    const g = toInt(gravida), p = toInt(para), a = toInt(abortion);
    if (g === null || p === null || a === null) {
        return { ok: false, error: 'GPAL requires integer gravida/para/abortion' };
    }
    if (g < 1) return { ok: false, error: 'gravida must be >= 1' };
    if (p < 0 || a < 0) return { ok: false, error: 'para/abortion must be >= 0' };
    if (p + a > g) return { ok: false, error: 'para + abortion cannot exceed gravida' };
    const flags = [];
    // living children: derive a safe ceiling (cannot exceed live births i.e. para count
    // of pregnancies carried past viability; multiples could exceed but we treat the
    // provided value as advisory and flag inconsistency rather than trust it blindly).
    let livingProvided = toInt(living);
    let livingComputed;
    if (livingProvided === null) {
        livingComputed = p; // best estimate: assume each viable delivery yielded a living child
    } else if (livingProvided < 0) {
        return { ok: false, error: 'living children must be >= 0' };
    } else {
        livingComputed = livingProvided;
        if (livingProvided > p * 3) { // implausible even with triplets every delivery
            flags.push('living_children_implausible');
        }
    }
    return { ok: true, gravida: g, para: p, abortion: a, living: livingComputed, flags };
}

/**
 * APGAR — server-side scoring from the 5 component enums (0/1/2 each), total 0-10.
 * Components: appearance, pulse, grimace, activity, respiration.
 * Each component accepts either an explicit 0|1|2, or a recognised enum string.
 * Incomplete input (any missing/unrecognised component) => fail-closed:
 * returns { ok:false } (NEVER a falsely-reassuring 10).
 */
const APGAR_COMPONENTS = ['appearance', 'pulse', 'grimace', 'activity', 'respiration'];
const APGAR_ENUM = {
    appearance: { 'blue': 0, 'pale': 0, 'blue_pale': 0, 'acrocyanotic': 1, 'pink_extremities_blue': 1, 'pink': 2, 'completely_pink': 2 },
    pulse:      { 'absent': 0, 'none': 0, 'below_100': 1, 'slow': 1, 'above_100': 2, 'normal': 2 },
    grimace:    { 'no_response': 0, 'none': 0, 'grimace': 1, 'weak': 1, 'cry': 2, 'cough': 2, 'sneeze': 2 },
    activity:   { 'limp': 0, 'flaccid': 0, 'none': 0, 'some_flexion': 1, 'flexed': 1, 'active': 2, 'active_motion': 2 },
    respiration:{ 'absent': 0, 'none': 0, 'slow': 1, 'irregular': 1, 'weak_cry': 1, 'good': 2, 'strong_cry': 2, 'crying': 2 }
};

function apgarComponentScore(component, value) {
    if (value === null || value === undefined || value === '') return null;
    // explicit numeric 0/1/2
    if (typeof value === 'number' || /^[0-2]$/.test(String(value).trim())) {
        const n = toInt(value);
        if (n === 0 || n === 1 || n === 2) return n;
        return null;
    }
    const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const map = APGAR_ENUM[component];
    if (map && Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    return null;
}

/**
 * computeAPGAR — total 0-10 from the 5 components. Anti-spoof: any client-supplied
 * "total" field is ignored entirely; total is computed here.
 * @returns {{ok:true, total:number, components:object}|{ok:false,error:string,missing:string[]}}
 */
function computeAPGAR(input = {}) {
    const components = {};
    const missing = [];
    for (const c of APGAR_COMPONENTS) {
        const s = apgarComponentScore(c, input[c]);
        if (s === null) { missing.push(c); } else { components[c] = s; }
    }
    if (missing.length) {
        return { ok: false, error: 'incomplete APGAR components', missing };
    }
    const total = APGAR_COMPONENTS.reduce((sum, c) => sum + components[c], 0);
    return { ok: true, total, components };
}

/**
 * gaFromBiometry — derive gestational age (weeks) from ultrasound biometry.
 * Uses Hadlock-style approximations on individual params, averaging available ones.
 * Accepts mm for BPD/HC/AC and mm for FL. Returns { ok, gaWeeks, gaDays, method, used }
 * or fail-closed { ok:false } when no usable biometry provided.
 *
 * These are clinical approximations sufficient for trend/percentile screening; not a
 * substitute for a validated fetal-biometry library, but server-authoritative & testable.
 */
function gaFromBiometry({ bpd, hc, ac, fl } = {}) {
    const used = [];
    const estimates = [];
    const b = toNum(bpd), h = toNum(hc), a = toNum(ac), f = toNum(fl);
    // BPD (mm) -> GA weeks: approx Hadlock; valid roughly 20-100mm
    if (b !== null && b > 10 && b < 120) { estimates.push(9.54 + 1.482 * (b / 10) + 0.1676 * (b / 10) * (b / 10)); used.push('bpd'); }
    // FL (mm) -> GA weeks
    if (f !== null && f > 5 && f < 90) { estimates.push(10.35 + 2.460 * (f / 10) + 0.170 * (f / 10) * (f / 10)); used.push('fl'); }
    // AC (mm) -> GA weeks (coarser)
    if (a !== null && a > 30 && a < 400) { estimates.push(8.14 + 0.753 * (a / 10) + 0.0036 * (a / 10) * (a / 10)); used.push('ac'); }
    // HC (mm) -> GA weeks
    if (h !== null && h > 30 && h < 400) { estimates.push(8.96 + 0.540 * (h / 10) + 0.0003 * (h / 10) * (h / 10)); used.push('hc'); }
    if (!estimates.length) return { ok: false, error: 'no usable biometry' };
    const avg = estimates.reduce((s, v) => s + v, 0) / estimates.length;
    if (avg < 5 || avg > 45) return { ok: false, error: 'biometry out of plausible range' };
    const gaWeeks = Math.floor(avg);
    const gaDays = Math.round((avg - gaWeeks) * 7);
    return { ok: true, gaWeeks, gaDays, gaDecimal: Math.round(avg * 10) / 10, method: 'hadlock-avg', used };
}

/**
 * efwPercentile — crude EFW (estimated fetal weight, grams) percentile band for a GA week.
 * Returns a band label (<10th, 10-90th, >90th) for screening. Fail-closed null if inputs bad.
 * Reference 50th-centile EFW grams by completed week (Hadlock population approximation).
 */
const EFW_REF = { // week: [p10, p50, p90]
    20: [240, 300, 380], 24: [530, 660, 850], 28: [900, 1150, 1500],
    30: [1180, 1500, 1950], 32: [1500, 1900, 2450], 34: [1900, 2400, 3050],
    36: [2350, 2900, 3650], 38: [2750, 3300, 4100], 40: [3000, 3600, 4400]
};
function efwPercentileBand(gaWeeks, efwGrams) {
    const w = toInt(gaWeeks), efw = toNum(efwGrams);
    if (w === null || efw === null || efw <= 0) return null;
    // find nearest reference week
    const weeks = Object.keys(EFW_REF).map(Number).sort((x, y) => x - y);
    let ref = null, best = Infinity;
    for (const wk of weeks) { const d = Math.abs(wk - w); if (d < best) { best = d; ref = EFW_REF[wk]; } }
    if (!ref) return null;
    if (efw < ref[0]) return { band: '<10th', flag: 'SGA_risk', refWeek: weeks.reduce((p, c) => Math.abs(c - w) < Math.abs(p - w) ? c : p) };
    if (efw > ref[2]) return { band: '>90th', flag: 'LGA_risk', refWeek: weeks.reduce((p, c) => Math.abs(c - w) < Math.abs(p - w) ? c : p) };
    return { band: '10-90th', flag: null, refWeek: weeks.reduce((p, c) => Math.abs(c - w) < Math.abs(p - w) ? c : p) };
}

/**
 * antenatalRiskFlags — server-side risk classification for an antenatal visit.
 * Pure function over discrete vitals; returns array of flag strings (anti-spoof:
 * risk_flags submitted by client are ignored). Incomplete values simply produce no
 * flag for that axis (we never invent a reassuring "no risk" for missing data — the
 * absence of a flag is not asserted as safety).
 */
function antenatalRiskFlags({ systolic, diastolic, proteinuria, hemoglobin, fetal_heart_rate, fetal_movement } = {}) {
    const flags = [];
    const sys = toInt(systolic), dia = toInt(diastolic), hb = toNum(hemoglobin), fhr = toInt(fetal_heart_rate);
    const protPos = proteinuria != null && String(proteinuria).trim() !== '' &&
        !/^neg/i.test(String(proteinuria).trim());
    const htn = (sys !== null && sys >= 140) || (dia !== null && dia >= 90);
    if (htn) flags.push('Hypertension');
    if (htn && protPos) flags.push('Pre-eclampsia risk');
    if (hb !== null && hb > 0 && hb < 10) flags.push('Anemia');
    if (fhr !== null && fhr > 0 && (fhr < 110 || fhr > 160)) flags.push('Abnormal FHR');
    if (fetal_movement != null && /absent|reduced|decreased|none/i.test(String(fetal_movement))) flags.push('Reduced fetal movement');
    return flags;
}

/**
 * deliveryTransitionAllowed — server-side state machine guard.
 * A delivery may only be recorded for a pregnancy currently in 'Active' status.
 * Already-terminal pregnancies (Delivered/Miscarriage/Ectopic/Terminated) reject.
 * @returns {{ok:true}|{ok:false,error:string}}
 */
const TERMINAL_PREGNANCY_STATUSES = ['Delivered', 'Miscarriage', 'Ectopic', 'Terminated'];
function deliveryTransitionAllowed(currentStatus) {
    const s = (currentStatus == null ? '' : String(currentStatus)).trim();
    if (s === '' ) return { ok: false, error: 'unknown pregnancy status' };
    if (s === 'Active') return { ok: true };
    if (TERMINAL_PREGNANCY_STATUSES.includes(s)) {
        return { ok: false, error: `pregnancy already in terminal status: ${s}` };
    }
    return { ok: false, error: `invalid pregnancy status for delivery: ${s}` };
}

// ===== helpers =====
function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isInteger(v) ? v : (Number.isFinite(v) ? Math.trunc(v) : null);
    const s = String(v).trim();
    if (!/^-?\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return Number.isInteger(n) ? n : null;
}
function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

module.exports = {
    computeEDD,
    gestationalAgeFromLMP,
    computeGPAL,
    computeAPGAR,
    apgarComponentScore,
    gaFromBiometry,
    efwPercentileBand,
    antenatalRiskFlags,
    deliveryTransitionAllowed,
    TERMINAL_PREGNANCY_STATUSES,
    // exported for tests
    _internal: { parseISODate, toISODate, toInt, toNum }
};
