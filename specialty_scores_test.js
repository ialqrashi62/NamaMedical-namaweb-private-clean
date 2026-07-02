/**
 * specialty_scores_test.js — PURE-ENGINE unit test for Gate 1 (server-side specialty scores).
 * Run: node specialty_scores_test.js   (no DB; deterministic)
 *
 * Safety invariant: clinical scores (GCS, DAS28, NIHSS) are computed/validated
 * server-side from raw inputs. Incomplete/invalid critical input must return a
 * fail-CLOSED { ok:false, band:'Incomplete' } — NEVER a falsely-reassuring default
 * (e.g. a missing GCS component must not silently become a normal 15).
 */
'use strict';
const S = require('./specialty_scores');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

console.log(`${BOLD}Gate 1 — Specialty clinical score engine (pure unit test)${RESET}\n`);

// ---- GCS ----
console.log('[1] computeGCS — sum, bands, fail-closed');
let g = S.computeGCS({ eye: 4, verbal: 5, motor: 6 });
assert(g.ok === true && g.total === 15 && g.band === 'Mild', 'E4V5M6 -> 15 Mild', JSON.stringify(g));
g = S.computeGCS({ eye: 3, verbal: 4, motor: 5 });
assert(g.ok === true && g.total === 12 && g.band === 'Moderate', 'E3V4M5 -> 12 Moderate', JSON.stringify(g));
g = S.computeGCS({ eye: 1, verbal: 1, motor: 1 });
assert(g.ok === true && g.total === 3 && g.band === 'Severe', 'E1V1M1 -> 3 Severe', JSON.stringify(g));
g = S.computeGCS({ eye: 3, verbal: 3, motor: 3 });
assert(g.ok === true && g.total === 9 && g.band === 'Moderate', 'total 9 -> Moderate (boundary)', JSON.stringify(g));
g = S.computeGCS({ eye: 2, verbal: 3, motor: 3 });
assert(g.ok === true && g.total === 8 && g.band === 'Severe', 'total 8 -> Severe (boundary)', JSON.stringify(g));
// fail-closed: missing motor must NOT become 15
g = S.computeGCS({ eye: 4, verbal: 5 });
assert(g.ok === false && g.total === null && g.band === 'Incomplete', 'missing motor -> Incomplete (not reassuring default)', JSON.stringify(g));
// out-of-range component rejected
g = S.computeGCS({ eye: 9, verbal: 5, motor: 6 });
assert(g.ok === false && g.band === 'Incomplete', 'eye=9 out of range -> Incomplete', JSON.stringify(g));
g = S.computeGCS({ eye: 4, verbal: 0, motor: 6 });
assert(g.ok === false && g.band === 'Incomplete', 'verbal=0 out of range -> Incomplete', JSON.stringify(g));
g = S.computeGCS(null);
assert(g.ok === false && g.band === 'Incomplete', 'null input -> Incomplete', JSON.stringify(g));

// ---- DAS28-ESR ----
console.log('\n[2] computeDAS28ESR — formula, category, fail-closed');
let d = S.computeDAS28ESR({ tjc28: 4, sjc28: 3, esr: 30, gh: 40 });
assert(d.ok === true && approx(d.score, 4.55), 'TJC4 SJC3 ESR30 GH40 -> 4.55', JSON.stringify(d));
assert(d.category === 'Moderate', '4.55 -> Moderate category', JSON.stringify(d));
d = S.computeDAS28ESR({ tjc28: 0, sjc28: 0, esr: 5, gh: 5 });
assert(d.ok === true && d.score < 2.6 && d.category === 'Remission', 'low activity -> Remission', JSON.stringify(d));
d = S.computeDAS28ESR({ tjc28: 20, sjc28: 18, esr: 80, gh: 90 });
assert(d.ok === true && d.score > 5.1 && d.category === 'High', 'high activity -> High', JSON.stringify(d));
// fail-closed: ESR must be > 0 (ln undefined otherwise)
d = S.computeDAS28ESR({ tjc28: 4, sjc28: 3, esr: 0, gh: 40 });
assert(d.ok === false && d.score === null, 'ESR=0 -> fail-closed (ln undefined)', JSON.stringify(d));
d = S.computeDAS28ESR({ tjc28: 4, sjc28: 3, gh: 40 });
assert(d.ok === false && d.score === null, 'missing ESR -> fail-closed', JSON.stringify(d));
d = S.computeDAS28ESR({ tjc28: 40, sjc28: 3, esr: 30, gh: 40 });
assert(d.ok === false, 'TJC>28 out of range -> fail-closed', JSON.stringify(d));

