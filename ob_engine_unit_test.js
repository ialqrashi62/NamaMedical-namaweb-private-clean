/**
 * ob_engine_unit_test.js — Epic E14 pure-engine unit test (DB-free).
 * Verifies the server-side authority calculators: EDD (Naegele), GA, GPAL derivation,
 * APGAR scoring + fail-closed on incomplete input, biometry GA, EFW percentile,
 * antenatal risk classification, and the delivery state machine.
 *   NODE_PATH=...\namaweb\node_modules node ob_engine_unit_test.js
 */
'use strict';
const E = require('./ob_engine');

let passed = 0, failed = 0;
function assert(cond, name, det = '') {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; }
}

console.log('\n=== E14 OB Engine — pure unit tests ===\n');

// ---- computeEDD (Naegele: LMP + 280 days) ----
assert(E.computeEDD('2026-01-15') === '2026-10-22', 'computeEDD: 2026-01-15 -> 2026-10-22 (LMP+280)', E.computeEDD('2026-01-15'));
assert(E.computeEDD('2025-01-01') === '2025-10-08', 'computeEDD: 2025-01-01 -> 2025-10-08', E.computeEDD('2025-01-01'));
assert(E.computeEDD(null) === null, 'computeEDD: null LMP -> null (fail-closed, no guess)');
assert(E.computeEDD('not-a-date') === null, 'computeEDD: invalid string -> null');
assert(E.computeEDD('2026-13-40') === null, 'computeEDD: out-of-range date -> null');

// ---- gestationalAgeFromLMP ----
const ga = E.gestationalAgeFromLMP('2026-01-01', '2026-03-12'); // 70 days = 10+0
assert(ga && ga.weeks === 10 && ga.days === 0 && ga.label === '10+0 weeks', 'GA: 70 days -> 10+0 weeks', JSON.stringify(ga));
assert(E.gestationalAgeFromLMP('2026-03-01', '2026-01-01') === null, 'GA: reference before LMP -> null (no negative GA)');
assert(E.gestationalAgeFromLMP(null, '2026-03-12') === null, 'GA: null LMP -> null');

// ---- computeGPAL ----
let g = E.computeGPAL({ gravida: 3, para: 1, abortion: 1, living: 1 });
assert(g.ok && g.gravida === 3 && g.para === 1 && g.abortion === 1 && g.living === 1, 'GPAL: valid 3/1/1/1 ok');
g = E.computeGPAL({ gravida: 2, para: 1, abortion: 0 });
assert(g.ok && g.living === 1, 'GPAL: living derived = para when omitted');
g = E.computeGPAL({ gravida: 1, para: 1, abortion: 1 });
assert(!g.ok, 'GPAL: para+abortion > gravida -> fail-closed (invalid)');
g = E.computeGPAL({ gravida: 0, para: 0, abortion: 0 });
assert(!g.ok, 'GPAL: gravida < 1 -> invalid');
g = E.computeGPAL({ gravida: 'x', para: 1, abortion: 0 });
assert(!g.ok, 'GPAL: non-integer gravida -> invalid (no string coercion)');

// ---- computeAPGAR (anti-spoof, fail-closed) ----
let a = E.computeAPGAR({ appearance: 'pink', pulse: 'above_100', grimace: 'cry', activity: 'active', respiration: 'good' });
assert(a.ok && a.total === 10, 'APGAR: all best -> 10', JSON.stringify(a));
a = E.computeAPGAR({ appearance: 'blue', pulse: 'absent', grimace: 'no_response', activity: 'limp', respiration: 'absent' });
assert(a.ok && a.total === 0, 'APGAR: all worst -> 0');
a = E.computeAPGAR({ appearance: 1, pulse: 2, grimace: 1, activity: 2, respiration: 1 });
assert(a.ok && a.total === 7, 'APGAR: numeric components -> 7');
a = E.computeAPGAR({ appearance: 'pink', pulse: 'above_100', grimace: 'cry', activity: 'active' });
assert(!a.ok && a.missing.includes('respiration'), 'APGAR: missing component -> fail-closed (NOT a reassuring 10)');
a = E.computeAPGAR({ appearance: 'pink', pulse: 'above_100', grimace: 'cry', activity: 'active', respiration: 'good', total: 0 });
assert(a.ok && a.total === 10, 'APGAR: client-supplied total IGNORED (anti-spoof)');
a = E.computeAPGAR({ appearance: 'bogus', pulse: 'above_100', grimace: 'cry', activity: 'active', respiration: 'good' });
assert(!a.ok, 'APGAR: unrecognised enum -> fail-closed');

// ---- gaFromBiometry ----
let b = E.gaFromBiometry({ bpd: 75, fl: 56, hc: 280, ac: 250 });
assert(b.ok && b.gaWeeks >= 28 && b.gaWeeks <= 34, 'biometry: typical 3rd-trimester biometry -> ~30wk', JSON.stringify(b));
assert(E.gaFromBiometry({}).ok === false, 'biometry: empty -> fail-closed');
assert(E.gaFromBiometry({ bpd: 0 }).ok === false, 'biometry: zero/invalid -> fail-closed');

// ---- efwPercentileBand ----
assert(E.efwPercentileBand(32, 1900).band === '10-90th', 'EFW: 1900g @32wk -> normal band');
assert(E.efwPercentileBand(32, 1000).flag === 'SGA_risk', 'EFW: 1000g @32wk -> SGA flag');
assert(E.efwPercentileBand(32, 3000).flag === 'LGA_risk', 'EFW: 3000g @32wk -> LGA flag');
assert(E.efwPercentileBand(null, 3000) === null, 'EFW: null GA -> null');

// ---- antenatalRiskFlags ----
assert(E.antenatalRiskFlags({ systolic: 150, diastolic: 95 }).includes('Hypertension'), 'risk: BP 150/95 -> Hypertension');
assert(E.antenatalRiskFlags({ systolic: 150, diastolic: 95, proteinuria: '++' }).includes('Pre-eclampsia risk'), 'risk: HTN + proteinuria -> Pre-eclampsia');
assert(E.antenatalRiskFlags({ hemoglobin: 9 }).includes('Anemia'), 'risk: Hb 9 -> Anemia');
assert(E.antenatalRiskFlags({ fetal_heart_rate: 170 }).includes('Abnormal FHR'), 'risk: FHR 170 -> Abnormal FHR');
assert(E.antenatalRiskFlags({ systolic: 120, diastolic: 80, hemoglobin: 12, fetal_heart_rate: 140 }).length === 0, 'risk: normal -> no flags');

// ---- deliveryTransitionAllowed (state machine) ----
assert(E.deliveryTransitionAllowed('Active').ok === true, 'state: Active -> delivery allowed');
assert(E.deliveryTransitionAllowed('Delivered').ok === false, 'state: Delivered -> rejected (terminal)');
assert(E.deliveryTransitionAllowed('Miscarriage').ok === false, 'state: Miscarriage -> rejected');
assert(E.deliveryTransitionAllowed('').ok === false, 'state: empty status -> rejected (incomplete)');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed === 0 ? 0 : 1);
