/**
 * ews_engine.js — Gate 2 pure early-warning & sepsis-screening engine.
 *
 * Server-side authority for MEWS (adult), PEWS (pediatric, Monaghan-style,
 * age-banded), qSOFA, SIRS and the escalation mapping. Complements the existing
 * NEWS2 in nursing_scores.js. Pure functions (no I/O, no DB), fail-CLOSED:
 * missing critical observations yield { ok:false, band:'Incomplete' } — a partial
 * screen must never report a falsely-reassuring low score or negative result.
 *
 * ADVISORY ONLY: outputs support workflow escalation and alerting inside the
 * system; they are not a diagnosis and never replace clinician judgement.
 *
 * محرك الإنذار المبكر وفحص الإنتان (حساب خادمي — لا يثق بأي مجموع من العميل،
 * والنتيجة تنبيه إجرائي وليست تشخيصًا).
 */
'use strict';

function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// ===================== MEWS (Modified Early Warning Score, adult) =====================
// Subbe 2001. Components: SBP, HR, RR, Temp, AVPU. Total 0-14.
// Bands: 0-2 Low, 3-4 Medium, 5-8 High, >=9 Critical.
const AVPU_POINTS = { A: 0, V: 1, P: 2, U: 3 };

function mewsSbpPoints(sbp) {
    if (sbp <= 70) return 3;
    if (sbp <= 80) return 2;
    if (sbp <= 100) return 1;
    if (sbp <= 199) return 0;
    return 2; // >= 200
}
function mewsHrPoints(hr) {
    if (hr < 40) return 2;
    if (hr <= 50) return 1;
    if (hr <= 100) return 0;
    if (hr <= 110) return 1;
    if (hr <= 129) return 2;
    return 3; // >= 130
}
function mewsRrPoints(rr) {
    if (rr < 9) return 2;
    if (rr <= 14) return 0;
    if (rr <= 20) return 1;
    if (rr <= 29) return 2;
    return 3; // >= 30
}
function mewsTempPoints(t) {
    if (t < 35) return 2;
    if (t < 38.5) return 0;
    return 2; // >= 38.5
}
function mewsBand(score) {
    if (score <= 2) return 'Low';
    if (score <= 4) return 'Medium';
    if (score <= 8) return 'High';
    return 'Critical';
}

function computeMEWS(obs) {
    const fail = (error) => ({ ok: false, score: null, band: 'Incomplete', error });
    if (!obs || typeof obs !== 'object') return fail('MEWS observations missing');
    const sbp = toNum(obs.sbp), hr = toNum(obs.hr), rr = toNum(obs.rr), temp = toNum(obs.temp);
    const avpu = typeof obs.avpu === 'string' ? obs.avpu.trim().toUpperCase() : null;
    if (sbp === null || hr === null || rr === null || temp === null) {
        return fail('MEWS requires sbp, hr, rr and temp');
    }
    if (avpu === null || !(avpu in AVPU_POINTS)) return fail('MEWS requires AVPU one of A/V/P/U');
    const components = {
        sbp: mewsSbpPoints(sbp), hr: mewsHrPoints(hr), rr: mewsRrPoints(rr),
        temp: mewsTempPoints(temp), avpu: AVPU_POINTS[avpu],
    };
    const score = components.sbp + components.hr + components.rr + components.temp + components.avpu;
    return { ok: true, score, band: mewsBand(score), components };
}

// ===================== PEWS (Pediatric Early Warning Score, Monaghan-style) =====================
// Three domains 0-3 each (behavior / cardiovascular / respiratory), age-banded RR & HR
// norms (APLS-style bands). Total 0-9. Band: 0-1 Low, 2-3 Medium, >=4 High, >=6 Critical;
// any single domain scoring 3 raises component_alert and forces at least High.
const PEDS_AGE_BANDS = [
    // [maxAgeMonthsExclusive, rrLow, rrHigh, hrLow, hrHigh]
    [12, 30, 40, 110, 160],
    [60, 25, 35, 95, 140],
    [144, 20, 25, 80, 120],
    [Infinity, 15, 20, 60, 100],
];
const PEWS_BEHAVIOR = { playing: 0, appropriate: 0, sleeping: 1, irritable: 2, lethargic: 3, confused: 3, reduced_response: 3 };
const PEWS_CV_COLOR = { pink: 0, pale: 1, grey: 2, gray: 2, grey_mottled: 3, gray_mottled: 3 };

function pedsNorms(ageMonths) {
    for (const [max, rrLow, rrHigh, hrLow, hrHigh] of PEDS_AGE_BANDS) {
        if (ageMonths < max) return { rrLow, rrHigh, hrLow, hrHigh };
    }
    return null;
}
function pewsBand(score, componentAlert) {
    if (score >= 6) return 'Critical';
    if (score >= 4 || componentAlert) return 'High';
    if (score >= 2) return 'Medium';
    return 'Low';
}