// ---- DAS28-CRP ----
console.log('\n[3] computeDAS28CRP — formula, fail-closed');
let c = S.computeDAS28CRP({ tjc28: 4, sjc28: 3, crp: 10, gh: 40 });
assert(c.ok === true && approx(c.score, 3.99), 'TJC4 SJC3 CRP10 GH40 -> 3.99', JSON.stringify(c));
assert(c.category === 'Moderate', '3.99 -> Moderate', JSON.stringify(c));
c = S.computeDAS28CRP({ tjc28: 4, sjc28: 3, crp: -1, gh: 40 });
assert(c.ok === false, 'CRP<0 -> fail-closed', JSON.stringify(c));
// CRP=0 is valid (ln(0+1)=0)
c = S.computeDAS28CRP({ tjc28: 0, sjc28: 0, crp: 0, gh: 0 });
assert(c.ok === true && approx(c.score, 0.96), 'all-zero CRP -> baseline 0.96', JSON.stringify(c));

// ---- NIHSS ----
console.log('\n[4] NIHSS — item sum, validation, total-guard');
const zeroItems = { loc:0, loc_questions:0, loc_commands:0, gaze:0, visual:0, facial:0,
  arm_left:0, arm_right:0, leg_left:0, leg_right:0, ataxia:0, sensory:0, language:0, dysarthria:0, extinction:0 };
let n = S.computeNIHSS(zeroItems);
assert(n.ok === true && n.total === 0 && n.band === 'None', 'all-zero -> 0 None', JSON.stringify(n));
const maxItems = { loc:3, loc_questions:2, loc_commands:2, gaze:2, visual:3, facial:3,
  arm_left:4, arm_right:4, leg_left:4, leg_right:4, ataxia:2, sensory:2, language:3, dysarthria:2, extinction:2 };
n = S.computeNIHSS(maxItems);
assert(n.ok === true && n.total === 42 && n.band === 'Severe', 'all-max -> 42 Severe', JSON.stringify(n));
// item out of range -> fail-closed
n = S.computeNIHSS({ ...zeroItems, arm_left: 9 });
assert(n.ok === false && n.total === null, 'arm_left=9 out of range -> fail-closed', JSON.stringify(n));
// missing item -> fail-closed (no silent 0)
const missing = { ...zeroItems }; delete missing.extinction;
n = S.computeNIHSS(missing);
assert(n.ok === false, 'missing item -> fail-closed', JSON.stringify(n));
// validateNIHSSTotal (when only the total is available from client UI)
let vt = S.validateNIHSSTotal(7);
assert(vt.ok === true && vt.total === 7 && vt.band === 'Moderate', 'total 7 -> Moderate', JSON.stringify(vt));
vt = S.validateNIHSSTotal(43);
assert(vt.ok === false, 'total 43 out of range -> reject', JSON.stringify(vt));
vt = S.validateNIHSSTotal(-1);
assert(vt.ok === false, 'total -1 -> reject', JSON.stringify(vt));
vt = S.validateNIHSSTotal('abc');
assert(vt.ok === false, 'non-numeric total -> reject', JSON.stringify(vt));
vt = S.validateNIHSSTotal(0);
assert(vt.ok === true && vt.band === 'None', 'total 0 -> None', JSON.stringify(vt));

