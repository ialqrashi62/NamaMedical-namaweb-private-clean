/**
 * pathology_engine.js — E15 Pathology pure engine (DB-free, deterministic).
 *
 * Server-authoritative state machine + helpers for the specimen workflow.
 * No DB, no Express, no client trust — imported by server.js routes AND tests.
 *
 * State machine (linear, forward-only):
 *   Received -> Grossing -> Processing -> Reported -> SignedOut
 *
 * Rules:
 *  - Transitions may advance one or more steps forward but NEVER backward.
 *  - SignedOut is terminal & immutable (no further transition; addendum-only).
 *  - Unknown states / unknown targets are rejected.
 */
'use strict';

const PATH_STATES = ['Received', 'Grossing', 'Processing', 'Reported', 'SignedOut'];
const TERMINAL_STATE = 'SignedOut';

/**
 * Is `to` a legal next state from `from`?
 * Forward-only along PATH_STATES order; no self-loop; SignedOut is terminal.
 */
function isValidTransition(from, to) {
    const fi = PATH_STATES.indexOf(from);
    const ti = PATH_STATES.indexOf(to);
    if (fi === -1 || ti === -1) return false;     // unknown state -> reject
    if (from === TERMINAL_STATE) return false;     // signed-out is immutable
    return ti > fi;                                // strictly forward only
}

/** A report is immutable (no field edits, addendum-only) once signed out. */
function isImmutable(state) {
    return state === TERMINAL_STATE;
}

/**
 * Compute critical/malignancy flags server-side (anti-spoof: never trust client).
 * Returns booleans derived from structured fields + free text.
 */
function deriveFlags({ diagnosis = '', micro_text = '', snomed_codes = [], malignancy_hint = false } = {}) {
    const hay = `${diagnosis} ${micro_text}`.toLowerCase();
    const MAL_TERMS = ['malignant', 'malignancy', 'carcinoma', 'sarcoma', 'lymphoma',
        'melanoma', 'metasta', 'invasive', 'adenocarcinoma', 'neoplasm', 'leukemia'];
    const CRIT_TERMS = ['critical', 'urgent finding', 'high grade', 'high-grade'];
    // SNOMED morphologic-malignancy roots (8000-prefix family per SNOMED/ICD-O)
    const snomedMalignant = Array.isArray(snomed_codes) && snomed_codes.some(
        c => /^(M8|M9)\d{3}\/3/i.test(String(c)) || /malig/i.test(String(c))
    );
    const malignancy_flag = !!malignancy_hint || snomedMalignant || MAL_TERMS.some(t => hay.includes(t));
    const critical_flag = malignancy_flag || CRIT_TERMS.some(t => hay.includes(t));
    return { malignancy_flag, critical_flag };
}

/**
 * Generate a tenant-unique accession number. Server-authoritative — never
 * accepted from the client. Format: PA-<tenantId>-<yyyymmdd>-<seq>
 * `seq` is the count of that tenant's specimens today + 1 (caller supplies count).
 */
function generateAccession(tenantId, todayCount, now = new Date()) {
    const t = parseInt(tenantId, 10);
    if (!Number.isInteger(t) || t <= 0) throw new Error('accession: invalid tenantId');
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String((parseInt(todayCount, 10) || 0) + 1).padStart(4, '0');
    return `PA-${t}-${y}${m}${d}-${seq}`;
}

module.exports = {
    PATH_STATES,
    TERMINAL_STATE,
    isValidTransition,
    isImmutable,
    deriveFlags,
    generateAccession,
};
