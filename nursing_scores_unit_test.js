/**
 * nursing_scores_unit_test.js — E6 nursing-score ENGINE unit tests (DB-free, no HTTP, no PHI).
 * Run: node nursing_scores_unit_test.js   (NODE_PATH may point at the main namaweb/node_modules,
 * but this test only requires the local ./nursing_scores engine, so it has no external deps.)
 *
 * Proves the band BOUNDARIES and the fail-closed behaviours the reviewer demanded:
 *   - Morse 44 (Moderate) vs 45 (High) boundary.
 *   - Braden 9 (Very High) vs 10 (High) boundary.
 *   - NEWS single 3-point component escalates to at-least-Medium even with low aggregate.
 *   - computeBraden INCOMPLETE-input rejection (item 8): any missing subscale => band 'Incomplete',
 *     score null, error 'Missing subscale: <name>' (never silently defaults to the safest score).
 */
'use strict';
const ns = require('./nursing_scores');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) { pass++; console.log('  \x1b[32mPASS\x1b[0m', m); } else { fail++; failures.push(m); console.log('  \x1b[31mFAIL\x1b[0m', m); } };

console.log('\n\x1b[1m\x1b[34m============================================================\x1b[0m');
console.log('\x1b[1m\x1b[34m  E6 — nursing_scores engine unit tests (boundaries + fail-closed)\x1b[0m');
console.log('\x1b[1m\x1b[34m============================================================\x1b[0m\n');