// ---- parseOptionalInt (shared absent-vs-garbage contract) ----
console.log('\n[5] parseOptionalInt — absent vs invalid vs valid');
let p = S.parseOptionalInt(undefined, 0, 28);
assert(p.provided === false && p.ok === true && p.value === null, 'undefined -> not provided, null', JSON.stringify(p));
p = S.parseOptionalInt('', 0, 28);
assert(p.provided === false && p.ok === true && p.value === null, "'' -> not provided, null", JSON.stringify(p));
p = S.parseOptionalInt(null, 0, 28);
assert(p.provided === false && p.ok === true && p.value === null, 'null -> not provided, null', JSON.stringify(p));
p = S.parseOptionalInt('12', 0, 28);
assert(p.provided === true && p.ok === true && p.value === 12, "'12' -> 12", JSON.stringify(p));
p = S.parseOptionalInt(0, 0, 28);
assert(p.provided === true && p.ok === true && p.value === 0, '0 -> 0 (falsy-zero safe)', JSON.stringify(p));
p = S.parseOptionalInt('12abc', 0, 28);
assert(p.provided === true && p.ok === false, "'12abc' -> invalid (NOT lenient parseInt 12)", JSON.stringify(p));
p = S.parseOptionalInt('abc', 0, 28);
assert(p.provided === true && p.ok === false, "'abc' -> invalid (never NaN passthrough)", JSON.stringify(p));
p = S.parseOptionalInt(29, 0, 28);
assert(p.provided === true && p.ok === false, '29 -> out of range invalid', JSON.stringify(p));
p = S.parseOptionalInt(7.5, 0, 42);
assert(p.provided === true && p.ok === false, '7.5 -> non-integer invalid', JSON.stringify(p));

// ---- validateGCSComponents (unified partial semantics for neurology + trauma) ----
console.log('\n[6] validateGCSComponents — complete, partial, invalid');
let v = S.validateGCSComponents({ eye: 4, verbal: 5, motor: 6 });
assert(v.ok === true && v.complete === true && v.total === 15 && v.band === 'Mild', 'complete E4V5M6 -> total 15', JSON.stringify(v));
v = S.validateGCSComponents({ motor: 5 });
assert(v.ok === true && v.complete === false && v.total === null && v.components.motor === 5 && v.components.eye === null,
  'motor-only partial -> ok, total NULL (rapid trauma)', JSON.stringify(v));
v = S.validateGCSComponents({});
assert(v.ok === true && v.complete === false && v.total === null && v.components.eye === null, 'none provided -> ok, all NULL (unassessed)', JSON.stringify(v));
v = S.validateGCSComponents({ eye: 'abc' });
assert(v.ok === false, "eye='abc' -> invalid 422 (NaN must not leak to DB)", JSON.stringify(v));
v = S.validateGCSComponents({ eye: 9, verbal: 5, motor: 6 });
assert(v.ok === false, 'eye=9 -> invalid', JSON.stringify(v));
v = S.validateGCSComponents({ verbal: 6 });
assert(v.ok === false, 'verbal=6 partial out of range -> invalid', JSON.stringify(v));

// ---- ICU point totals (server-computed, anti-spoof) ----
console.log('\n[7] sumSOFAPoints / sumAPACHE2Points — server-side totals');
let sf = S.sumSOFAPoints({ pao2_fio2: 3, platelets: 2, bilirubin: 1, map_vasopressor: 4, gcs: 2, creatinine: 1 });
assert(sf.ok === true && sf.total === 13, 'SOFA points sum -> 13', JSON.stringify(sf));
sf = S.sumSOFAPoints({ pao2_fio2: 4, platelets: 4, bilirubin: 4, map_vasopressor: 4, gcs: 4, creatinine: 4 });
assert(sf.ok === true && sf.total === 24, 'SOFA max -> 24', JSON.stringify(sf));
sf = S.sumSOFAPoints({});
assert(sf.ok === true && sf.total === 0 && sf.complete === false, 'SOFA none provided -> 0, flagged incomplete', JSON.stringify(sf));
sf = S.sumSOFAPoints({ pao2_fio2: 5 });
assert(sf.ok === false, 'SOFA organ points 5 -> invalid (max 4)', JSON.stringify(sf));
sf = S.sumSOFAPoints({ gcs: 'abc' });
assert(sf.ok === false, "SOFA gcs='abc' -> invalid", JSON.stringify(sf));

