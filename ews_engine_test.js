/**
 * ews_engine_test.js — PURE-ENGINE unit test for Gate 2 (early-warning + sepsis screen).
 * Run: node ews_engine_test.js   (no DB; deterministic)
 *
 * Safety invariants:
 *  - MEWS/PEWS/qSOFA/SIRS are computed server-side from raw observations; client
 *    totals are never trusted.
 *  - Missing critical observations => 'Incomplete' — a partial screen must NEVER
 *    report a falsely-reassuring "negative"/low score.
 *  - Escalation mapping is deterministic and errs toward the more urgent action.
 */
'use strict';
const E = require('./ews_engine');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}

console.log(`${BOLD}Gate 2 — EWS / sepsis screening engine (pure unit test)${RESET}\n`);

// ---- MEWS ----
console.log('[1] computeMEWS — normal, deranged, fail-closed');
let m = E.computeMEWS({ sbp: 120, hr: 80, rr: 12, temp: 37.0, avpu: 'A' });
assert(m.ok === true && m.score === 0 && m.band === 'Low', 'all-normal -> MEWS 0 Low', JSON.stringify(m));
m = E.computeMEWS({ sbp: 75, hr: 135, rr: 32, temp: 39.0, avpu: 'P' });
// 2 (sbp 71-80) + 3 (hr>=130) + 3 (rr>=30) + 2 (temp>=38.5) + 2 (P) = 12
assert(m.ok === true && m.score === 12 && m.band === 'Critical', 'shocked septic -> MEWS 12 Critical', JSON.stringify(m));
m = E.computeMEWS({ sbp: 95, hr: 105, rr: 21, temp: 36.5, avpu: 'A' });
// 1 + 1 + 2 + 0 + 0 = 4
assert(m.ok === true && m.score === 4 && m.band === 'Medium', 'moderate derangement -> 4 Medium', JSON.stringify(m));
m = E.computeMEWS({ sbp: 120, hr: 80, temp: 37.0, avpu: 'A' });
assert(m.ok === false && m.band === 'Incomplete', 'missing RR -> Incomplete (never reassuring 0)', JSON.stringify(m));
m = E.computeMEWS({ sbp: 'abc', hr: 80, rr: 12, temp: 37.0, avpu: 'A' });
assert(m.ok === false, 'garbage sbp -> fail-closed', JSON.stringify(m));
m = E.computeMEWS({ sbp: 120, hr: 80, rr: 12, temp: 37.0, avpu: 'X' });
assert(m.ok === false, 'invalid AVPU -> fail-closed', JSON.stringify(m));
m = E.computeMEWS({ sbp: 210, hr: 45, rr: 9, temp: 34.0, avpu: 'A' });
// 2 (>=200) + 1 (40-50) + 0 (9-14) + 2 (<35) + 0 = 5
assert(m.ok === true && m.score === 5 && m.band === 'High', 'hypertensive brady hypothermic -> 5 High', JSON.stringify(m));

