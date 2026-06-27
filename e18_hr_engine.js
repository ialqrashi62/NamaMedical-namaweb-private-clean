// ============================================================================
// Epic E18 — HR / Workforce — PURE ENGINE (no DB, no I/O)
// ----------------------------------------------------------------------------
// All authority decisions live here so they can be unit-tested without a database
// and reused verbatim by server.js:
//   - SCFHS / document license-expiry classification (server-side, never client).
//   - Leave-request state machine (requested -> approved | denied | cancelled).
//   - Shift-roster overlap detection + time validation.
//   - Payroll-slip computation (GOSI 9% employee share, allowances, advances,
//     net pay) — slips are DRAFT/computed only; GL POSTING IS GATED OFF.
//   - Payroll posting gate (mirrors E10 accounting: behind a flag defaulting OFF).
//
// HARD rules honoured (EPIC_BUILD_CONVENTIONS):
//  - IDs compared as integers (e18IntId) — no padded/string coercion bypass (E6).
//  - Incomplete input -> Incomplete/blocked, never a falsely-reassuring value (E6).
//  - fail-CLOSED: a license with missing/unparseable expiry is 'unknown' (treated as
//    NON-compliant for blocking decisions), never silently 'valid'.
//  - Authority fields (status, net pay, expiry flag) computed server-side; client
//    cannot supply them.
// ============================================================================

'use strict';

// --- id helper: strict positive integer (rejects ' 5', '5x', 5.5, null) --------
function e18IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && v.trim() !== v) return null; // padded id bypass (E6)
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// --- money/number helper: finite number, rejects NaN / blank ----------------
function e18Num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && v.trim() !== v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
}

// --- date parse: returns epoch-ms at UTC midnight, or null if unparseable -----
function e18ParseDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    // accept YYYY-MM-DD (and full ISO); reject obviously bad
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
        const t = Date.parse(s);
        return Number.isNaN(t) ? null : t;
    }
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, mo - 1, d);
    return Number.isNaN(t) ? null : t;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// 1) License / document expiry classification (SCFHS, Iqama, contract, etc.).
//    Returns { status, daysToExpiry } where status is one of:
//      'expired'  (expiry < today)
//      'expiring' (0 <= daysToExpiry <= alertDays)
//      'valid'    (daysToExpiry > alertDays)
//      'unknown'  (missing/unparseable expiry — fail-CLOSED: NOT treated as valid)
//    `nowMs` defaults to the current day at UTC midnight (injectable for tests).
// ============================================================================
function licenseStatus(expiryDate, alertDays, nowMs) {
    const exp = e18ParseDate(expiryDate);
    if (exp === null) return { status: 'unknown', daysToExpiry: null };
    const alert = e18Num(alertDays);
    const window = (alert === null || alert < 0) ? 30 : Math.floor(alert); // default 30-day alert
    let now = (nowMs === undefined || nowMs === null) ? Date.now() : nowMs;
    // normalise "now" to UTC midnight so day math is stable
    const nowDay = Math.floor(now / DAY_MS) * DAY_MS;
    const daysToExpiry = Math.round((exp - nowDay) / DAY_MS);
    if (daysToExpiry < 0) return { status: 'expired', daysToExpiry };
    if (daysToExpiry <= window) return { status: 'expiring', daysToExpiry };
    return { status: 'valid', daysToExpiry };
}

// A license blocks compliance unless it is explicitly 'valid' OR 'expiring'
// (still in date). 'expired' and 'unknown' are non-compliant (fail-CLOSED).
function isLicenseCompliant(expiryDate, alertDays, nowMs) {
    const s = licenseStatus(expiryDate, alertDays, nowMs).status;
    return s === 'valid' || s === 'expiring';
}

// Classify a whole set of licenses for an employee; returns the WORST status.
function worstLicenseStatus(licenses, nowMs) {
    const rank = { expired: 0, unknown: 1, expiring: 2, valid: 3 };
    let worst = null;
    for (const lic of (licenses || [])) {
        const s = licenseStatus(lic.expiry_date, lic.alert_days, nowMs).status;
        if (worst === null || rank[s] < rank[worst]) worst = s;
    }
    return worst; // null if no licenses
}

