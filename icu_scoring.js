/**
 * icu_scoring.js
 * ==========================================
 * ICU / Critical-Care acuity scoring — SERVER-SIDE, deterministic, pure-function engine.
 * (mirrors esi_engine.js / cds.js philosophy: FAIL-SAFE, anti-spoof, no I/O, no DB, no globals.)
 *
 * Patient-safety contract:
 *   - Scores (SOFA, GCS, APACHE-II-style acuity) are computed ENTIRELY from raw clinical
 *     observations. A client-supplied precomputed score / band is ADVISORY ONLY and is NEVER
 *     trusted — the server value is authoritative. compute*() ignore any sofa/gcs/apache/score/
 *     band fields on the input object.
 *   - Uncertainty errs toward SAFETY: a component with NO usable input contributes 0 points to
 *     the numeric score (cannot fabricate organ failure) BUT the component is flagged incomplete,
 *     and an all-/mostly-missing input set yields band 'Incomplete' rather than a falsely
 *     reassuring "low/normal" band (E6 Braden lesson — never silently reassure on missing data).
 *   - GCS missing entirely => null (Incomplete), never a falsely-high 15.
 *
 * Exposed:
 *   computeGCS(input)      -> { gcs, band, complete, components }
 *   computeSOFA(input)     -> { sofa, band, mortality_risk, complete, components, missing }
 *   computeAPACHE2(input)  -> { apache, band, mortality_risk, complete, components, missing }
 *   computeICUScores(input)-> { sofa, gcs, apache, band, mortality_risk, complete, components, missing }
 *
 * No I/O. Unit-testable in isolation (icu_scores_unit_test.js).
 */

'use strict';

// ---- helpers -------------------------------------------------------------

function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function norm(s) {
    return String(s === null || s === undefined ? '' : s).trim().toLowerCase();
}

// ============================================================
// GCS — Glasgow Coma Scale (eye 1-4 + verbal 1-5 + motor 1-6 => 3..15)
// ============================================================
// Accepts either a precomputed-from-components form (eye/verbal/motor) OR clamps a directly
// supplied total. Components are the authoritative path. A directly supplied `gcs` total on the
// input is IGNORED unless eye/verbal/motor are all absent AND gcs_total is explicitly provided as
// an observed bedside total (kept distinct from the spoofable `gcs` field).
function computeGCS(input) {
    input = input || {};
    const eye = toNum(input.gcs_eye != null ? input.gcs_eye : input.eye);
    const verbal = toNum(input.gcs_verbal != null ? input.gcs_verbal : input.verbal);
    const motor = toNum(input.gcs_motor != null ? input.gcs_motor : input.motor);

    const clamp = (v, lo, hi) => (v === null ? null : Math.max(lo, Math.min(hi, Math.round(v))));
    const e = clamp(eye, 1, 4);
    const vv = clamp(verbal, 1, 5);
    const m = clamp(motor, 1, 6);

    const components = { eye: e, verbal: vv, motor: m };

    let total = null;
    let complete = false;
    if (e !== null && vv !== null && m !== null) {
        total = e + vv + m;            // 3..15
        complete = true;
    } else {
        // Fall back to an explicitly observed bedside total ONLY (gcs_total), still clamped 3..15.
        const observed = clamp(toNum(input.gcs_total), 3, 15);
        if (observed !== null) { total = observed; complete = true; }
    }

    // Band by GCS total. Missing => 'Incomplete' (NOT a reassuring 'Mild').
    let band;
    if (total === null) band = 'Incomplete';
    else if (total <= 8) band = 'Severe';      // coma / airway risk
    else if (total <= 12) band = 'Moderate';
    else band = 'Mild';                        // 13-15

    return { gcs: total, band, complete, components };
}

