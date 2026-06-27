/**
 * esi_engine.js
 * ==========================================
 * Emergency Severity Index (ESI v4) — SERVER-SIDE, deterministic, pure-function triage engine.
 *
 * Patient-safety contract (mirrors cds.js philosophy: FAIL-SAFE, never silent under-triage):
 *   - The ESI level is computed ENTIRELY from clinical inputs (vitals, presentation, resources).
 *     A client-supplied `esi_level` is ADVISORY ONLY and is NEVER trusted — the server value is
 *     authoritative. computeESI() ignores any esi_level on the input object.
 *   - ESI-1 (Resuscitation) and ESI-2 (Emergent) are driven by danger-zone vitals / high-risk
 *     presentation, regardless of what the client claims.
 *   - Uncertainty errs toward HIGHER acuity (lower ESI number). Missing data never silently
 *     down-triages a danger-zone finding.
 *
 * ESI v4 decision points:
 *   A. Requires immediate life-saving intervention?      -> ESI 1
 *   B. High-risk presentation, OR new confusion/lethargy/
 *      disorientation (altered LOC), OR severe pain/distress? -> ESI 2
 *   C. How many resources are anticipated?
 *        none -> 5 ;  one -> 4 ;  two-or-more -> 3
 *   D. Danger-zone vitals consideration: if the C-path lands on 3 (or 4/5 with abnormal vitals
 *      that meet danger-zone), CONSIDER up-triage to 2.
 *
 * Output shape:
 *   {
 *     esi_level: 1..5,
 *     triage_color: 'Red'|'Orange'|'Yellow'|'Green'|'Blue',
 *     priority: integer (1 = most urgent; equals esi_level — used for board ordering),
 *     decision_point: 'A'|'B'|'C'|'D',
 *     rationale: [ string, ... ],   // human-readable reasons (audit / clinician display)
 *     danger_zone: boolean,         // true if any danger-zone vital fired
 *     high_risk: boolean,
 *     resources_estimated: integer,
 *     fail_safe: boolean            // true => level raised because data was missing/uncertain
 *   }
 *
 * No I/O, no DB, no globals. Unit-testable in isolation (esi_triage_unit_test.js).
 */

'use strict';

// ESI level -> triage color mapping (board badge + legacy triage_color column).
const ESI_COLORS = { 1: 'Red', 2: 'Orange', 3: 'Yellow', 4: 'Green', 5: 'Blue' };

// ---- helpers -------------------------------------------------------------

function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function norm(s) {
    return String(s === null || s === undefined ? '' : s).trim().toLowerCase();
}

// Age in years; default to adult (40) when unknown so adult danger-zone thresholds apply
// (adult thresholds are the conservative/strict default — see danger-zone notes).
function ageYears(input) {
    const a = toNum(input.age);
    if (a !== null && a >= 0) return a;
    return 40;
}

// ---- A. immediate life-saving intervention -------------------------------
// Catastrophic vitals or explicit life-saving flags => ESI-1 (no oxygenation, no perfusion,
// no airway, peri-arrest). Conservative: any one fires ESI-1.
function checkLifeSaving(input) {
    const reasons = [];
    const v = input.vitals || {};
    const loc = norm(input.loc || v.loc);

    // Explicit life-saving intervention markers (intubation, CPR, defib, major fluids/blood, etc.)
    if (input.requires_lifesaving === true) reasons.push('Requires immediate life-saving intervention (flagged)');
    if (input.cardiac_arrest === true) reasons.push('Cardiac/respiratory arrest');
    if (input.intubated === true || input.requires_intubation === true) reasons.push('Airway compromise — intubation required');
    if (input.active_seizure === true) reasons.push('Active/ongoing seizure');

    const spo2 = toNum(v.spo2);
    const sbp = toNum(v.sbp != null ? v.sbp : v.bp_systolic);
    const hr = toNum(v.hr);
    const rr = toNum(v.rr);

    if (spo2 !== null && spo2 < 85) reasons.push(`Critical hypoxia (SpO2 ${spo2}% < 85%)`);
    if (sbp !== null && sbp < 80) reasons.push(`Profound hypotension / shock (SBP ${sbp} < 80)`);
    if (hr !== null && (hr < 35 || hr > 180)) reasons.push(`Peri-arrest heart rate (HR ${hr})`);
    if (rr !== null && (rr < 6 || rr > 40)) reasons.push(`Respiratory failure (RR ${rr})`);

    // Unresponsive / not protecting airway.
    if (loc === 'unresponsive' || loc === 'u') reasons.push('Unresponsive (AVPU=U) — not protecting airway');

    return reasons;
}