function computePEWS(obs) {
    const fail = (error) => ({ ok: false, score: null, band: 'Incomplete', error });
    if (!obs || typeof obs !== 'object') return fail('PEWS observations missing');
    const ageMonths = toNum(obs.age_months);
    if (ageMonths === null || ageMonths < 0) return fail('PEWS requires age_months (age-banded vital norms)');
    const norms = pedsNorms(ageMonths);

    const behaviorKey = typeof obs.behavior === 'string' ? obs.behavior.trim().toLowerCase() : null;
    if (behaviorKey === null || !(behaviorKey in PEWS_BEHAVIOR)) {
        return fail('PEWS behavior must be one of playing/appropriate/sleeping/irritable/lethargic/confused/reduced_response');
    }
    const behaviorPts = PEWS_BEHAVIOR[behaviorKey];

    const colorKey = typeof obs.cardiovascular === 'string' ? obs.cardiovascular.trim().toLowerCase() : null;
    if (colorKey === null || !(colorKey in PEWS_CV_COLOR)) {
        return fail('PEWS cardiovascular must be one of pink/pale/grey/grey_mottled');
    }
    const crt = toNum(obs.crt_seconds);
    const hr = toNum(obs.hr);
    if (crt === null || hr === null) return fail('PEWS requires crt_seconds and hr');
    let cvPts = PEWS_CV_COLOR[colorKey];
    if (crt >= 5) cvPts = Math.max(cvPts, 3);
    else if (crt >= 4) cvPts = Math.max(cvPts, 2);
    else if (crt >= 3) cvPts = Math.max(cvPts, 1);
    if (hr >= norms.hrHigh + 30 || hr < norms.hrLow) cvPts = Math.max(cvPts, 3);
    else if (hr >= norms.hrHigh + 20) cvPts = Math.max(cvPts, 2);

    const rr = toNum(obs.rr);
    if (rr === null) return fail('PEWS requires rr');
    const fio2 = toNum(obs.fio2_percent); // room air 21 when not on O2
    const retractions = obs.retractions === true;
    let respPts = 0;
    if (rr <= norms.rrLow - 5 && retractions) respPts = 3;
    else if (rr >= norms.rrHigh + 20) respPts = Math.max(respPts, retractions ? 3 : 2);
    else if (rr >= norms.rrHigh + 10) respPts = Math.max(respPts, 1);
    else if (retractions) respPts = Math.max(respPts, 1);
    if (fio2 !== null) {
        if (fio2 >= 50) respPts = Math.max(respPts, 3);
        else if (fio2 >= 40) respPts = Math.max(respPts, 2);
        else if (fio2 >= 30) respPts = Math.max(respPts, 1);
    }

    const score = behaviorPts + cvPts + respPts;
    const componentAlert = behaviorPts === 3 || cvPts === 3 || respPts === 3;
    return {
        ok: true, score, band: pewsBand(score, componentAlert), component_alert: componentAlert,
        components: { behavior: behaviorPts, cardiovascular: cvPts, respiratory: respPts },
    };
}

// ===================== qSOFA =====================
// RR >= 22, SBP <= 100, altered mentation (GCS < 15 or AVPU not A). >= 2 => high risk.
// Mentation may come as gcs_total OR avpu; missing mentation fails closed.
function computeQSOFA(obs) {
    const fail = (error) => ({ ok: false, score: null, high_risk: null, error });
    if (!obs || typeof obs !== 'object') return fail('qSOFA observations missing');
    const rr = toNum(obs.rr), sbp = toNum(obs.sbp);
    if (rr === null || sbp === null) return fail('qSOFA requires rr and sbp');
    let altered = null;
    const gcs = toNum(obs.gcs_total);
    if (gcs !== null) {
        if (gcs < 3 || gcs > 15) return fail('qSOFA gcs_total out of range (3-15)');
        altered = gcs < 15;
    } else if (typeof obs.avpu === 'string' && obs.avpu.trim().toUpperCase() in AVPU_POINTS) {
        altered = obs.avpu.trim().toUpperCase() !== 'A';
    }
    if (altered === null) return fail('qSOFA requires mentation (gcs_total or avpu)');
    const score = (rr >= 22 ? 1 : 0) + (sbp <= 100 ? 1 : 0) + (altered ? 1 : 0);
    return { ok: true, score, high_risk: score >= 2, criteria: { rr_ge_22: rr >= 22, sbp_le_100: sbp <= 100, altered_mentation: altered } };
}

