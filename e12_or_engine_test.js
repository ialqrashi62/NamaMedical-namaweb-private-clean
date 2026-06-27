/**
 * e12_or_engine_test.js — Epic E12 pure-engine unit tests.
 * Validates the WHO checklist phase ordering, the surgery status state machine,
 * and the server-side Aldrete recovery score computation/clamping.
 * DB-free. Run: NODE_PATH=...\node_modules node e12_or_engine_test.js
 */
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;
function assert(cond, name) { if (cond) { console.log(`  ${G}PASS${X} ${name}`); passed++; } else { console.log(`  ${R}FAIL${X} ${name}`); failed++; } }

// ---- Re-implementation of server helpers (kept in sync with server.js E12 block) ----
const E12_SURGERY_STATUS = ['Scheduled', 'InProgress', 'PACU', 'Completed', 'Cancelled'];
const E12_SURGERY_TRANSITIONS = {
    'Scheduled': ['InProgress', 'Cancelled'],
    'In Progress': ['InProgress', 'PACU', 'Cancelled'],
    'InProgress': ['PACU', 'Cancelled'],
    'PACU': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': []
};
function norm(s) { return s === 'In Progress' ? 'InProgress' : s; }
function validTransition(fromRaw, toRaw) {
    const from = fromRaw || 'Scheduled';
    const to = norm(toRaw);
    if (!E12_SURGERY_STATUS.includes(to)) return false;
    const allowed = E12_SURGERY_TRANSITIONS[from] || E12_SURGERY_TRANSITIONS[norm(from)] || [];
    return allowed.includes(to);
}
const E12_WHO_ORDER = ['Not Started', 'Sign-In', 'Time-Out', 'Sign-Out', 'Completed'];
const E12_WHO_PHASE_TO_STATE = { 'sign-in': 'Sign-In', 'time-out': 'Time-Out', 'sign-out': 'Sign-Out' };
function whoNext(currentState, phase) {
    const target = E12_WHO_PHASE_TO_STATE[phase];
    if (!target) return { ok: false };
    const curIdx = E12_WHO_ORDER.indexOf(currentState || 'Not Started');
    const tgtIdx = E12_WHO_ORDER.indexOf(target);
    if (tgtIdx !== curIdx + 1) return { ok: false };
    return { ok: true, newState: target === 'Sign-Out' ? 'Completed' : target };
}
function aldrete(b) {
    const comp = ['activity', 'respiration', 'circulation', 'consciousness', 'oxygen'];
    const provided = comp.filter(c => b[c] !== undefined && b[c] !== null && b[c] !== '');
    if (provided.length !== comp.length) return null;
    return comp.reduce((sum, c) => { let v = parseInt(b[c], 10); if (!Number.isInteger(v)) v = 0; if (v < 0) v = 0; if (v > 2) v = 2; return sum + v; }, 0);
}

console.log('\n[ E12 ENGINE ] Surgery status state machine');
assert(validTransition('Scheduled', 'InProgress'), 'Scheduled -> InProgress allowed');
assert(validTransition('InProgress', 'PACU'), 'InProgress -> PACU allowed');
assert(validTransition('PACU', 'Completed'), 'PACU -> Completed allowed');
assert(validTransition('Scheduled', 'Cancelled'), 'Scheduled -> Cancelled allowed');
assert(!validTransition('Scheduled', 'PACU'), 'Scheduled -> PACU REJECTED (skip)');
assert(!validTransition('Scheduled', 'Completed'), 'Scheduled -> Completed REJECTED (skip)');
assert(!validTransition('InProgress', 'Completed'), 'InProgress -> Completed REJECTED (must pass PACU)');
assert(!validTransition('Completed', 'InProgress'), 'Completed is terminal (no re-open)');
assert(!validTransition('Cancelled', 'InProgress'), 'Cancelled is terminal');
assert(!validTransition('Scheduled', 'Bogus'), 'Unknown status REJECTED');
assert(validTransition('In Progress', 'PACU'), 'Legacy label "In Progress" tolerated -> PACU');

console.log('\n[ E12 ENGINE ] WHO checklist phase ordering');
assert(whoNext('Not Started', 'sign-in').ok && whoNext('Not Started', 'sign-in').newState === 'Sign-In', 'Not Started -> Sign-In');
assert(whoNext('Sign-In', 'time-out').ok && whoNext('Sign-In', 'time-out').newState === 'Time-Out', 'Sign-In -> Time-Out');
assert(whoNext('Time-Out', 'sign-out').ok && whoNext('Time-Out', 'sign-out').newState === 'Completed', 'Time-Out -> Sign-Out => Completed');
assert(!whoNext('Not Started', 'time-out').ok, 'Cannot Time-Out before Sign-In (no incision without time-out gate)');
assert(!whoNext('Not Started', 'sign-out').ok, 'Cannot Sign-Out from Not Started');
assert(!whoNext('Sign-In', 'sign-out').ok, 'Cannot skip Time-Out');
assert(!whoNext('Sign-In', 'sign-in').ok, 'Cannot repeat a completed phase');
assert(!whoNext('Completed', 'sign-out').ok, 'No phase after Completed');
assert(!whoNext('Not Started', 'bogus').ok, 'Unknown phase REJECTED');

console.log('\n[ E12 ENGINE ] Aldrete recovery score (server-computed, clamped)');
assert(aldrete({ activity: 2, respiration: 2, circulation: 2, consciousness: 2, oxygen: 2 }) === 10, 'Full marks = 10');
assert(aldrete({ activity: 1, respiration: 1, circulation: 1, consciousness: 1, oxygen: 1 }) === 5, 'All ones = 5');
assert(aldrete({ activity: 5, respiration: 2, circulation: 2, consciousness: 2, oxygen: 2 }) === 10, 'Out-of-range component clamped to 2');
assert(aldrete({ activity: -3, respiration: 0, circulation: 0, consciousness: 0, oxygen: 0 }) === 0, 'Negative clamped to 0');
assert(aldrete({ activity: 2, respiration: 2 }) === null, 'Incomplete input -> null (never a falsely reassuring score)');
assert(aldrete({ activity: 'x', respiration: 2, circulation: 2, consciousness: 2, oxygen: 2 }) === 8, 'Non-numeric component -> 0 contribution');

console.log(`\n[ E12 ENGINE ] passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