// ---- danger-zone vitals (ESI v4 step D) ----------------------------------
// Age-adjusted danger-zone thresholds. Any fire => candidate for up-triage to ESI-2.
function checkDangerZoneVitals(input) {
    const reasons = [];
    const v = input.vitals || {};
    const age = ageYears(input);

    const hr = toNum(v.hr);
    const rr = toNum(v.rr);
    const spo2 = toNum(v.spo2);
    const temp = toNum(v.temp);

    // SpO2 < 92% is a danger-zone vital at any age.
    if (spo2 !== null && spo2 < 92) reasons.push(`Danger-zone SpO2 (${spo2}% < 92%)`);

    if (age < 0.083) { // < 1 month (~30 days expressed in years)
        if (hr !== null && hr > 180) reasons.push(`Danger-zone HR for neonate (${hr})`);
        if (rr !== null && rr > 50) reasons.push(`Danger-zone RR for neonate (${rr})`);
        if (temp !== null && temp > 38.0) reasons.push(`Fever in neonate (${temp}C) — high risk`);
    } else if (age <= 3) {
        if (hr !== null && hr > 160) reasons.push(`Danger-zone HR for infant/toddler (${hr})`);
        if (rr !== null && rr > 40) reasons.push(`Danger-zone RR for infant/toddler (${rr})`);
    } else if (age <= 8) {
        if (hr !== null && hr > 140) reasons.push(`Danger-zone HR for child (${hr})`);
        if (rr !== null && rr > 30) reasons.push(`Danger-zone RR for child (${rr})`);
    } else {
        // Adult danger-zone (ESI v4): HR>100, RR>20, SpO2<92.
        if (hr !== null && hr > 100) reasons.push(`Danger-zone HR (${hr} > 100)`);
        if (rr !== null && rr > 20) reasons.push(`Danger-zone RR (${rr} > 20)`);
    }

    return reasons;
}

// ---- B. high-risk presentation / altered LOC / severe pain ----------------
function checkHighRisk(input) {
    const reasons = [];
    const v = input.vitals || {};

    // Explicit high-risk flag (clinician judgement) OR a high-risk chief complaint keyword.
    if (input.high_risk === true) reasons.push('High-risk situation (flagged by triage clinician)');

    const cc = norm(input.chief_complaint) + ' ' + norm(input.chief_complaint_ar);
    const HIGH_RISK_TERMS = [
        'chest pain', 'cardiac', 'stroke', 'cva', 'stemi', 'mi ', 'sepsis', 'septic',
        'overdose', 'suicidal', 'suicide', 'anaphyl', 'difficulty breathing', 'sob',
        'shortness of breath', 'altered mental', 'unconscious', 'severe bleeding', 'hemorrhage',
        'ectopic', 'dka', 'pregnan', 'gunshot', 'stab', 'major trauma', 'immunocompromis'
    ];
    for (const t of HIGH_RISK_TERMS) {
        if (cc.includes(t)) { reasons.push(`High-risk chief complaint ("${t.trim()}")`); break; }
    }

    // Altered level of consciousness (new confusion / lethargy / disorientation) — AVPU V or P.
    const loc = norm(input.loc || v.loc);
    if (['v', 'verbal', 'p', 'pain', 'confused', 'lethargic', 'disoriented', 'altered'].includes(loc)) {
        reasons.push(`Altered level of consciousness (LOC=${loc})`);
    }

    // Severe pain / distress (>= 7/10) is an ESI v4 "consider ESI-2" trigger.
    const pain = toNum(input.pain_score);
    if (pain !== null && pain >= 7) reasons.push(`Severe pain/distress (pain score ${pain}/10)`);

    return reasons;
}