// ===================== SIRS =====================
// Temp >38 or <36; HR >90; RR >20; WBC >12000 or <4000 (cells/mm3). >= 2 => positive.
// Partial data: if the measurable criteria already reach 2 the screen is positive
// (flagged incomplete); otherwise a mostly-missing screen fails closed — a
// false-negative SIRS from unmeasured vitals is a patient-safety hazard.
function computeSIRS(obs) {
    const fail = (error) => ({ ok: false, score: null, positive: null, error });
    if (!obs || typeof obs !== 'object') return fail('SIRS observations missing');
    const temp = toNum(obs.temp), hr = toNum(obs.hr), rr = toNum(obs.rr), wbc = toNum(obs.wbc);
    const criteria = {};
    if (temp !== null) criteria.temp = temp > 38 || temp < 36;
    if (hr !== null) criteria.hr = hr > 90;
    if (rr !== null) criteria.rr = rr > 20;
    if (wbc !== null) criteria.wbc = wbc > 12000 || wbc < 4000;
    const measured = Object.keys(criteria).length;
    const score = Object.values(criteria).filter(Boolean).length;
    const complete = measured === 4;
    if (score >= 2) {
        return { ok: true, score, positive: true, complete, criteria };
    }
    if (!complete) {
        // not yet positive and not fully measured => cannot declare negative
        return fail(`SIRS incomplete (${measured}/4 measured, ${score} positive) — cannot rule out`);
    }
    return { ok: true, score, positive: false, complete: true, criteria };
}

// ===================== Sepsis screen (advisory combination) =====================
// suspected_infection + (qSOFA >= 2 or SIRS >= 2) => SEPSIS_ALERT (advisory).
// Deranged screens WITHOUT infection suspicion => DETERIORATION_ALERT.
// Both screens incomplete => fail-closed. NEVER a diagnosis.
function sepsisScreen(input) {
    const fail = (error) => ({ ok: false, alert: 'INCOMPLETE', error });
    if (!input || typeof input !== 'object') return fail('sepsis screen input missing');
    const q = computeQSOFA(input.qsofa || {});
    const s = computeSIRS(input.sirs || {});
    if (!q.ok && !s.ok) return fail('both qSOFA and SIRS incomplete — screen cannot run');
    const deranged = (q.ok && q.high_risk) || (s.ok && s.positive);
    const suspected = input.suspected_infection === true;
    let alert = 'NONE';
    if (deranged && suspected) alert = 'SEPSIS_ALERT';
    else if (deranged) alert = 'DETERIORATION_ALERT';
    return {
        ok: true, alert,
        qsofa: q.ok ? { score: q.score, high_risk: q.high_risk } : { incomplete: true },
        sirs: s.ok ? { score: s.score, positive: s.positive } : { incomplete: true },
        advisory: alert === 'SEPSIS_ALERT'
            ? 'Possible sepsis — screening alert only, NOT a diagnosis. Urgent clinician review, consider sepsis bundle per local policy.'
            : alert === 'DETERIORATION_ALERT'
                ? 'Physiological derangement without documented infection suspicion — urgent clinician review advised.'
                : 'Screens negative at this time; continue monitoring per policy.',
    };
}

// ===================== Escalation mapping =====================
// Deterministic, most-urgent wins. priority: 0 ROUTINE, 1 INCREASE_MONITORING,
// 2 URGENT_REVIEW, 3 RRT. Unknown inputs => UNKNOWN (never silently routine).
function escalationFor(input) {
    if (!input || typeof input !== 'object') return { level: 'UNKNOWN', priority: -1 };
    let priority = -1;
    const consider = (p) => { if (p > priority) priority = p; };
    const mews = toNum(input.mews);
    if (mews !== null) {
        if (mews >= 9) consider(3);
        else if (mews >= 5) consider(2);
        else if (mews >= 3) consider(1);
        else consider(0);
    }
    const pews = toNum(input.pews);
    if (pews !== null) {
        if (pews >= 6) consider(3);
        else if (pews >= 4) consider(2);
        else if (pews >= 2) consider(1);
        else consider(0);
    }
    const news2 = toNum(input.news2);
    if (news2 !== null) {
        if (news2 >= 7) consider(3);
        else if (news2 >= 5) consider(2);
        else if (news2 >= 3) consider(1);
        else consider(0);
    }
    if (input.sepsis_alert === 'SEPSIS_ALERT') consider(2);
    if (input.component_alert === true) consider(2);
    const LEVELS = { 0: 'ROUTINE', 1: 'INCREASE_MONITORING', 2: 'URGENT_REVIEW', 3: 'RRT' };
    if (priority < 0) return { level: 'UNKNOWN', priority: -1 };
    return { level: LEVELS[priority], priority };
}

module.exports = {
    computeMEWS, mewsBand,
    computePEWS, pewsBand,
    computeQSOFA, computeSIRS, sepsisScreen,
    escalationFor,
    PEDS_AGE_BANDS,
};