// ---- PEWS (Monaghan-style, age-banded) ----
console.log('\n[2] computePEWS — pediatric age-banded, fail-closed');
let p = E.computePEWS({ age_months: 24, behavior: 'playing', cardiovascular: 'pink', crt_seconds: 1, rr: 28, hr: 110, retractions: false, fio2_percent: 21 });
assert(p.ok === true && p.score === 0 && p.band === 'Low', 'well toddler -> PEWS 0', JSON.stringify(p));
p = E.computePEWS({ age_months: 24, behavior: 'lethargic', cardiovascular: 'grey_mottled', crt_seconds: 5, rr: 60, hr: 185, retractions: true, fio2_percent: 50 });
assert(p.ok === true && p.score >= 8 && p.band === 'Critical', 'shocked child -> PEWS Critical', JSON.stringify(p));
p = E.computePEWS({ age_months: 24, behavior: 'irritable', cardiovascular: 'pale', crt_seconds: 3, rr: 47, hr: 125, retractions: false, fio2_percent: 21 });
// behavior 2 + cv 1 + resp (rr 47 = +12 over 35 upper => >10 above = 1) = 4
assert(p.ok === true && p.score === 4 && p.band === 'High', 'moderate sick child -> 4 High', JSON.stringify(p));
p = E.computePEWS({ age_months: 24, behavior: 'playing', cardiovascular: 'pink', crt_seconds: 1, hr: 110, retractions: false, fio2_percent: 21 });
assert(p.ok === false && p.band === 'Incomplete', 'missing RR -> Incomplete', JSON.stringify(p));
p = E.computePEWS({ behavior: 'playing', cardiovascular: 'pink', crt_seconds: 1, rr: 28, hr: 110, retractions: false, fio2_percent: 21 });
assert(p.ok === false, 'missing age -> fail-closed (age-banded norms required)', JSON.stringify(p));
p = E.computePEWS({ age_months: 24, behavior: 'dancing', cardiovascular: 'pink', crt_seconds: 1, rr: 28, hr: 110, retractions: false, fio2_percent: 21 });
assert(p.ok === false, 'unknown behavior descriptor -> fail-closed', JSON.stringify(p));
// any single component = 3 escalates even if total < 4
p = E.computePEWS({ age_months: 24, behavior: 'lethargic', cardiovascular: 'pink', crt_seconds: 1, rr: 28, hr: 110, retractions: false, fio2_percent: 21 });
assert(p.ok === true && p.score === 3 && p.component_alert === true && p.band === 'High', 'single component 3 -> component_alert High', JSON.stringify(p));

// ---- qSOFA ----
console.log('\n[3] computeQSOFA — criteria counting, fail-closed');
let q = E.computeQSOFA({ rr: 24, sbp: 95, gcs_total: 14 });
assert(q.ok === true && q.score === 3 && q.high_risk === true, 'all 3 criteria -> 3 high risk', JSON.stringify(q));
q = E.computeQSOFA({ rr: 16, sbp: 120, gcs_total: 15 });
assert(q.ok === true && q.score === 0 && q.high_risk === false, 'normal -> 0', JSON.stringify(q));
q = E.computeQSOFA({ rr: 22, sbp: 100, gcs_total: 15 });
assert(q.ok === true && q.score === 2 && q.high_risk === true, 'boundaries rr>=22 sbp<=100 -> 2 high risk', JSON.stringify(q));
q = E.computeQSOFA({ rr: 24, sbp: 95 });
assert(q.ok === false, 'missing mentation -> Incomplete (no false-negative screen)', JSON.stringify(q));
q = E.computeQSOFA({ rr: 24, sbp: 95, avpu: 'V' });
assert(q.ok === true && q.score === 3, 'AVPU V accepted as altered mentation', JSON.stringify(q));

// ---- SIRS ----
console.log('\n[4] computeSIRS — criteria counting, fail-closed');
let s = E.computeSIRS({ temp: 39.0, hr: 110, rr: 24, wbc: 15000 });
assert(s.ok === true && s.score === 4 && s.positive === true, 'all 4 -> SIRS positive', JSON.stringify(s));
s = E.computeSIRS({ temp: 37.0, hr: 80, rr: 14, wbc: 8000 });
assert(s.ok === true && s.score === 0 && s.positive === false, 'normal -> 0 negative', JSON.stringify(s));
s = E.computeSIRS({ temp: 35.5, hr: 95, rr: 14, wbc: 8000 });
assert(s.ok === true && s.score === 2 && s.positive === true, 'hypothermia + tachycardia -> 2 positive', JSON.stringify(s));
s = E.computeSIRS({ temp: 39.0, hr: 110, rr: 24 });
// wbc missing: 3 measurable criteria already >= 2 -> positive is determinable, but flag incomplete
assert(s.ok === true && s.score === 3 && s.positive === true && s.complete === false, 'missing wbc but already positive -> positive, flagged incomplete', JSON.stringify(s));
s = E.computeSIRS({ temp: 37.0, hr: 80 });
assert(s.ok === false, 'half the criteria unmeasurable and not yet positive -> Incomplete (never false negative)', JSON.stringify(s));
s = E.computeSIRS({ temp: 37.0, hr: 95, rr: 14, wbc: 3000 });
assert(s.ok === true && s.score === 2 && s.positive === true, 'leukopenia counts', JSON.stringify(s));