let ap = S.sumAPACHE2Points({ temp: 1, map: 2, hr: 3, rr: 0, pao2: 4, ph: 2, na: 1, k: 0, creatinine: 2, hct: 1, wbc: 0, gcs_points: 5, age_points: 3, chronic_points: 2 });
assert(ap.ok === true && ap.total === 26, 'APACHE-II points sum -> 26', JSON.stringify(ap));
ap = S.sumAPACHE2Points({ temp: 4, map: 4, hr: 4, rr: 4, pao2: 4, ph: 4, na: 4, k: 4, creatinine: 8, hct: 4, wbc: 4, gcs_points: 12, age_points: 6, chronic_points: 5 });
assert(ap.ok === true && ap.total === 71, 'APACHE-II max -> 71', JSON.stringify(ap));
ap = S.sumAPACHE2Points({ temp: 5 });
assert(ap.ok === false, 'APACHE physiologic points 5 -> invalid (max 4)', JSON.stringify(ap));
ap = S.sumAPACHE2Points({ gcs_points: 13 });
assert(ap.ok === false, 'APACHE gcs_points 13 -> invalid (max 12)', JSON.stringify(ap));
ap = S.sumAPACHE2Points({});
assert(ap.ok === true && ap.total === 0 && ap.complete === false, 'APACHE none -> 0, incomplete', JSON.stringify(ap));

// ---- APGAR total validation ----
console.log('\n[8] validateAPGARTotal — 0-10 guard');
let ag = S.validateAPGARTotal(9);
assert(ag.ok === true && ag.total === 9, 'APGAR 9 -> ok', JSON.stringify(ag));
ag = S.validateAPGARTotal(0);
assert(ag.ok === true && ag.total === 0, 'APGAR 0 -> ok (falsy-zero safe)', JSON.stringify(ag));
ag = S.validateAPGARTotal(11);
assert(ag.ok === false, 'APGAR 11 -> reject', JSON.stringify(ag));
ag = S.validateAPGARTotal('abc');
assert(ag.ok === false, "APGAR 'abc' -> reject", JSON.stringify(ag));

// ---- FEV1/FVC ratio (server-derived, anti-spoof) ----
console.log('\n[9] computeFEV1FVC — server-derived ratio, fail-closed');
let f = S.computeFEV1FVC(2.1, 3.0);
assert(f.ok === true && approx(f.ratio, 0.7), 'FEV1 2.1 / FVC 3.0 -> 0.70', JSON.stringify(f));
f = S.computeFEV1FVC(1.1, 2.0);
assert(f.ok === true && approx(f.ratio, 0.55) && f.obstructive_pattern === true, '0.55 -> obstructive flag', JSON.stringify(f));
f = S.computeFEV1FVC(3.0, 3.0);
assert(f.ok === true && approx(f.ratio, 1.0) && f.obstructive_pattern === false, 'ratio 1.0 -> not obstructive', JSON.stringify(f));
f = S.computeFEV1FVC(3.5, 3.0);
assert(f.ok === false, 'FEV1 > FVC -> physiologically inconsistent, reject', JSON.stringify(f));
f = S.computeFEV1FVC(0, 3.0);
assert(f.ok === false, 'FEV1 0 -> reject (non-positive)', JSON.stringify(f));
f = S.computeFEV1FVC(2.1, null);
assert(f.ok === false, 'missing FVC -> fail-closed', JSON.stringify(f));
f = S.computeFEV1FVC(15, 20);
assert(f.ok === false, 'implausible volumes (>12L) -> reject', JSON.stringify(f));

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
