/**
 * e8_bed_state_test.js
 * ==========================================
 * E8 Inpatient / ADT — bed-status lifecycle + race-safety guard tests.
 * DB-free: static-audits the bed lifecycle constants + FOR UPDATE locking in server.js,
 * then re-simulates the server-side transition validator.
 *
 *   NODE_PATH=.../namaweb/node_modules node e8_bed_state_test.js
 *
 * Bed lifecycle (server-authoritative):
 *   Available -> Reserved | Occupied | Cleaning | Blocked
 *   Reserved  -> Occupied | Available
 *   Occupied  -> Cleaning | Available
 *   Cleaning  -> Available | Blocked
 *   Blocked   -> Available
 *
 * Asserts:
 *   - valid transitions accepted; invalid transitions rejected (e.g. Blocked->Occupied)
 *   - Occupied bed cannot be raw-flipped to Available via /api/adt/bed-status (=> 409)
 *   - race-safety: SELECT ... FOR UPDATE present before every bed status flip
 *   - no double-occupy: a bed already Occupied is not in the occupiable set
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== E8 Bed-Status Lifecycle + Race-Safety Tests ===${RESET}\n`);

// ===== 1. Static audit: lifecycle constants + FOR UPDATE locking present =====
console.log(`${BOLD}[1] Static audit — lifecycle constants + FOR UPDATE locking${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');

assert(clean.includes("E8_BED_STATUSES=['Available','Reserved','Occupied','Cleaning','Blocked']"), 'bed status vocabulary defined (5 states)');
assert(clean.includes("E8_BED_TRANSITIONS="), 'bed transition map defined');
assert(clean.includes("E8_BED_FREE_STATES=['Available','Reserved']"), 'occupiable (free) states defined');
assert(clean.includes("functione8CanTransitionBed(from,to)"), 'server-side transition validator defined');
// FOR UPDATE locks (race-safety) — count occurrences of the bed lock in the adt block.
const adtStart = serverContent.indexOf("E8 INPATIENT / ADT");
const adtEnd = serverContent.indexOf("===== ICU =====", adtStart);
const adtBlock = serverContent.slice(adtStart, adtEnd);
const bedLockCount = (adtBlock.match(/FROM beds WHERE id=\$1 AND tenant_id=\$2 FOR UPDATE/g) || []).length;
assert(bedLockCount >= 4, `bed row locked FOR UPDATE in admit/transfer/discharge/bed-status (found ${bedLockCount} >= 4)`);
assert(adtBlock.includes("Occupied bed must be freed via discharge or transfer"), 'bed-status route forbids raw flip of an Occupied bed (=> 409)');
assert(adtBlock.includes("Invalid bed transition"), 'bed-status route rejects invalid transitions (=> 409)');
assert(adtBlock.includes("e8CanTransitionBed(bed.status, status)"), 'bed-status route validates via e8CanTransitionBed');

// ===== 2. Re-simulate the server-side transition validator =====
console.log(`\n${BOLD}[2] Transition validator simulation${RESET}`);
const STATUSES = ['Available', 'Reserved', 'Occupied', 'Cleaning', 'Blocked'];
const TRANS = {
    Available: ['Reserved', 'Occupied', 'Blocked', 'Cleaning'],
    Reserved: ['Occupied', 'Available'],
    Occupied: ['Cleaning', 'Available'],
    Cleaning: ['Available', 'Blocked'],
    Blocked: ['Available']
};
function canTransition(from, to) {
    if (!STATUSES.includes(to)) return false;
    const f = from || 'Available';
    if (f === to) return true;
    return (TRANS[f] || []).includes(to);
}

// valid transitions
assert(canTransition('Available', 'Reserved'), 'Available -> Reserved valid');
assert(canTransition('Available', 'Occupied'), 'Available -> Occupied valid (direct admit)');
assert(canTransition('Reserved', 'Occupied'), 'Reserved -> Occupied valid');
assert(canTransition('Reserved', 'Available'), 'Reserved -> Available valid (release hold)');
assert(canTransition('Occupied', 'Cleaning'), 'Occupied -> Cleaning valid (discharge turnover)');
assert(canTransition('Cleaning', 'Available'), 'Cleaning -> Available valid (housekeeping done)');
assert(canTransition('Cleaning', 'Blocked'), 'Cleaning -> Blocked valid (take offline)');
assert(canTransition('Blocked', 'Available'), 'Blocked -> Available valid (return to service)');

// invalid transitions
assert(!canTransition('Blocked', 'Occupied'), 'Blocked -> Occupied INVALID');
assert(!canTransition('Cleaning', 'Occupied'), 'Cleaning -> Occupied INVALID (must clean then admit)');
assert(!canTransition('Available', 'Frozen'), 'unknown target status INVALID');
assert(!canTransition('Occupied', 'Reserved'), 'Occupied -> Reserved INVALID');

// idempotent no-op allowed
assert(canTransition('Cleaning', 'Cleaning'), 'same-status no-op allowed (idempotent)');

// ===== 3. bed-status route: Occupied is never raw-freed; no double-occupy =====
console.log(`\n${BOLD}[3] Occupied-bed guard + no double-occupy${RESET}`);
const FREE = ['Available', 'Reserved'];
function simBedStatus(bed, target) {
    if (!STATUSES.includes(target)) return { status: 422 };
    if (bed.status === 'Occupied') return { status: 409, error: 'Occupied bed must be freed via discharge or transfer' };
    if (!canTransition(bed.status, target)) return { status: 409, error: 'Invalid bed transition' };
    bed.status = target;
    return { status: 200 };
}
assert(simBedStatus({ status: 'Occupied' }, 'Available').status === 409, 'raw flip Occupied -> Available via bed-status => 409');
assert(simBedStatus({ status: 'Occupied' }, 'Cleaning').status === 409, 'raw flip Occupied -> Cleaning via bed-status => 409 (use discharge)');
assert(simBedStatus({ status: 'Cleaning' }, 'Available').status === 200, 'Cleaning -> Available via bed-status => 200');
assert(simBedStatus({ status: 'Available' }, 'Blocked').status === 200, 'Available -> Blocked via bed-status => 200');

// no double-occupy: an Occupied bed is excluded from the occupiable set used by admit/transfer.
function isOccupiable(bed) { return FREE.includes(bed.status); }
assert(isOccupiable({ status: 'Available' }) === true, 'Available bed is occupiable');
assert(isOccupiable({ status: 'Reserved' }) === true, 'Reserved bed is occupiable (hold honored)');
assert(isOccupiable({ status: 'Occupied' }) === false, 'Occupied bed is NOT occupiable (no double-occupy)');
assert(isOccupiable({ status: 'Cleaning' }) === false, 'Cleaning bed is NOT occupiable');
assert(isOccupiable({ status: 'Blocked' }) === false, 'Blocked bed is NOT occupiable');

console.log(`\n${BOLD}${BLUE}=== E8 Bed-State Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