// ---- sepsis screen (advisory combination) ----
console.log('\n[5] sepsisScreen — advisory, never diagnostic, fail-closed');
let sc = E.sepsisScreen({ suspected_infection: true, qsofa: { rr: 24, sbp: 95, gcs_total: 14 }, sirs: { temp: 39.0, hr: 110, rr: 24, wbc: 15000 } });
assert(sc.ok === true && sc.alert === 'SEPSIS_ALERT' , 'infection + qSOFA>=2 -> SEPSIS_ALERT', JSON.stringify(sc));
assert(typeof sc.advisory === 'string' && sc.advisory.length > 0, 'alert carries advisory text (not a diagnosis)', JSON.stringify(sc));
sc = E.sepsisScreen({ suspected_infection: false, qsofa: { rr: 24, sbp: 95, gcs_total: 14 }, sirs: { temp: 39.0, hr: 110, rr: 24, wbc: 15000 } });
assert(sc.ok === true && sc.alert === 'DETERIORATION_ALERT', 'no infection suspicion but deranged -> deterioration alert, not sepsis', JSON.stringify(sc));
sc = E.sepsisScreen({ suspected_infection: true, qsofa: { rr: 16, sbp: 120, gcs_total: 15 }, sirs: { temp: 37.0, hr: 80, rr: 16, wbc: 8000 } });
assert(sc.ok === true && sc.alert === 'NONE', 'infection suspected but screens negative -> NONE', JSON.stringify(sc));
sc = E.sepsisScreen({ suspected_infection: true, qsofa: { rr: 24, sbp: 95 }, sirs: { temp: 37.0, hr: 80 } });
assert(sc.ok === false, 'both screens incomplete and not-yet-positive -> fail-closed Incomplete', JSON.stringify(sc));
// partial SIRS that already reaches 2 criteria IS determinable -> alert fires (safe direction)
sc = E.sepsisScreen({ suspected_infection: true, qsofa: { rr: 24, sbp: 95 }, sirs: { temp: 39.0, hr: 110 } });
assert(sc.ok === true && sc.alert === 'SEPSIS_ALERT', 'incomplete qSOFA but SIRS already positive -> alert still fires', JSON.stringify(sc));

// ---- escalation mapping ----
console.log('\n[6] escalationFor — deterministic, most-urgent wins');
let esc = E.escalationFor({ mews: 12 });
assert(esc.level === 'RRT' && esc.priority === 3, 'MEWS 12 -> RRT activation', JSON.stringify(esc));
esc = E.escalationFor({ mews: 4 });
assert(esc.level === 'INCREASE_MONITORING' && esc.priority === 1, 'MEWS 4 -> increase monitoring', JSON.stringify(esc));
esc = E.escalationFor({ mews: 0 });
assert(esc.level === 'ROUTINE' && esc.priority === 0, 'MEWS 0 -> routine', JSON.stringify(esc));
esc = E.escalationFor({ mews: 4, sepsis_alert: 'SEPSIS_ALERT' });
assert(esc.level === 'URGENT_REVIEW' || esc.level === 'RRT', 'sepsis alert overrides low MEWS upward', JSON.stringify(esc));
esc = E.escalationFor({ pews: 4 });
assert(esc.priority >= 2, 'PEWS 4 -> at least urgent review', JSON.stringify(esc));
esc = E.escalationFor({});
assert(esc.level === 'UNKNOWN', 'no inputs -> UNKNOWN (never silently routine)', JSON.stringify(esc));

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
