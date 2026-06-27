/**
 * e11_insurance_engine.js
 * ============================================================
 * E11 Insurance / NPHIES — pure, side-effect-free engine for:
 *   - claim lifecycle state machine (server-authoritative; rejects invalid transitions)
 *   - pre-authorization state machine
 *   - eligibility / co-pay / patient-share math (deterministic; fail-Incomplete on bad input)
 *
 * Pure functions only — no DB, no req/res. Required by server.js and the unit test.
 * Conventions (EPIC_BUILD_CONVENTIONS): integer-id compares, fail-closed on bad input,
 *   server-authoritative status, never a falsely-reassuring value on incomplete input.
 */
'use strict';

// ---- Claim lifecycle state machine -------------------------------------------------
// draft -> submitted -> adjudicated -> remittance_posted
//          submitted -> denied
//          adjudicated -> denied -> appealed -> (adjudicated | denied)
//          appealed -> denied
const CLAIM_STATES = ['draft', 'submitted', 'adjudicated', 'remittance_posted', 'denied', 'appealed'];
const CLAIM_TRANSITIONS = {
    draft: ['submitted'],
    submitted: ['adjudicated', 'denied'],
    adjudicated: ['remittance_posted', 'denied'],
    remittance_posted: [],
    denied: ['appealed'],
    appealed: ['adjudicated', 'denied']
};

function isValidClaimState(s) {
    return typeof s === 'string' && CLAIM_STATES.includes(s);
}

// returns true iff `to` is a legal next state from `from`
function canTransitionClaim(from, to) {
    if (!isValidClaimState(from) || !isValidClaimState(to)) return false;
    return CLAIM_TRANSITIONS[from].includes(to);
}

// ---- Pre-authorization state machine -----------------------------------------------
// requested -> approved | denied | partial (terminal decisions; a requested auth can be decided once)
const PREAUTH_STATES = ['requested', 'approved', 'denied', 'partial'];
const PREAUTH_TRANSITIONS = {
    requested: ['approved', 'denied', 'partial'],
    approved: [],
    denied: [],
    partial: []
};
function isValidPreAuthState(s) {
    return typeof s === 'string' && PREAUTH_STATES.includes(s);
}
function canTransitionPreAuth(from, to) {
    if (!isValidPreAuthState(from) || !isValidPreAuthState(to)) return false;
    return PREAUTH_TRANSITIONS[from].includes(to);
}

// ---- Eligibility / co-pay math -----------------------------------------------------
// Round to 2dp (halaala precision) using a stable integer-cent round.
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * computePatientShare(grossAmount, policy)
 * policy = { co_pay_percent, co_pay_max, max_limit }
 * Returns { status, patientShare, payerShare, coveredAmount } where:
 *   - status 'Incomplete' (and NO money figures) when inputs are missing/invalid — never a
 *     falsely-reassuring 0 (E6 Braden lesson). Caller must treat Incomplete as block.
 *   - patientShare = min(gross*co_pay_percent/100, co_pay_max>0?co_pay_max:inf), plus any amount
 *     above max_limit (uncovered) is fully patient-borne.
 */
function computePatientShare(grossAmount, policy) {
    const gross = Number(grossAmount);
    if (!Number.isFinite(gross) || gross < 0 || policy === null || policy === undefined || typeof policy !== 'object') {
        return { status: 'Incomplete', reason: 'invalid gross amount or missing policy' };
    }
    const coPayPct = Number(policy.co_pay_percent);
    const coPayMax = Number(policy.co_pay_max);
    const maxLimit = Number(policy.max_limit);
    if (!Number.isFinite(coPayPct) || coPayPct < 0 || coPayPct > 100) {
        return { status: 'Incomplete', reason: 'invalid co_pay_percent' };
    }

    // amount above the policy ceiling is uncovered -> patient pays in full
    const ceiling = Number.isFinite(maxLimit) && maxLimit > 0 ? maxLimit : gross;
    const coveredBase = Math.min(gross, ceiling);
    const uncovered = round2(gross - coveredBase);

    // co-pay on the covered base
    let coPay = coveredBase * (coPayPct / 100);
    if (Number.isFinite(coPayMax) && coPayMax > 0 && coPay > coPayMax) coPay = coPayMax;
    coPay = round2(coPay);

    const patientShare = round2(coPay + uncovered);
    const payerShare = round2(gross - patientShare);
    return {
        status: 'OK',
        patientShare,
        payerShare: payerShare < 0 ? 0 : payerShare,
        coveredAmount: coveredBase
    };
}

module.exports = {
    CLAIM_STATES,
    CLAIM_TRANSITIONS,
    isValidClaimState,
    canTransitionClaim,
    PREAUTH_STATES,
    isValidPreAuthState,
    canTransitionPreAuth,
    round2,
    computePatientShare
};