// ============================================================================
// 2) Leave-request state machine.
//    requested -> approved | denied | cancelled. approved/denied/cancelled terminal.
//    Invalid transitions MUST be rejected (caller returns 409).
// ============================================================================
const LEAVE_STATUSES = ['requested', 'approved', 'denied', 'cancelled'];
const LEAVE_TRANSITIONS = {
    requested: ['approved', 'denied', 'cancelled'],
    approved: [],   // terminal
    denied: [],     // terminal
    cancelled: []   // terminal
};
function canTransitionLeave(from, to) {
    if (!LEAVE_STATUSES.includes(to)) return false;
    const f = from || 'requested';
    if (!LEAVE_STATUSES.includes(f)) return false;
    return (LEAVE_TRANSITIONS[f] || []).includes(to);
}

// Inclusive day count between two dates; returns null on invalid / inverted range.
function leaveDays(startDate, endDate) {
    const s = e18ParseDate(startDate);
    const e = e18ParseDate(endDate);
    if (s === null || e === null) return null;
    if (e < s) return null;
    return Math.round((e - s) / DAY_MS) + 1;
}

// ============================================================================
// 3) Shift roster: time validation + overlap detection (per employee/day).
//    Times are 'HH:MM'. Returns minutes-from-midnight or null.
// ============================================================================
function parseTimeMin(v) {
    if (v === null || v === undefined) return null;
    const m = String(v).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
}
// A shift is valid when start < end (no overnight wrap supported here -> caller
// splits overnight shifts). Returns { ok, startMin, endMin, durationMin } or {ok:false}.
function validateShift(startTime, endTime) {
    const s = parseTimeMin(startTime);
    const e = parseTimeMin(endTime);
    if (s === null || e === null) return { ok: false, error: 'invalid_time' };
    if (e <= s) return { ok: false, error: 'end_before_start' };
    return { ok: true, startMin: s, endMin: e, durationMin: e - s };
}
// Does [aStart,aEnd) overlap [bStart,bEnd)? (half-open intervals).
function shiftsOverlap(aStart, aEnd, bStart, bEnd) {
    const a1 = parseTimeMin(aStart), a2 = parseTimeMin(aEnd);
    const b1 = parseTimeMin(bStart), b2 = parseTimeMin(bEnd);
    if ([a1, a2, b1, b2].some(x => x === null)) return false; // invalid -> treat as no-overlap claim
    return a1 < b2 && b1 < a2;
}
// Given existing shifts for an employee on a date, would `candidate` overlap any?
function hasShiftConflict(existing, candidate) {
    return (existing || []).some(s =>
        shiftsOverlap(s.start_time, s.end_time, candidate.start_time, candidate.end_time));
}

// ============================================================================
// 4) Attendance: compute worked hours from check-in/out (server-authoritative,
//    client cannot supply total_hours). Returns hours (2dp) or null if incomplete.
// ============================================================================
function computeWorkedHours(checkIn, checkOut) {
    const ci = parseTimeMin(checkIn);
    const co = parseTimeMin(checkOut);
    if (ci === null || co === null) return null;      // incomplete -> null, never 0/falsely-reassuring
    if (co < ci) return null;                          // overnight handled separately
    return Math.round((co - ci) / 60 * 100) / 100;
}

// ============================================================================
// 5) Payroll-slip computation — KSA GOSI-aware. Server-authoritative net pay.
//    GOSI: employee share 9% of (basic + housing) for Saudi nationals (capped),
//    here applied to a configurable contributory base. Slips are DRAFT only;
//    posting to GL is GATED OFF (see isPostingEnabled).
//    Returns a fully-computed slip object; client never supplies net_salary.
// ============================================================================
const GOSI_EMPLOYEE_RATE = 0.09; // employee share (annuities 9% + SANED is handled elsewhere)