// ============================================================
// SOFA — Sequential Organ Failure Assessment (6 organ systems, 0-4 each => 0..24)
// ============================================================
// Respiration (PaO2/FiO2), Coagulation (platelets), Liver (bilirubin), Cardiovascular (MAP /
// vasopressors), CNS (GCS), Renal (creatinine OR urine output). Each missing component scores 0
// (cannot fabricate failure) but is recorded in `missing` and reduces `complete`.
function sofaRespiration(input) {
    // PaO2/FiO2 ratio (mmHg). If only spo2 present we do NOT invent a ratio (missing).
    let ratio = toNum(input.pao2_fio2);
    if (ratio === null) {
        const pao2 = toNum(input.pao2);
        const fio2 = toNum(input.fio2); // percent (e.g. 50) or fraction (0.5)
        if (pao2 !== null && fio2 !== null && fio2 > 0) {
            const frac = fio2 > 1 ? fio2 / 100 : fio2;
            if (frac > 0) ratio = pao2 / frac;
        }
    }
    if (ratio === null) return { points: 0, missing: true, label: 'Respiration (PaO2/FiO2)' };
    const ventilated = input.ventilated === true || input.mechanically_ventilated === true;
    let pts;
    if (ratio < 100 && ventilated) pts = 4;
    else if (ratio < 200 && ventilated) pts = 3;
    else if (ratio < 300) pts = 2;
    else if (ratio < 400) pts = 1;
    else pts = 0;
    return { points: pts, missing: false, label: 'Respiration (PaO2/FiO2)' };
}

function sofaCoagulation(input) {
    const plt = toNum(input.platelets); // x10^3/µL
    if (plt === null) return { points: 0, missing: true, label: 'Coagulation (platelets)' };
    let pts;
    if (plt < 20) pts = 4;
    else if (plt < 50) pts = 3;
    else if (plt < 100) pts = 2;
    else if (plt < 150) pts = 1;
    else pts = 0;
    return { points: pts, missing: false, label: 'Coagulation (platelets)' };
}

function sofaLiver(input) {
    const bili = toNum(input.bilirubin); // mg/dL
    if (bili === null) return { points: 0, missing: true, label: 'Liver (bilirubin)' };
    let pts;
    if (bili >= 12.0) pts = 4;
    else if (bili >= 6.0) pts = 3;
    else if (bili >= 2.0) pts = 2;
    else if (bili >= 1.2) pts = 1;
    else pts = 0;
    return { points: pts, missing: false, label: 'Liver (bilirubin)' };
}

function sofaCardiovascular(input) {
    // Vasopressor dose dominates; otherwise MAP.
    const dopamine = toNum(input.dopamine);       // µg/kg/min
    const dobutamine = toNum(input.dobutamine);
    const epi = toNum(input.epinephrine);          // µg/kg/min
    const norepi = toNum(input.norepinephrine);
    const map = toNum(input.map != null ? input.map : input.mean_arterial_pressure);
    const anyPressor = [dopamine, dobutamine, epi, norepi].some(v => v !== null);

    if (!anyPressor && map === null) {
        return { points: 0, missing: true, label: 'Cardiovascular (MAP/pressors)' };
    }
    let pts = 0;
    if (epi !== null && epi > 0.1) pts = Math.max(pts, 4);
    else if (norepi !== null && norepi > 0.1) pts = Math.max(pts, 4);
    else if (dopamine !== null && dopamine > 15) pts = Math.max(pts, 4);
    else if (epi !== null && epi > 0 && epi <= 0.1) pts = Math.max(pts, 3);
    else if (norepi !== null && norepi > 0 && norepi <= 0.1) pts = Math.max(pts, 3);
    else if (dopamine !== null && dopamine > 5) pts = Math.max(pts, 3);
    else if ((dopamine !== null && dopamine > 0 && dopamine <= 5) ||
             (dobutamine !== null && dobutamine > 0)) pts = Math.max(pts, 2);
    else if (map !== null && map < 70) pts = Math.max(pts, 1);
    else pts = Math.max(pts, 0);
    return { points: pts, missing: false, label: 'Cardiovascular (MAP/pressors)' };
}

function sofaCNS(input, gcsTotal) {
    const g = (gcsTotal === null || gcsTotal === undefined) ? null : gcsTotal;
    if (g === null) return { points: 0, missing: true, label: 'CNS (GCS)' };
    let pts;
    if (g < 6) pts = 4;
    else if (g < 10) pts = 3;
    else if (g < 13) pts = 2;
    else if (g < 15) pts = 1;
    else pts = 0;
    return { points: pts, missing: false, label: 'CNS (GCS)' };
}

function sofaRenal(input) {
    const creat = toNum(input.creatinine); // mg/dL
    const urine = toNum(input.urine_output_24h != null ? input.urine_output_24h : input.urine_24h); // mL/day
    if (creat === null && urine === null) return { points: 0, missing: true, label: 'Renal (creatinine/urine)' };
    let pts = 0;
    if (creat !== null) {
        if (creat >= 5.0) pts = 4;
        else if (creat >= 3.5) pts = 3;
        else if (creat >= 2.0) pts = 2;
        else if (creat >= 1.2) pts = 1;
    }
    if (urine !== null) {
        if (urine < 200) pts = Math.max(pts, 4);
        else if (urine < 500) pts = Math.max(pts, 3);
    }
    return { points: pts, missing: false, label: 'Renal (creatinine/urine)' };
}

