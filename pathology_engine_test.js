/**
 * pathology_engine_test.js — E15 pure-engine unit test (DB-free).
 * Validates the state machine, immutability, flag derivation, accession format.
 *   node pathology_engine_test.js
 */
'use strict';
const eng = require('./pathology_engine');

const GREEN = '\x1b[32m', RED = '\x1b[31m', BLUE = '\x1b[34m', BOLD = '\x1b[1m', RESET = '\x1b[0m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name) {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}`); failed++; failures.push(name); }
}

console.log(`\n${BOLD}${BLUE}E15 Pathology Engine — Unit Tests${RESET}\n`);

// ----- State machine forward-only -----
console.log(`${BOLD}[1] State machine${RESET}`);
assert(eng.isValidTransition('Received', 'Grossing'), 'Received -> Grossing allowed');
assert(eng.isValidTransition('Grossing', 'Processing'), 'Grossing -> Processing allowed');
assert(eng.isValidTransition('Processing', 'Reported'), 'Processing -> Reported allowed');
assert(eng.isValidTransition('Reported', 'SignedOut'), 'Reported -> SignedOut allowed');
assert(eng.isValidTransition('Received', 'SignedOut'), 'skip-ahead Received -> SignedOut allowed (forward)');
assert(!eng.isValidTransition('Processing', 'Received'), 'backward Processing -> Received REJECTED');
assert(!eng.isValidTransition('Reported', 'Grossing'), 'backward Reported -> Grossing REJECTED');
assert(!eng.isValidTransition('Received', 'Received'), 'self-loop REJECTED');
assert(!eng.isValidTransition('SignedOut', 'Reported'), 'SignedOut terminal: no transition out');
assert(!eng.isValidTransition('SignedOut', 'SignedOut'), 'SignedOut -> SignedOut REJECTED');
assert(!eng.isValidTransition('Bogus', 'Reported'), 'unknown source state REJECTED');
assert(!eng.isValidTransition('Received', 'Bogus'), 'unknown target state REJECTED');

// ----- Immutability -----
console.log(`\n${BOLD}[2] Immutability${RESET}`);
assert(eng.isImmutable('SignedOut') === true, 'SignedOut is immutable');
assert(eng.isImmutable('Reported') === false, 'Reported is mutable');
assert(eng.isImmutable('Received') === false, 'Received is mutable');

// ----- Flag derivation (server-authoritative, anti-spoof) -----
console.log(`\n${BOLD}[3] Flag derivation${RESET}`);
let f = eng.deriveFlags({ diagnosis: 'Invasive ductal carcinoma' });
assert(f.malignancy_flag === true && f.critical_flag === true, 'carcinoma -> malignant + critical');
f = eng.deriveFlags({ diagnosis: 'Benign fibroadenoma' });
assert(f.malignancy_flag === false && f.critical_flag === false, 'benign -> no flags');
f = eng.deriveFlags({ micro_text: 'High grade dysplasia noted' });
assert(f.critical_flag === true, 'high grade -> critical flag');
// Canonical ICD-O-3 format M8010/3 must match the /^(M8|M9)\d{3}\/3/i regex path.
f = eng.deriveFlags({ snomed_codes: ['M8010/3'] });
assert(f.malignancy_flag === true, 'SNOMED ICD-O-3 canonical M8010/3 -> malignant flag (regex path)');
// Text-based fallback: a code containing "malig" triggers flag independently.
f = eng.deriveFlags({ snomed_codes: ['malignant neoplasm'] });
assert(f.malignancy_flag === true, 'SNOMED /malig/i text fallback -> malignant flag');
f = eng.deriveFlags({ diagnosis: '', micro_text: '', snomed_codes: [] });
assert(f.malignancy_flag === false && f.critical_flag === false, 'empty -> no flags (no false reassurance the other way)');

// ----- Accession generation -----
console.log(`\n${BOLD}[4] Accession number${RESET}`);
const acc = eng.generateAccession(7, 4, new Date('2026-06-26T10:00:00Z'));
assert(/^PA-7-20260626-0005$/.test(acc), 'accession format PA-<tenant>-<date>-<seq+1>: ' + acc);
const acc2 = eng.generateAccession(7, 0, new Date('2026-06-26T10:00:00Z'));
assert(/^PA-7-20260626-0001$/.test(acc2), 'first specimen of day -> seq 0001');
let threw = false; try { eng.generateAccession('abc', 0); } catch (e) { threw = true; }
assert(threw, 'invalid tenantId throws (fail-closed, no silent accession)');
threw = false; try { eng.generateAccession(0, 0); } catch (e) { threw = true; }
assert(threw, 'tenantId 0 throws');
// tenant uniqueness: different tenants never collide on same day/seq
assert(eng.generateAccession(1, 0, new Date('2026-06-26')) !== eng.generateAccession(2, 0, new Date('2026-06-26')), 'tenant 1 vs 2 accessions differ');

console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed ? RED : ''}${failed} failed${RESET}`);
if (failed) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