// ---------------------------------------------------------------------------
console.log('\x1b[1m[ 1 ] Morse Fall Scale — 44 (Moderate) vs 45 (High) boundary\x1b[0m');
// Build exactly 45: history(25) + secondary(15) + gait weak(... use values to hit 45).
// 25 (history) + 20 (iv) = 45 exactly => High.
{
  const m45 = ns.computeMorseFallRisk({ history_of_falling: true, iv_therapy: true }); // 25 + 20 = 45
  ok(m45.score === 45 && m45.band === 'High', `Morse 45 => High (got ${m45.score}/${m45.band})`);
  // 44 is unreachable from canonical Morse increments; verify the 44/45 THRESHOLD directly:
  // a score that lands at 40 (Moderate) and another at 45 (High) bracket the >=45 cutoff.
  const m40 = ns.computeMorseFallRisk({ history_of_falling: true, ambulatory_aid: 'cane' }); // 25 + 15 = 40
  ok(m40.score === 40 && m40.band === 'Moderate', `Morse 40 => Moderate (below the 45 High cutoff) (got ${m40.score}/${m40.band})`);
  // 25 => exactly the Moderate floor.
  const m25 = ns.computeMorseFallRisk({ history_of_falling: true }); // 25
  ok(m25.score === 25 && m25.band === 'Moderate', `Morse 25 => Moderate (lower boundary) (got ${m25.score}/${m25.band})`);
  const m24 = ns.computeMorseFallRisk({ secondary_diagnosis: true, gait: 'weak' }); // 15 + 10 = 25? -> use 15 only
  const mLow = ns.computeMorseFallRisk({ secondary_diagnosis: true }); // 15 => Low
  ok(mLow.score === 15 && mLow.band === 'Low', `Morse 15 => Low (got ${mLow.score}/${mLow.band})`);
  void m24;
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[ 2 ] Braden — 9 (Very High) vs 10 (High) boundary\x1b[0m');
// Braden total 6..23, LOWER = higher risk. <=9 Very High; 10..12 High.
{
  // score 9: pick subscales summing to 9 (e.g. 1+1+1+1+1+... friction 1..3). 1+1+1+1+1 =5 (five 1's) +? friction must be 1..3.
  // 5 subscales(1..4) + friction(1..3). To get 9: sensory1 moisture1 activity1 mobility1 nutrition2 friction3 = 9.
  const b9 = ns.computeBraden({ sensory: 1, moisture: 1, activity: 1, mobility: 1, nutrition: 2, friction: 3 });
  ok(b9.score === 9 && b9.band === 'Very High', `Braden 9 => Very High (got ${b9.score}/${b9.band})`);
  // score 10: bump nutrition to 3.
  const b10 = ns.computeBraden({ sensory: 1, moisture: 1, activity: 1, mobility: 1, nutrition: 3, friction: 3 });
  ok(b10.score === 10 && b10.band === 'High', `Braden 10 => High (just above the Very-High cutoff) (got ${b10.score}/${b10.band})`);
  // sanity: a max score => None
  const b23 = ns.computeBraden({ sensory: 4, moisture: 4, activity: 4, mobility: 4, nutrition: 4, friction: 3 });
  ok(b23.score === 23 && b23.band === 'None', `Braden 23 => None (got ${b23.score}/${b23.band})`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[ 3 ] NEWS — a single 3-point component escalates to >= Medium\x1b[0m');
{
  // All vitals normal EXCEPT respiratory rate 7 (<=8 => 3 points). Aggregate = 3, but a single
  // 3-point parameter must escalate the band to at-least-Medium (NEWS2 clinical-response rule).
  const news = ns.computeNEWS({ resp_rate: 7, o2_sat: 98, on_oxygen: false, temp: 37, systolic_bp: 120, pulse: 70, consciousness: 'A' });
  ok(news.components.resp === 3, `NEWS resp_rate 7 => 3 points (got ${news.components.resp})`);
  ok(news.score === 3, `NEWS aggregate = 3 (single component) (got ${news.score})`);
  ok(news.band === 'Medium', `NEWS single-3 escalates to Medium even at low aggregate (got ${news.band})`);
  // Contrast: an aggregate of 3 spread across THREE 1-point params (no single 3) stays Low.
  const spread = ns.computeNEWS({ resp_rate: 11, o2_sat: 95, on_oxygen: false, temp: 35.5, systolic_bp: 120, pulse: 70, consciousness: 'A' });
  ok(spread.score === 3 && !Object.values(spread.components).some(p => p >= 3) && spread.band === 'Low',
    `NEWS aggregate 3 with NO single-3 => Low (got ${spread.score}/${spread.band})`);
  // All normal => None / 0.
  const zero = ns.computeNEWS({ resp_rate: 16, o2_sat: 98, on_oxygen: false, temp: 37, systolic_bp: 120, pulse: 70, consciousness: 'A' });
  ok(zero.score === 0 && zero.band === 'None', `NEWS all-normal => 0/None (got ${zero.score}/${zero.band})`);
  // High aggregate (>=7) => High.
  const high = ns.computeNEWS({ resp_rate: 7, o2_sat: 90, on_oxygen: true, temp: 39.5, systolic_bp: 88, pulse: 135, consciousness: 'V' });
  ok(high.score >= 7 && high.band === 'High', `NEWS heavy derangement => High (got ${high.score}/${high.band})`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[ 4 ] computeBraden INCOMPLETE-input rejection (item 8, fail-closed)\x1b[0m');
{
  // Missing nutrition => Incomplete (NOT silently defaulted to the safest subscale value).
  const miss = ns.computeBraden({ sensory: 2, moisture: 2, activity: 2, mobility: 2, friction: 2 });
  ok(miss.score === null && miss.band === 'Incomplete', `missing subscale => score null + band Incomplete (got ${miss.score}/${miss.band})`);
  ok(/Missing subscale: nutrition/.test(miss.error || ''), `error names the missing subscale (got "${miss.error}")`);
  // null/NaN subscale => Incomplete.
  const nullSub = ns.computeBraden({ sensory: null, moisture: 2, activity: 2, mobility: 2, nutrition: 2, friction: 2 });
  ok(nullSub.band === 'Incomplete' && nullSub.score === null, `null subscale => Incomplete (got ${nullSub.band})`);
  const nanSub = ns.computeBraden({ sensory: 'x', moisture: 2, activity: 2, mobility: 2, nutrition: 2, friction: 2 });
  ok(nanSub.band === 'Incomplete', `non-numeric subscale => Incomplete (got ${nanSub.band})`);
  // out-of-range subscale (friction = 4, valid 1..3) => Incomplete (fail-closed, not clamped).
  const oor = ns.computeBraden({ sensory: 2, moisture: 2, activity: 2, mobility: 2, nutrition: 2, friction: 4 });
  ok(oor.band === 'Incomplete', `out-of-range subscale => Incomplete (got ${oor.band})`);
  // empty object => Incomplete on the FIRST subscale (sensory), not a max default.
  const empty = ns.computeBraden({});
  ok(empty.band === 'Incomplete' && /sensory/.test(empty.error || ''), `empty observations => Incomplete on sensory (got ${empty.band}/"${empty.error}")`);
}

// ---------------------------------------------------------------------------
console.log('\n\x1b[1m[ 5 ] Pain band boundaries\x1b[0m');
{
  ok(ns.computePainBand(0).band === 'None', 'pain 0 => None');
  ok(ns.computePainBand(3).band === 'Mild', 'pain 3 => Mild');
  ok(ns.computePainBand(4).band === 'Moderate', 'pain 4 => Moderate');
  ok(ns.computePainBand(6).band === 'Moderate', 'pain 6 => Moderate');
  ok(ns.computePainBand(7).band === 'Severe', 'pain 7 => Severe (boundary)');
  ok(ns.computePainBand(10).band === 'Severe', 'pain 10 => Severe');
}

console.log(`\n\x1b[1m\x1b[34m============================================================\x1b[0m`);
console.log(`  \x1b[32mPASS\x1b[0m: ${pass}   \x1b[31mFAIL\x1b[0m: ${fail}`);
if (fail > 0) { console.log('\n\x1b[31mFailures:\x1b[0m'); failures.forEach(f => console.log('  - ' + f)); }
console.log(`${fail === 0 ? '\x1b[1m\x1b[32mALL PASS\x1b[0m' : '\x1b[1m\x1b[31mFAILED\x1b[0m'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