function sofaBand(total) {
    // Mortality bands per published SOFA mortality association (approximate, advisory).
    if (total <= 6) return { band: 'Low', mortality_risk: '<10%' };
    if (total <= 9) return { band: 'Moderate', mortality_risk: '15-20%' };
    if (total <= 12) return { band: 'High', mortality_risk: '40-50%' };
    if (total <= 14) return { band: 'Very High', mortality_risk: '50-60%' };
    return { band: 'Critical', mortality_risk: '>80%' };
}

function computeSOFA(input) {
    input = input || {};
    // CNS uses server-computed GCS (anti-spoof) — never the client gcs field directly.
    const gcs = computeGCS(input);

    const parts = {
        respiration: sofaRespiration(input),
        coagulation: sofaCoagulation(input),
        liver: sofaLiver(input),
        cardiovascular: sofaCardiovascular(input),
        cns: sofaCNS(input, gcs.gcs),
        renal: sofaRenal(input)
    };
    const components = {};
    const missing = [];
    let total = 0;
    let present = 0;
    for (const key of Object.keys(parts)) {
        const p = parts[key];
        components[key] = { points: p.points, missing: p.missing, label: p.label };
        total += p.points;
        if (p.missing) missing.push(p.label); else present++;
    }
    const totalSystems = Object.keys(parts).length;
    const complete = present === totalSystems;

    let bandInfo;
    // FAIL-SAFE: if too little data (fewer than half the organ systems measured) AND the
    // numeric score is not already alarming, do NOT emit a reassuring band — emit 'Incomplete'.
    if (present < Math.ceil(totalSystems / 2) && total < 7) {
        bandInfo = { band: 'Incomplete', mortality_risk: 'unknown (insufficient data)' };
    } else {
        bandInfo = sofaBand(total);
    }

    return {
        sofa: total,
        band: bandInfo.band,
        mortality_risk: bandInfo.mortality_risk,
        complete,
        components,
        missing
    };
}

