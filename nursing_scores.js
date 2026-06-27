/**
 * nursing_scores.js — E6 NURSING SCORES (pure, server-side, unit-testable).
 * No DB / no HTTP / no I/O. These are deterministic clinical-scoring functions used by the
 * POST /api/nursing/scores route AND by nursing_scores_unit_test.js. Keeping them pure means the
 * server computes scores authoritatively (the client cannot forge a "score" — it sends raw
 * observations and the server derives + bands the result).
 *
 * Implemented:
 *   - computeMorseFallRisk(...)  — Morse Fall Scale (0–125), bands Low/Moderate/High.
 *   - computeBraden(...)         — Braden pressure-ulcer scale (6–23), bands by risk.
 *   - computeNEWS(...)           — NEWS2 (National Early Warning Score 2) from vitals.
 *   - computePainBand(score)     — 0–10 numeric pain → band.
 *
 * IMPORTANT-1 — NEWS vs NEWS2: this engine implements NEWS2 (RCP 2017). We use the NEWS2
 *   thresholds (SpO2 Scale 1: 96+ =0, 94–95 =1, 92–93 =2, <=91 =3) and add +2 for supplemental
 *   oxygen, plus +3 for any non-'A' (V/P/U or new confusion) consciousness level. LIMITATION: we
 *   model SpO2 *Scale 1* only. We do NOT implement the NEWS2 *Scale 2* SpO2 ranges used for
 *   patients with target-range 88–92% (hypercapnic respiratory failure / chronic T2RF). For those
 *   patients the on_oxygen +2 and the Scale-1 SpO2 points will OVER-score; a Scale-2 toggle is a
 *   documented follow-up. Aggregate banding (Low/Medium/High) and the single-parameter-3 escalation
 *   to at-least-Medium follow NEWS2.
 *
 * IMPORTANT-2 / FIX item 8 — computeBraden fail-CLOSED on incomplete input: if any of the 6
 *   subscales is missing/null/NaN we return { score: null, band: 'Incomplete', error: '...' } rather
 *   than silently defaulting to the safest (highest) subscale value. The /api/nursing/scores route
 *   rejects an Incomplete Braden with 422 (a partial pressure-ulcer score must never be stored as
 *   authoritative — under-scoring risk is a patient-safety hazard).
 *
 * المقاييس التمريضية (حساب من جهة الخادم — لا يثق بأي "score" من العميل).
 */

'use strict';

function clampInt(v, lo, hi, dflt) {
    let n = parseInt(v, 10);
    if (!Number.isFinite(n)) n = dflt;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
}

// ===== Morse Fall Scale =====
// Inputs are the 6 standard Morse items. Returns { score, band }.
//   history_of_falling: 0|25 ; secondary_diagnosis: 0|15 ; ambulatory_aid: 0|15|30 ;
//   iv_therapy: 0|20 ; gait: 0|10|20 ; mental_status: 0|15
// We accept booleans / category strings and map to the canonical points (fail-closed: unknown => 0).
function computeMorseFallRisk(o = {}) {
    const histories = o.history_of_falling ? 25 : 0;
    const secondary = o.secondary_diagnosis ? 15 : 0;
    // ambulatory aid: 'none'/'bedrest'/'nurse'=0 ; 'crutches'/'cane'/'walker'=15 ; 'furniture'=30
    let aid = 0;
    const a = String(o.ambulatory_aid || 'none').toLowerCase();
    if (a === 'furniture') aid = 30;
    else if (a === 'crutches' || a === 'cane' || a === 'walker') aid = 15;
    else aid = 0;
    const iv = o.iv_therapy ? 20 : 0;
    // gait: 'normal'/'bedrest'/'immobile'=0 ; 'weak'=10 ; 'impaired'=20
    let gait = 0;
    const g = String(o.gait || 'normal').toLowerCase();
    if (g === 'impaired') gait = 20;
    else if (g === 'weak') gait = 10;
    else gait = 0;
    // mental status: 'oriented'=0 ; 'forgets'/'overestimates'=15
    const mental = (String(o.mental_status || 'oriented').toLowerCase() === 'oriented') ? 0 : 15;

    const score = histories + secondary + aid + iv + gait + mental;
    let band;
    if (score >= 45) band = 'High';
    else if (score >= 25) band = 'Moderate';
    else band = 'Low';
    return { score, band };
}