// ---- C. resource estimate -------------------------------------------------
// ESI resources: labs, ECG, imaging (x-ray/CT/US/MRI), IV fluids, IV/IM/neb meds, specialty
// consult, simple procedure (=1) or complex procedure (=2). PO meds, prescription refills,
// simple exam, point-of-care tests do NOT count. We accept either an explicit count or a list.
function estimateResources(input) {
    if (Array.isArray(input.resources)) {
        // Count distinct resource categories conservatively.
        return input.resources.filter(r => norm(r) !== '').length;
    }
    const n = toNum(input.resource_count);
    if (n !== null && n >= 0) return Math.floor(n);
    return null; // unknown
}

// ---- main ----------------------------------------------------------------
/**
 * computeESI(input) -> result object (see file header).
 * `input.esi_level` (if present) is IGNORED — server is authoritative.
 */
function computeESI(input) {
    input = input || {};
    const rationale = [];

    // A. life-saving?
    const lifeReasons = checkLifeSaving(input);
    if (lifeReasons.length) {
        return finalize(1, 'A', lifeReasons, { danger_zone: true, high_risk: true, resources: null, fail_safe: false });
    }

    // B. high-risk / altered LOC / severe pain?
    const highRisk = checkHighRisk(input);
    const danger = checkDangerZoneVitals(input);

    if (highRisk.length) {
        return finalize(2, 'B', highRisk.concat(danger), {
            danger_zone: danger.length > 0, high_risk: true, resources: null, fail_safe: false
        });
    }

    // C. resources
    const resources = estimateResources(input);

    // D. danger-zone vitals can up-triage the resource-based level to 2.
    if (danger.length) {
        return finalize(2, 'D',
            ['Danger-zone vitals present — up-triaged to ESI-2'].concat(danger),
            { danger_zone: true, high_risk: false, resources, fail_safe: false });
    }

    if (resources === null) {
        // Unknown resource need with no danger flags: FAIL-SAFE to ESI-3 (do NOT assume low acuity).
        return finalize(3, 'C',
            ['Resource need not specified — fail-safe to ESI-3 (urgent) pending clinician estimate'],
            { danger_zone: false, high_risk: false, resources: null, fail_safe: true });
    }

    let level;
    if (resources >= 2) { level = 3; rationale.push(`Two or more resources anticipated (${resources}) — ESI-3`); }
    else if (resources === 1) { level = 4; rationale.push('One resource anticipated — ESI-4'); }
    else { level = 5; rationale.push('No resources anticipated — ESI-5'); }

    return finalize(level, 'C', rationale, {
        danger_zone: false, high_risk: false, resources, fail_safe: false
    });
}

function finalize(level, decisionPoint, rationale, meta) {
    return {
        esi_level: level,
        triage_color: ESI_COLORS[level] || 'Yellow',
        priority: level, // lower number = higher priority; board sorts ascending
        decision_point: decisionPoint,
        rationale: (rationale && rationale.length) ? rationale.slice() : ['No specific criteria fired'],
        danger_zone: !!meta.danger_zone,
        high_risk: !!meta.high_risk,
        resources_estimated: (meta.resources === null || meta.resources === undefined) ? null : meta.resources,
        fail_safe: !!meta.fail_safe
    };
}

module.exports = {
    computeESI,
    // exposed for tests / reuse
    checkLifeSaving,
    checkHighRisk,
    checkDangerZoneVitals,
    estimateResources,
    ESI_COLORS
};