// ============================================================
// APACHE-II-style acuity (simplified) — physiologic derangement points + GCS + age + chronic.
// ============================================================
// This is a SIMPLIFIED, deterministic acuity proxy (not the full 12-variable APACHE-II with
// all lab coefficients). It sums Acute Physiology Score (APS) contributions from temperature,
// MAP, HR, RR, SpO2/oxygenation, plus (15 - GCS), age points, and a chronic-health flag.
function apsTemp(t) {
    if (t === null) return { p: 0, missing: true };
    if (t >= 41 || t < 30) return { p: 4, missing: false };
    if (t >= 39 || t < 32) return { p: 3, missing: false };
    if (t < 34) return { p: 2, missing: false };
    if (t >= 38.5 || t < 36) return { p: 1, missing: false };
    return { p: 0, missing: false };
}
function apsMap(m) {
    if (m === null) return { p: 0, missing: true };
    if (m >= 160 || m < 50) return { p: 4, missing: false };
    if (m >= 130) return { p: 3, missing: false };
    if (m >= 110 || m < 70) return { p: 2, missing: false };
    return { p: 0, missing: false };
}
function apsHr(hr) {
    if (hr === null) return { p: 0, missing: true };
    if (hr >= 180 || hr < 40) return { p: 4, missing: false };
    if (hr >= 140 || hr < 55) return { p: 3, missing: false };
    if (hr >= 110 || hr < 70) return { p: 2, missing: false };
    return { p: 0, missing: false };
}
function apsRr(rr) {
    if (rr === null) return { p: 0, missing: true };
    if (rr >= 50 || rr < 6) return { p: 4, missing: false };
    if (rr >= 35) return { p: 3, missing: false };
    if (rr >= 25 || rr < 10) return { p: 2, missing: false };
    if (rr >= 12 && rr <= 24) return { p: 0, missing: false };
    return { p: 1, missing: false };
}
function apsOxy(spo2) {
    if (spo2 === null) return { p: 0, missing: true };
    if (spo2 < 85) return { p: 4, missing: false };
    if (spo2 < 90) return { p: 3, missing: false };
    if (spo2 < 92) return { p: 2, missing: false };
    if (spo2 < 95) return { p: 1, missing: false };
    return { p: 0, missing: false };
}
function agePoints(age) {
    if (age === null) return { p: 0, missing: true };
    if (age >= 75) return { p: 6, missing: false };
    if (age >= 65) return { p: 5, missing: false };
    if (age >= 55) return { p: 3, missing: false };
    if (age >= 45) return { p: 2, missing: false };
    return { p: 0, missing: false };
}
function apache2Band(total) {
    if (total <= 9) return { band: 'Low', mortality_risk: '~8%' };
    if (total <= 14) return { band: 'Moderate', mortality_risk: '~15%' };
    if (total <= 19) return { band: 'High', mortality_risk: '~25%' };
    if (total <= 24) return { band: 'Very High', mortality_risk: '~40%' };
    if (total <= 29) return { band: 'Severe', mortality_risk: '~55%' };
    return { band: 'Critical', mortality_risk: '>70%' };
}
function computeAPACHE2(input) {
    input = input || {};
    const v = input.vitals || input;
    const temp = toNum(v.temp != null ? v.temp : input.temp);
    const map = toNum(input.map != null ? input.map : input.mean_arterial_pressure);
    const hr = toNum(v.hr != null ? v.hr : input.hr);
    const rr = toNum(v.rr != null ? v.rr : input.rr);
    const spo2 = toNum(v.spo2 != null ? v.spo2 : input.spo2);
    const age = toNum(input.age);

    const gcs = computeGCS(input);
    const gcsPoints = gcs.gcs === null ? 0 : (15 - gcs.gcs); // 0..12

    const c = {
        temperature: apsTemp(temp),
        map: apsMap(map),
        heart_rate: apsHr(hr),
        respiratory_rate: apsRr(rr),
        oxygenation: apsOxy(spo2),
        age: agePoints(age)
    };
    const components = {};
    const missing = [];
    let total = 0;
    const physKeys = ['temperature', 'map', 'heart_rate', 'respiratory_rate', 'oxygenation'];
    for (const key of Object.keys(c)) {
        components[key] = { points: c[key].p, missing: c[key].missing };
        total += c[key].p;
        if (c[key].missing) { missing.push(key); }
    }
    // GCS contribution (server-computed; if missing => 0 but flagged).
    components.gcs = { points: gcsPoints, missing: gcs.gcs === null };
    if (gcs.gcs === null) missing.push('gcs'); else { total += gcsPoints; }

    // Chronic health (server-trusted flag; never a score).
    if (input.chronic_health === true || input.immunocompromised === true) {
        components.chronic_health = { points: 5, missing: false };
        total += 5;
    } else {
        components.chronic_health = { points: 0, missing: false };
    }

    // Of the 5 acute physiology vars + GCS (6 measurable), require >=3 to band; else Incomplete.
    // acutePresent counts strictly over acute-physiology + gcs (age is NOT acute physiology).
    const measurable = physKeys.length + 1; // +gcs
    let acutePresent = 0;
    for (const k of physKeys) if (!c[k].missing) acutePresent++;
    if (gcs.gcs !== null) acutePresent++;

    let bandInfo;
    if (acutePresent < Math.ceil(measurable / 2) && total < 10) {
        bandInfo = { band: 'Incomplete', mortality_risk: 'unknown (insufficient data)' };
    } else {
        bandInfo = apache2Band(total);
    }
    const complete = acutePresent === measurable && !c.age.missing;

    return {
        apache: total,
        band: bandInfo.band,
        mortality_risk: bandInfo.mortality_risk,
        complete,
        components,
        missing
    };
}

// ============================================================
// Aggregate — compute all three from one observation set.
// ============================================================
function computeICUScores(input) {
    input = input || {};
    const gcs = computeGCS(input);
    const sofa = computeSOFA(input);
    const apache = computeAPACHE2(input);
    return {
        gcs: gcs.gcs,
        gcs_band: gcs.band,
        sofa: sofa.sofa,
        sofa_band: sofa.band,
        sofa_mortality_risk: sofa.mortality_risk,
        apache: apache.apache,
        apache_band: apache.band,
        apache_mortality_risk: apache.mortality_risk,
        complete: gcs.complete && sofa.complete && apache.complete,
        components: { gcs: gcs.components, sofa: sofa.components, apache: apache.components },
        missing: { sofa: sofa.missing, apache: apache.missing }
    };
}

module.exports = {
    computeGCS,
    computeSOFA,
    computeAPACHE2,
    computeICUScores,
    // exposed for tests / reuse
    sofaBand,
    apache2Band
};