function computePayrollSlip(input) {
    const basic = e18Num(input.basic_salary);
    if (basic === null || basic < 0) return { ok: false, error: 'invalid_basic_salary' };
    const housing = Math.max(0, e18Num(input.housing_allowance) ?? 0);
    const transport = Math.max(0, e18Num(input.transport_allowance) ?? 0);
    const otherAllow = Math.max(0, e18Num(input.other_allowances) ?? 0);
    const advances = Math.max(0, e18Num(input.advances_deducted) ?? 0);
    const otherDed = Math.max(0, e18Num(input.other_deductions) ?? 0);

    // Saudi nationals contribute GOSI; non-Saudi typically do not (occupational hazard only).
    // Caller passes is_saudi explicitly; default to applying GOSI (conservative for deduction).
    // L2: if is_saudi was not explicitly provided AND national_id is blank, the Saudi/GOSI
    // determination is ambiguous — flag it so auditors know a heuristic was used.
    const nationalIdBlank = !input.national_id || String(input.national_id).trim() === '';
    const isSaudiExplicit = input.is_saudi !== undefined;
    const isSaudi = isSaudiExplicit ? !!input.is_saudi : true; // conservative: assume Saudi when unknown
    const saudiStatus = isSaudiExplicit ? 'explicit' : (nationalIdBlank ? 'inferred' : 'inferred');
    const gosiBase = basic + housing; // contributory base (annuities)
    const gosi = isSaudi ? Math.round(gosiBase * GOSI_EMPLOYEE_RATE * 100) / 100 : 0;

    const grossEarnings = basic + housing + transport + otherAllow;
    const totalDeductions = Math.round((gosi + advances + otherDed) * 100) / 100;
    const net = Math.round((grossEarnings - totalDeductions) * 100) / 100;

    return {
        ok: true,
        basic: round2(basic),
        housing_allowance: round2(housing),
        transport_allowance: round2(transport),
        other_allowances: round2(otherAllow),
        gross_earnings: round2(grossEarnings),
        gosi_deduction: round2(gosi),
        advances_deducted: round2(advances),
        other_deductions: round2(otherDed),
        total_deductions: round2(totalDeductions),
        net_salary: round2(net),
        gosi_rate: GOSI_EMPLOYEE_RATE,
        is_saudi: isSaudi,
        saudi_status: saudiStatus  // L2: 'explicit' (caller set is_saudi) | 'inferred' (heuristic used — auditor flag)
    };
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ============================================================================
// 6) Payroll posting gate (mirrors E10 accounting): posting to the GL is DISABLED
//    by default and only enabled when HR_PAYROLL_POSTING_ENABLED === 'true'.
//    Slips are always computable/draftable; only the POST-to-GL step is gated.
// ============================================================================
function isPostingEnabled(env) {
    const e = env || (typeof process !== 'undefined' ? process.env : {});
    return String(e.HR_PAYROLL_POSTING_ENABLED || '').toLowerCase() === 'true';
}

// Payroll-slip status machine: draft -> approved -> (posted only if gate ON) | cancelled.
const SLIP_STATUSES = ['draft', 'approved', 'posted', 'cancelled'];
const SLIP_TRANSITIONS = {
    draft: ['approved', 'cancelled'],
    approved: ['posted', 'cancelled'],
    posted: [],      // terminal
    cancelled: []    // terminal
};
function canTransitionSlip(from, to) {
    if (!SLIP_STATUSES.includes(to)) return false;
    const f = from || 'draft';
    if (!SLIP_STATUSES.includes(f)) return false;
    return (SLIP_TRANSITIONS[f] || []).includes(to);
}

// ============================================================================
// 7) PII field masking — non-HR roles never see salary/national_id/etc.
//    Server uses this to strip PII before returning employee rows to non-HR.
// ============================================================================
const PII_FIELDS = ['national_id', 'phone', 'email', 'basic_salary', 'housing_allowance',
    'transport_allowance', 'iban', 'salary', 'commission_value'];
function maskEmployeePII(row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const f of PII_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(out, f)) delete out[f];
    }
    out._pii_masked = true;
    return out;
}

module.exports = {
    e18IntId,
    e18Num,
    e18ParseDate,
    licenseStatus,
    isLicenseCompliant,
    worstLicenseStatus,
    LEAVE_STATUSES,
    LEAVE_TRANSITIONS,
    canTransitionLeave,
    leaveDays,
    parseTimeMin,
    validateShift,
    shiftsOverlap,
    hasShiftConflict,
    computeWorkedHours,
    GOSI_EMPLOYEE_RATE,
    computePayrollSlip,
    isPostingEnabled,
    SLIP_STATUSES,
    SLIP_TRANSITIONS,
    canTransitionSlip,
    PII_FIELDS,
    maskEmployeePII
};