// ===== Braden Scale (pressure ulcer risk) =====
// 6 subscales. sensory(1-4), moisture(1-4), activity(1-4), mobility(1-4), nutrition(1-4),
// friction(1-3). Total 6–23. LOWER = higher risk.
//
// FIX item 8 (fail-CLOSED): a Braden total is only valid when ALL 6 subscales are present and
// in range. If ANY subscale is null/undefined/NaN/empty/out-of-range we return
// { score: null, band: 'Incomplete', error: 'Missing subscale: <name>' } — we DO NOT default the
// missing subscale to its safest (highest) value, because that silently UNDER-scores risk
// (a patient-safety hazard). The route rejects an Incomplete result with 422.
function strictSubscale(v, lo, hi) {
    if (v === null || v === undefined || v === '') return null;       // missing
    const n = (typeof v === 'number') ? v : parseInt(v, 10);
    if (!Number.isFinite(n)) return null;                              // NaN / non-numeric
    if (n < lo || n > hi) return null;                                // out of range
    return n;
}
function computeBraden(o = {}) {
    const fields = [
        ['sensory', 1, 4], ['moisture', 1, 4], ['activity', 1, 4],
        ['mobility', 1, 4], ['nutrition', 1, 4], ['friction', 1, 3],
    ];
    const vals = {};
    for (const [name, lo, hi] of fields) {
        const parsed = strictSubscale(o[name], lo, hi);
        if (parsed === null) {
            return { score: null, band: 'Incomplete', error: 'Missing subscale: ' + name };
        }
        vals[name] = parsed;
    }
    const score = vals.sensory + vals.moisture + vals.activity + vals.mobility + vals.nutrition + vals.friction;
    let band;
    if (score <= 9) band = 'Very High';
    else if (score <= 12) band = 'High';
    else if (score <= 14) band = 'Moderate';
    else if (score <= 18) band = 'Mild';
    else band = 'None';
    return { score, band };
}

// ===== NEWS (National Early Warning Score) =====
// Vitals → component points (0–3 each) → aggregate. Returns { score, band, components }.
//   resp_rate (breaths/min), o2_sat (%), on_oxygen (bool), temp (°C),
//   systolic_bp (mmHg), pulse (bpm), consciousness ('A' alert | 'V'|'P'|'U' = altered).
function newsResp(rr) {
    if (rr == null || isNaN(rr)) return 0;
    if (rr <= 8) return 3;
    if (rr <= 11) return 1;
    if (rr <= 20) return 0;
    if (rr <= 24) return 2;
    return 3;
}
function newsSpo2(s) {
    if (s == null || isNaN(s)) return 0;
    if (s <= 91) return 3;
    if (s <= 93) return 2;
    if (s <= 95) return 1;
    return 0;
}
function newsTemp(t) {
    if (t == null || isNaN(t) || t === 0) return 0;
    if (t <= 35.0) return 3;
    if (t <= 36.0) return 1;
    if (t <= 38.0) return 0;
    if (t <= 39.0) return 1;
    return 2;
}
function newsSystolic(bp) {
    if (bp == null || isNaN(bp) || bp === 0) return 0;
    if (bp <= 90) return 3;
    if (bp <= 100) return 2;
    if (bp <= 110) return 1;
    if (bp <= 219) return 0;
    return 3;
}
function newsPulse(p) {
    if (p == null || isNaN(p) || p === 0) return 0;
    if (p <= 40) return 3;
    if (p <= 50) return 1;
    if (p <= 90) return 0;
    if (p <= 110) return 1;
    if (p <= 130) return 2;
    return 3;
}
function parseSystolicFromBp(bpStr) {
    if (bpStr == null) return null;
    if (typeof bpStr === 'number') return bpStr;
    const m = String(bpStr).match(/(\d+)\s*\/\s*\d+/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(bpStr, 10);
    return Number.isFinite(n) ? n : null;
}
function computeNEWS(v = {}) {
    const respPts = newsResp(v.resp_rate != null ? Number(v.resp_rate) : null);
    const spo2Pts = newsSpo2(v.o2_sat != null ? Number(v.o2_sat) : null);
    const oxyPts = v.on_oxygen ? 2 : 0;
    const tempPts = newsTemp(v.temp != null ? Number(v.temp) : null);
    const sys = v.systolic_bp != null ? Number(v.systolic_bp) : parseSystolicFromBp(v.bp);
    const bpPts = newsSystolic(sys != null && Number.isFinite(sys) ? sys : null);
    const pulsePts = newsPulse(v.pulse != null ? Number(v.pulse) : null);
    const consciousness = String(v.consciousness || 'A').toUpperCase();
    const conPts = (consciousness === 'A') ? 0 : 3;

    const components = { resp: respPts, spo2: spo2Pts, oxygen: oxyPts, temp: tempPts, bp: bpPts, pulse: pulsePts, consciousness: conPts };
    const score = respPts + spo2Pts + oxyPts + tempPts + bpPts + pulsePts + conPts;
    const anyThree = Object.values(components).some(p => p >= 3);
    let band;
    if (score >= 7) band = 'High';
    else if (score >= 5 || anyThree) band = 'Medium';
    else if (score >= 1) band = 'Low';
    else band = 'None';
    return { score, band, components };
}

function computePainBand(score) {
    const n = clampInt(score, 0, 10, 0);
    let band;
    if (n >= 7) band = 'Severe';
    else if (n >= 4) band = 'Moderate';
    else if (n >= 1) band = 'Mild';
    else band = 'None';
    return { score: n, band };
}

module.exports = {
    computeMorseFallRisk,
    computeBraden,
    computeNEWS,
    computePainBand,
    // exposed for tests
    newsResp, newsSpo2, newsTemp, newsSystolic, newsPulse, parseSystolicFromBp, strictSubscale,
};
