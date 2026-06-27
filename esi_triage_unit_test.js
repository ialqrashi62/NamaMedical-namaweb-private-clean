/**
 * esi_triage_unit_test.js
 * ==========================================
 * Unit tests for the SERVER-SIDE ESI engine (esi_engine.computeESI).
 * DB-free, no pool: requires the pure module directly and asserts deterministic outputs.
 *
 *   node esi_triage_unit_test.js
 *
 * Coverage:
 *   - danger-zone vitals  -> ESI-1 (life-saving) / ESI-2 (danger zone up-triage)
 *   - high-risk present.   -> ESI-2
 *   - resource boundaries  -> ESI-3 / 4 / 5
 *   - client-sent esi_level is IGNORED (server authoritative)
 *   - incomplete vitals handled safely (fail-safe ESI-3, never silent ESI-5)
 */

const esi = require('./esi_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== ESI Triage Engine Unit Tests (server-side, anti-spoof) ===${RESET}\n`);

// ---- A. Life-saving / ESI-1 ----
console.log(`${BOLD}[A] Immediate life-saving -> ESI-1${RESET}`);
assert(esi.computeESI({ requires_lifesaving: true }).esi_level === 1, 'requires_lifesaving flag => ESI-1');
assert(esi.computeESI({ cardiac_arrest: true }).esi_level === 1, 'cardiac arrest => ESI-1');
assert(esi.computeESI({ vitals: { spo2: 80 } }).esi_level === 1, 'critical hypoxia SpO2 80% => ESI-1');
assert(esi.computeESI({ vitals: { sbp: 70 } }).esi_level === 1, 'profound hypotension SBP 70 => ESI-1');
assert(esi.computeESI({ vitals: { hr: 200 } }).esi_level === 1, 'peri-arrest HR 200 => ESI-1');
assert(esi.computeESI({ loc: 'U' }).esi_level === 1, 'unresponsive (AVPU=U) => ESI-1');
{
    const r = esi.computeESI({ vitals: { spo2: 80 } });
    assert(r.decision_point === 'A' && Array.isArray(r.rationale) && r.rationale.length > 0, 'ESI-1 carries decision point A + rationale');
}

// ---- B. High-risk / altered LOC / severe pain -> ESI-2 ----
console.log(`\n${BOLD}[B] High-risk presentation -> ESI-2${RESET}`);
assert(esi.computeESI({ high_risk: true }).esi_level === 2, 'high_risk flag => ESI-2');
assert(esi.computeESI({ chief_complaint: 'crushing chest pain' }).esi_level === 2, 'chest pain complaint => ESI-2');
assert(esi.computeESI({ chief_complaint: 'possible stroke, facial droop' }).esi_level === 2, 'stroke complaint => ESI-2');
assert(esi.computeESI({ loc: 'confused' }).esi_level === 2, 'altered LOC (confused) => ESI-2');
assert(esi.computeESI({ pain_score: 9 }).esi_level === 2, 'severe pain 9/10 => ESI-2');
// Pain-score boundary: >=7 is the ESI-2 trigger; 6 is NOT.
assert(esi.computeESI({ pain_score: 7 }).esi_level === 2, 'pain 7/10 (boundary) => ESI-2');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, pain_score: 6, resource_count: 0, age: 40 }).esi_level !== 2, 'pain 6/10 with 0 resources + normal vitals => NOT ESI-2');
{
    const r = esi.computeESI({ high_risk: true });
    assert(r.decision_point === 'B' && r.high_risk === true, 'ESI-2 high-risk carries decision point B');
}

// ---- C. Resource boundaries -> ESI 3/4/5 ----
console.log(`\n${BOLD}[C] Resource count boundaries -> ESI-3/4/5${RESET}`);
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 0 }).esi_level === 5, '0 resources, normal vitals => ESI-5');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 1 }).esi_level === 4, '1 resource, normal vitals => ESI-4');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 2 }).esi_level === 3, '2 resources, normal vitals => ESI-3');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 5 }).esi_level === 3, '5 resources, normal vitals => ESI-3 (>=2 caps at 3)');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resources: ['labs', 'ct', 'iv fluids'] }).esi_level === 3, 'resource LIST of 3 => ESI-3');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resources: ['xray'] }).esi_level === 4, 'resource LIST of 1 => ESI-4');

