/**
 * icu_scores_unit_test.js
 * ==========================================
 * Unit tests for the SERVER-SIDE ICU acuity engine (icu_scoring.js).
 * DB-free, no pool: requires the pure module directly and asserts deterministic outputs.
 *
 *   node icu_scores_unit_test.js
 *
 * Coverage:
 *   - GCS components 3..15 + bands (Severe/Moderate/Mild); missing => Incomplete (NOT 15)
 *   - SOFA per-organ boundary points (respiration/coag/liver/cardio/cns/renal)
 *   - SOFA bands + fail-safe Incomplete on too-little data
 *   - APACHE-II-style acuity boundaries + bands
 *   - client-sent score/band IGNORED (server authoritative, anti-spoof)
 *   - incomplete input => Incomplete band, never a falsely-reassuring low band
 */

const icu = require('./icu_scoring');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== ICU Scoring Engine Unit Tests (server-side, anti-spoof) ===${RESET}\n`);

// ---- GCS ----
console.log(`${BOLD}[GCS] components 3..15 + bands${RESET}`);
assert(icu.computeGCS({ gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 }).gcs === 15, 'E4 V5 M6 => GCS 15');
assert(icu.computeGCS({ gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 }).band === 'Mild', 'GCS 15 => Mild');
assert(icu.computeGCS({ gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1 }).gcs === 3, 'E1 V1 M1 => GCS 3 (floor)');
assert(icu.computeGCS({ gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1 }).band === 'Severe', 'GCS 3 => Severe');
assert(icu.computeGCS({ gcs_eye: 3, gcs_verbal: 4, gcs_motor: 5 }).gcs === 12, 'E3 V4 M5 => GCS 12');
assert(icu.computeGCS({ gcs_eye: 3, gcs_verbal: 4, gcs_motor: 5 }).band === 'Moderate', 'GCS 12 => Moderate (boundary)');
assert(icu.computeGCS({ gcs_eye: 4, gcs_verbal: 4, gcs_motor: 5 }).band === 'Mild', 'GCS 13 => Mild (boundary)');
assert(icu.computeGCS({ gcs_eye: 1, gcs_verbal: 2, gcs_motor: 5 }).band === 'Severe', 'GCS 8 => Severe (boundary)');
assert(icu.computeGCS({ gcs_eye: 1, gcs_verbal: 3, gcs_motor: 5 }).band === 'Moderate', 'GCS 9 => Moderate (boundary)');
// clamping out-of-range components
assert(icu.computeGCS({ gcs_eye: 9, gcs_verbal: 9, gcs_motor: 9 }).gcs === 15, 'out-of-range components clamp to GCS 15');
// MISSING => Incomplete, never a falsely-high 15
{
    const r = icu.computeGCS({});
    assert(r.gcs === null && r.band === 'Incomplete' && r.complete === false, 'no GCS input => gcs null + band Incomplete (NOT 15/Mild)');
}
{
    const r = icu.computeGCS({ gcs_eye: 4, gcs_verbal: 5 }); // motor missing
    assert(r.gcs === null && r.band === 'Incomplete', 'partial GCS (motor missing) => Incomplete');
}
// observed bedside total path
assert(icu.computeGCS({ gcs_total: 7 }).gcs === 7 && icu.computeGCS({ gcs_total: 7 }).band === 'Severe', 'observed gcs_total=7 honored => Severe');

// ---- SOFA per-organ boundaries ----
console.log(`\n${BOLD}[SOFA] per-organ boundary points${RESET}`);
// Respiration: ratio<300 =>2, <200(vent)=>3, <100(vent)=>4, >=400=>0
assert(icu.computeSOFA({ pao2_fio2: 250 }).components.respiration.points === 2, 'PaO2/FiO2 250 => resp 2');
assert(icu.computeSOFA({ pao2_fio2: 150, ventilated: true }).components.respiration.points === 3, 'PaO2/FiO2 150 + vent => resp 3');
assert(icu.computeSOFA({ pao2_fio2: 90, ventilated: true }).components.respiration.points === 4, 'PaO2/FiO2 90 + vent => resp 4');
assert(icu.computeSOFA({ pao2_fio2: 90 }).components.respiration.points === 2, 'PaO2/FiO2 90 WITHOUT vent => resp 2 (no vent escalation)');
assert(icu.computeSOFA({ pao2_fio2: 450 }).components.respiration.points === 0, 'PaO2/FiO2 450 => resp 0');
// derived ratio from pao2 + fio2%
assert(icu.computeSOFA({ pao2: 90, fio2: 50 }).components.respiration.points === 2, 'pao2 90 / fio2 50% => ratio 180 => resp 2');
// Coagulation
assert(icu.computeSOFA({ platelets: 19 }).components.coagulation.points === 4, 'platelets 19 => coag 4');
assert(icu.computeSOFA({ platelets: 49 }).components.coagulation.points === 3, 'platelets 49 => coag 3');
assert(icu.computeSOFA({ platelets: 99 }).components.coagulation.points === 2, 'platelets 99 => coag 2');
assert(icu.computeSOFA({ platelets: 149 }).components.coagulation.points === 1, 'platelets 149 => coag 1');
assert(icu.computeSOFA({ platelets: 200 }).components.coagulation.points === 0, 'platelets 200 => coag 0');
// Liver
assert(icu.computeSOFA({ bilirubin: 12 }).components.liver.points === 4, 'bilirubin 12 => liver 4');
assert(icu.computeSOFA({ bilirubin: 2.0 }).components.liver.points === 2, 'bilirubin 2.0 => liver 2 (boundary)');
assert(icu.computeSOFA({ bilirubin: 1.0 }).components.liver.points === 0, 'bilirubin 1.0 => liver 0');
// Cardiovascular
assert(icu.computeSOFA({ map: 65 }).components.cardiovascular.points === 1, 'MAP 65 (<70) => cardio 1');
assert(icu.computeSOFA({ map: 80 }).components.cardiovascular.points === 0, 'MAP 80 => cardio 0');
assert(icu.computeSOFA({ dopamine: 3 }).components.cardiovascular.points === 2, 'dopamine 3 => cardio 2');
assert(icu.computeSOFA({ norepinephrine: 0.05 }).components.cardiovascular.points === 3, 'norepi 0.05 => cardio 3');
assert(icu.computeSOFA({ norepinephrine: 0.2 }).components.cardiovascular.points === 4, 'norepi 0.2 => cardio 4');
// CNS via server-computed GCS
assert(icu.computeSOFA({ gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1 }).components.cns.points === 4, 'GCS 3 => CNS 4');
assert(icu.computeSOFA({ gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 }).components.cns.points === 0, 'GCS 15 => CNS 0');
// Renal
assert(icu.computeSOFA({ creatinine: 5.0 }).components.renal.points === 4, 'creatinine 5.0 => renal 4');
assert(icu.computeSOFA({ creatinine: 2.0 }).components.renal.points === 2, 'creatinine 2.0 => renal 2 (boundary)');
assert(icu.computeSOFA({ urine_output_24h: 150 }).components.renal.points === 4, 'urine 150 mL/24h => renal 4');
assert(icu.computeSOFA({ urine_output_24h: 400 }).components.renal.points === 3, 'urine 400 mL/24h => renal 3');

// ---- SOFA total + bands ----
console.log(`\n${BOLD}[SOFA] total + bands${RESET}`);
{
    // Build a full set: resp4 + coag4 + liver4 + cardio4 + cns4 + renal4 = 24 => Critical
    const r = icu.computeSOFA({
        pao2_fio2: 90, ventilated: true, platelets: 10, bilirubin: 12,
        norepinephrine: 0.2, gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1, creatinine: 5
    });
    assert(r.sofa === 24, 'all-max SOFA => 24 ' + r.sofa);
    assert(r.band === 'Critical', 'SOFA 24 => Critical band');
    assert(r.complete === true && r.missing.length === 0, 'fully-measured SOFA => complete, no missing');
}
{
    const r = icu.computeSOFA({ pao2_fio2: 350, platelets: 200, bilirubin: 0.5, map: 80, gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6, creatinine: 0.9 });
    assert(r.sofa <= 2 && r.band === 'Low', 'healthy full set => Low band ' + r.sofa);
}

// ---- SOFA fail-safe: too-little data => Incomplete (NOT a reassuring Low) ----
console.log(`\n${BOLD}[SOFA] fail-safe on missing data${RESET}`);
{
    const r = icu.computeSOFA({ platelets: 200 }); // only 1 of 6 systems, score 0
    assert(r.band === 'Incomplete', 'only 1 organ measured + score 0 => Incomplete (NOT Low)');
    assert(r.missing.length >= 5, 'missing list flags the unmeasured organs');
    assert(r.complete === false, 'single-organ SOFA => not complete');
}
{
    // sparse data but already alarming => still band it (do not hide danger behind Incomplete).
    const r = icu.computeSOFA({ norepinephrine: 0.2, platelets: 10 }); // cardio4 + coag4 = 8
    assert(r.sofa === 8 && r.band !== 'Incomplete', 'sparse but alarming SOFA 8 => banded (Moderate), not Incomplete');
}

// ---- APACHE-II acuity boundaries + bands ----
console.log(`\n${BOLD}[APACHE-II] acuity boundaries + bands${RESET}`);
{
    const r = icu.computeAPACHE2({ vitals: { temp: 37, hr: 80, rr: 16, spo2: 98 }, map: 90, age: 40, gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 });
    assert(r.apache === 0 && r.band === 'Low', 'normal physiology + young + GCS15 => APACHE 0 / Low');
}
{
    const r = icu.computeAPACHE2({ vitals: { temp: 41, hr: 190, rr: 55, spo2: 80 }, map: 40, age: 80, gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1, chronic_health: true });
    // temp4 + hr4 + rr4 + oxy4 + map4 + age6 + gcs(15-3=12) + chronic5 = 43 => Critical
    assert(r.apache >= 30 && r.band === 'Critical', 'extreme derangement => Critical band (apache ' + r.apache + ')');
}
assert(icu.computeAPACHE2({ vitals: { temp: 39, hr: 80, rr: 16, spo2: 98 }, map: 90, age: 40, gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 }).components.temperature.points === 3, 'temp 39 => 3 APS points');
assert(icu.computeAPACHE2({ vitals: { temp: 37, hr: 80, rr: 16, spo2: 91 }, map: 90, age: 40, gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6 }).components.oxygenation.points === 2, 'SpO2 91 => 2 oxygenation points');
// APACHE fail-safe on missing acute physiology
{
    const r = icu.computeAPACHE2({ age: 40 }); // no acute physiology, no gcs
    assert(r.band === 'Incomplete', 'APACHE with no acute physiology => Incomplete (NOT Low)');
}

// ---- anti-spoof: client-sent score/band IGNORED ----
console.log(`\n${BOLD}[anti-spoof] client score/band ignored — server authoritative${RESET}`);
{
    // Client claims SOFA 0 / band Low, but raw inputs are catastrophic.
    const r = icu.computeSOFA({ sofa: 0, band: 'Low', score: 0, norepinephrine: 0.2, platelets: 10, bilirubin: 12, pao2_fio2: 90, ventilated: true, gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1, creatinine: 5 });
    assert(r.sofa === 24 && r.band === 'Critical', 'client SOFA 0/Low IGNORED — server computes 24/Critical from raw inputs');
}
{
    // Client claims GCS 15, but components say 3.
    const r = icu.computeGCS({ gcs: 15, gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1 });
    assert(r.gcs === 3, 'client gcs=15 IGNORED — server computes 3 from components');
}
{
    const r = icu.computeAPACHE2({ apache: 0, apache_ii: 0, band: 'Low', vitals: { temp: 41, hr: 190, rr: 55, spo2: 80 }, map: 40, age: 80, gcs_eye: 1, gcs_verbal: 1, gcs_motor: 1 });
    assert(r.band !== 'Low' && r.apache > 20, 'client APACHE 0/Low IGNORED — server computes high acuity');
}

// ---- aggregate ----
console.log(`\n${BOLD}[aggregate] computeICUScores${RESET}`);
{
    const r = icu.computeICUScores({ gcs_eye: 4, gcs_verbal: 5, gcs_motor: 6, platelets: 200, bilirubin: 0.5, map: 80, pao2_fio2: 400, creatinine: 0.9, vitals: { temp: 37, hr: 80, rr: 16, spo2: 98 }, age: 30 });
    assert(typeof r.sofa === 'number' && typeof r.apache === 'number' && r.gcs === 15, 'aggregate returns sofa/apache/gcs together');
}

console.log(`\n${BOLD}${BLUE}=== ICU Scoring Unit Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