// ---- D. Danger-zone vitals up-triage resource-path to ESI-2 ----
console.log(`\n${BOLD}[D] Danger-zone vitals up-triage -> ESI-2${RESET}`);
{
    // 1 resource would be ESI-4, but adult HR 120 (>100) danger-zone => up-triage to ESI-2.
    const r = esi.computeESI({ vitals: { hr: 120, rr: 16, spo2: 98 }, resource_count: 1, age: 40 });
    assert(r.esi_level === 2 && r.decision_point === 'D' && r.danger_zone === true, 'adult HR 120 + 1 resource => up-triage ESI-2 (DP D)');
}
assert(esi.computeESI({ vitals: { spo2: 90 }, resource_count: 0, age: 40 }).esi_level === 2, 'SpO2 90% danger-zone => ESI-2 even with 0 resources');
assert(esi.computeESI({ vitals: { hr: 96, rr: 18, spo2: 98 }, resource_count: 1, age: 40 }).esi_level === 4, 'adult HR 96 (not danger) + 1 resource => stays ESI-4');
// Pediatric danger-zone thresholds differ from adult (age<=3 uses HR>160, RR>40).
assert(esi.computeESI({ vitals: { hr: 150, rr: 20, spo2: 99 }, resource_count: 1, age: 2 }).esi_level === 4, 'toddler HR 150 (<160 toddler threshold) + 1 resource => stays ESI-4 (adult threshold NOT applied)');
assert(esi.computeESI({ vitals: { hr: 170, rr: 20, spo2: 99 }, resource_count: 1, age: 2 }).esi_level === 2, 'toddler HR 170 (>160) => danger-zone ESI-2');
// Same HR 150 in an ADULT (threshold 100) IS danger-zone => proves age-adjustment is real.
assert(esi.computeESI({ vitals: { hr: 150, rr: 16, spo2: 99 }, resource_count: 1, age: 40 }).esi_level === 2, 'adult HR 150 (>100 adult threshold) => danger-zone ESI-2 (age-adjusted)');

// ---- Anti-spoof: client-sent esi_level is IGNORED ----
console.log(`\n${BOLD}[Anti-spoof] client esi_level ignored — server authoritative${RESET}`);
{
    // Client claims ESI-5 but vitals are catastrophic => server must still return ESI-1.
    const r = esi.computeESI({ esi_level: 5, vitals: { spo2: 78 } });
    assert(r.esi_level === 1, 'client esi_level=5 with SpO2 78% => server returns ESI-1 (spoof ignored)');
}
{
    // Client claims ESI-1 but presentation is benign single-resource => server returns ESI-4.
    const r = esi.computeESI({ esi_level: 1, vitals: { hr: 78, rr: 14, spo2: 99 }, resource_count: 1, age: 40 });
    assert(r.esi_level === 4, 'client esi_level=1 with benign 1-resource => server returns ESI-4 (spoof ignored)');
}

// ---- Incomplete vitals handled safely (fail-safe, never silent under-triage) ----
console.log(`\n${BOLD}[Fail-safe] incomplete inputs${RESET}`);
{
    const r = esi.computeESI({});  // nothing at all
    assert(r.esi_level === 3 && r.fail_safe === true, 'empty input => fail-safe ESI-3 (NOT ESI-5)');
}
{
    const r = esi.computeESI({ vitals: { hr: 80 } }); // partial vitals, no resource estimate
    assert(r.esi_level === 3 && r.fail_safe === true, 'partial vitals, unknown resources => fail-safe ESI-3');
}
{
    // Partial vitals but a danger-zone HR still fires regardless of missing fields.
    const r = esi.computeESI({ vitals: { hr: 130 }, resource_count: 0, age: 40 });
    assert(r.esi_level === 2 && r.danger_zone === true, 'missing RR/SpO2 but HR 130 danger-zone => ESI-2 (no silent down-triage)');
}
assert(esi.computeESI({}).triage_color === 'Yellow', 'ESI-3 maps to Yellow color');
assert(esi.computeESI({ vitals: { spo2: 80 } }).triage_color === 'Red', 'ESI-1 maps to Red color');
assert(esi.computeESI({ vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 0 }).priority === 5, 'priority equals esi_level for board ordering');

console.log(`\n${BOLD}${BLUE}=== ESI Unit Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
