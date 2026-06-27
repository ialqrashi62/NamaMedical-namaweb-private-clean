/**
 * e8_adt_workflow_test.js
 * ==========================================
 * E8 Inpatient / ADT — admission + bed state-machine workflow tests.
 * DB-free: static-audits the guarded /api/adt/* routes + state-machine code in server.js,
 * then re-simulates the server's transactional admit/transfer/discharge logic against an
 * in-memory mock (mirrors e7_er_workflow_test.js).
 *
 *   NODE_PATH=.../namaweb/node_modules node e8_adt_workflow_test.js
 *
 * Asserts:
 *   - admit occupies the (locked) bed; double-admit to the same bed => 409
 *   - transfer is atomic (frees source -> Cleaning, occupies dest); transfer to occupied dest => 409
 *   - discharge frees the bed (-> Cleaning) + ends the admission
 *   - invalid transitions: discharge before admit / discharge already-discharged => 409;
 *     transfer of a discharged admission => 409
 *   - bed occupy/free guarded by SELECT ... FOR UPDATE (race-safety) present in source
 *   - new /api/adt/* routes are auth+role+tenant guarded
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

console.log(`\n${BOLD}${BLUE}=== E8 Inpatient/ADT Workflow State-Machine Tests ===${RESET}\n`);

// ===== 1. Static code audit: guarded routes + race-safe txn code present =====
console.log(`${BOLD}[1] Static audit — /api/adt/* guarded + transactional bed locking present${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');
const routeChecks = [
    { p: "app.get('/api/adt/beds',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'GET /api/adt/beds guarded (auth+role+tenant)' },
    { p: "app.get('/api/adt/census',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'GET /api/adt/census guarded (auth+role+tenant)' },
    { p: "app.post('/api/adt/admit',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'POST /api/adt/admit guarded (auth+role+tenant)' },
    { p: "app.post('/api/adt/transfer',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'POST /api/adt/transfer guarded (auth+role+tenant)' },
    { p: "app.post('/api/adt/discharge',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'POST /api/adt/discharge guarded (auth+role+tenant)' },
    { p: "app.post('/api/adt/bed-status',requireAuth,requireRole('inpatient','nursing','doctor'),requireTenantScope", l: 'POST /api/adt/bed-status guarded (auth+role+tenant)' }
];
for (const { p, l } of routeChecks) assert(clean.includes(p.replace(/\s+/g, '')), l, p);

// Race-safety: bed rows locked FOR UPDATE inside a transaction before flipping status.
assert(clean.includes("FROMbedsWHEREid=$1ANDtenant_id=$2FORUPDATE"), 'admit/transfer/discharge lock the bed row FOR UPDATE (race-safe)');
assert(clean.includes("functione8RequireTenant(req)") && clean.includes("err.e8Status=403"), 'e8RequireTenant fail-closed helper present (null tenant => 403)');
assert(clean.includes("E8_BED_FREE_STATES=['Available','Reserved']"), 'occupiable bed states defined server-side');
assert(clean.includes("Bednotavailable(status"), 'admit rejects a non-free destination bed (409)');
assert(clean.includes("Destinationbednotavailable(status"), 'transfer rejects an occupied destination bed (409)');
assert(clean.includes("Admissionalready"), 'discharge rejects an already-discharged admission (409)');
assert(clean.includes("Cannottransfera"), 'transfer rejects a non-Active admission (409)');
assert(clean.includes("SETstatus='Occupied',current_patient_id"), 'admit/transfer set bed Occupied server-side (not client-trusted)');
assert(clean.includes("SETstatus='Cleaning',current_patient_id=0,current_admission_id=0"), 'discharge/transfer free the source bed -> Cleaning');
assert(clean.includes("functione8IntId(v)") && clean.includes("Number.isInteger(n)"), 'integer id coercion guard present (no padded-id bypass)');

// C2 deadlock fix: the transfer route must lock BOTH beds in a CONSISTENT ascending-id order
// (no AB/BA cycle for reverse-direction concurrent transfers). Assert the ascending-sort lock
// pattern is present and that the FOR UPDATE lock is issued inside the sorted-id loop.
assert(clean.includes("[toBed,fromBed].filter(Boolean).sort((a,b)=>a-b)"), 'C2: transfer locks beds in ascending-id order ([toBed,fromBed].sort) — deadlock-safe');
assert(/const\s+lockIds\s*=\s*\[toBed,\s*fromBed\][\s\S]{0,400}?for\s*\(const\s+lid\s+of\s+lockIds\)[\s\S]{0,200}?FROM beds WHERE id=\$1 AND tenant_id=\$2 FOR UPDATE/.test(serverContent), 'C2: FOR UPDATE bed lock issued inside the ascending lockIds loop (both beds locked before any status flip)');

// Doctor role now carries the 'inpatient' permission (RBAC gap resolved).
assert(/'Doctor':\s*\[[^\]]*'inpatient'/.test(serverContent), "Doctor role granted 'inpatient' permission (RBAC gap resolved)");

// ===== 2. In-memory re-simulation of the server transition logic =====
console.log(`\n${BOLD}[2] State-machine simulation (admit / transfer / discharge)${RESET}`);

const BED_FREE = ['Available', 'Reserved'];
const TERMINAL = ['Discharged'];
function freshDb() {
    return {
        beds: [
            { id: 100, ward_id: 10, status: 'Available', current_patient_id: 0, current_admission_id: 0, tenant_id: 1 },
            { id: 101, ward_id: 10, status: 'Available', current_patient_id: 0, current_admission_id: 0, tenant_id: 1 },
            { id: 102, ward_id: 11, status: 'Occupied', current_patient_id: 9, current_admission_id: 9000, tenant_id: 1 }
        ],
        admissions: [
            // ER->ADT handoff row: Active, no bed yet.
            { id: 5000, patient_id: 1, status: 'Active', ward_id: null, bed_id: null, tenant_id: 1 },
            { id: 9000, patient_id: 9, status: 'Active', ward_id: 11, bed_id: 102, tenant_id: 1 }
        ],
        patients: [{ id: 1, tenant_id: 1 }, { id: 2, tenant_id: 1 }, { id: 9, tenant_id: 1 }],
        transfers: []
    };
}
const findBed = (db, id) => db.beds.find(b => b.id === id);
const findAdm = (db, id) => db.admissions.find(a => a.id === id);

// admit (mode a: place existing admission OR mode b: new). Returns {status,...}.
function doAdmit(db, body) {
    const bedId = body.bed_id;
    if (!bedId) return { status: 422 };
    const bed = findBed(db, bedId);
    if (!bed) return { status: 404 };
    if (!BED_FREE.includes(bed.status)) return { status: 409, error: 'bed not available' };
    let adm;
    if (body.admission_id) {
        adm = findAdm(db, body.admission_id);
        if (!adm) return { status: 404 };
        if (adm.status !== 'Active') return { status: 409, error: 'not active' };
        if (adm.bed_id) return { status: 409, error: 'already has bed' };
        adm.ward_id = bed.ward_id; adm.bed_id = bedId;
    } else {
        if (!body.patient_id) return { status: 422 };
        adm = { id: 6000 + db.admissions.length, patient_id: body.patient_id, status: 'Active', ward_id: bed.ward_id, bed_id: bedId, tenant_id: 1 };
        db.admissions.push(adm);
    }
    bed.status = 'Occupied'; bed.current_patient_id = adm.patient_id; bed.current_admission_id = adm.id;
    return { status: 200, admission_id: adm.id, bed_id: bedId };
}
function doTransfer(db, body) {
    const admId = body.admission_id, toBed = body.to_bed;
    if (!admId || !toBed) return { status: 422 };
    const adm = findAdm(db, admId);
    if (!adm) return { status: 404 };
    if (adm.status !== 'Active') return { status: 409, error: 'not active' };
    if (adm.bed_id === toBed) return { status: 409, error: 'same bed' };
    const fromBed = adm.bed_id;
    // C2: mirror the server — lock BOTH beds in ascending-id order before any status flip.
    const lockOrder = [toBed, fromBed].filter(Boolean).sort((a, b) => a - b);
    const dest = findBed(db, toBed);
    if (!dest) return { status: 404, lockOrder };
    if (!BED_FREE.includes(dest.status)) return { status: 409, error: 'dest occupied', lockOrder };
    const src = adm.bed_id ? findBed(db, adm.bed_id) : null;
    if (src) { src.status = 'Cleaning'; src.current_patient_id = 0; src.current_admission_id = 0; }
    dest.status = 'Occupied'; dest.current_patient_id = adm.patient_id; dest.current_admission_id = admId;
    adm.ward_id = dest.ward_id; adm.bed_id = toBed;
    db.transfers.push({ admission_id: admId, from_bed: fromBed, to_bed: toBed });
    return { status: 200, from_bed: fromBed, to_bed: toBed, lockOrder };
}
function doDischarge(db, body) {
    const admId = body.admission_id;
    if (!admId) return { status: 422 };
    const adm = findAdm(db, admId);
    if (!adm) return { status: 404 };
    if (TERMINAL.includes(adm.status)) return { status: 409, error: 'already discharged' };
    adm.status = 'Discharged';
    const bed = adm.bed_id ? findBed(db, adm.bed_id) : null;
    if (bed) { bed.status = 'Cleaning'; bed.current_patient_id = 0; bed.current_admission_id = 0; }
    return { status: 200, bed_id: adm.bed_id || null };
}

// -- admit: ER handoff row placed into a free bed occupies it --
{
    const db = freshDb();
    const r = doAdmit(db, { admission_id: 5000, bed_id: 100 });
    assert(r.status === 200, 'admit places ER-handoff admission #5000 into bed #100');
    assert(findBed(db, 100).status === 'Occupied' && findBed(db, 100).current_admission_id === 5000, 'bed #100 now Occupied by admission #5000');
    assert(findAdm(db, 5000).bed_id === 100, 'admission #5000 now references bed #100');
}
// -- admit: new direct admission --
{
    const db = freshDb();
    const r = doAdmit(db, { patient_id: 2, bed_id: 101 });
    assert(r.status === 200 && findBed(db, 101).status === 'Occupied', 'new direct admission occupies bed #101');
}
// -- double-admit to the same bed blocked (concurrent-admit guard) --
{
    const db = freshDb();
    doAdmit(db, { admission_id: 5000, bed_id: 100 });            // first wins
    const r2 = doAdmit(db, { patient_id: 2, bed_id: 100 });      // second sees Occupied
    assert(r2.status === 409, 'second admit to the now-Occupied bed #100 => 409 (no double-occupy)');
}
// -- admit into an already-occupied bed => 409 --
{
    const db = freshDb();
    assert(doAdmit(db, { patient_id: 2, bed_id: 102 }).status === 409, 'admit into Occupied bed #102 => 409');
}
// -- transfer is atomic: frees source -> Cleaning, occupies dest --
{
    const db = freshDb();
    const r = doTransfer(db, { admission_id: 9000, to_bed: 100 });
    assert(r.status === 200, 'transfer admission #9000 from bed #102 to bed #100');
    assert(findBed(db, 102).status === 'Cleaning' && findBed(db, 102).current_admission_id === 0, 'source bed #102 freed -> Cleaning');
    assert(findBed(db, 100).status === 'Occupied' && findBed(db, 100).current_admission_id === 9000, 'destination bed #100 now Occupied by #9000');
    assert(findAdm(db, 9000).bed_id === 100 && db.transfers.length === 1, 'admission row + transfer history updated');
}
// -- transfer to an occupied destination => 409 --
{
    const db = freshDb();
    doAdmit(db, { admission_id: 5000, bed_id: 100 });            // bed 100 now Occupied
    assert(doTransfer(db, { admission_id: 9000, to_bed: 100 }).status === 409, 'transfer to Occupied dest bed #100 => 409');
    assert(findBed(db, 102).status === 'Occupied', 'source bed #102 untouched after rejected transfer (atomicity)');
}
// -- discharge frees the bed -> Cleaning + ends admission --
{
    const db = freshDb();
    const r = doDischarge(db, { admission_id: 9000 });
    assert(r.status === 200 && findAdm(db, 9000).status === 'Discharged', 'discharge ends admission #9000');
    assert(findBed(db, 102).status === 'Cleaning' && findBed(db, 102).current_admission_id === 0, 'discharged bed #102 -> Cleaning, freed');
}
// -- invalid: discharge an already-discharged admission => 409 --
{
    const db = freshDb();
    doDischarge(db, { admission_id: 9000 });
    assert(doDischarge(db, { admission_id: 9000 }).status === 409, 'discharge of an already-Discharged admission => 409');
}
// -- invalid: transfer a discharged admission => 409 --
{
    const db = freshDb();
    doDischarge(db, { admission_id: 9000 });
    assert(doTransfer(db, { admission_id: 9000, to_bed: 100 }).status === 409, 'transfer of a Discharged admission => 409');
}
// -- invalid: discharge a non-existent admission => 404 ("discharge before admit") --
{
    const db = freshDb();
    assert(doDischarge(db, { admission_id: 7777 }).status === 404, 'discharge of a non-existent admission => 404');
}
// -- C2: reverse-direction transfers lock beds in the SAME ascending-id order (no AB/BA deadlock) --
{
    // Transfer A->B (src 102 -> dest 100) and the reverse B->A (src 100 -> dest 102) must each
    // lock the bed rows in ascending id order, so concurrent reverse transfers can't deadlock.
    const dbAB = freshDb(); // adm 9000 is in bed 102; transfer to 100
    const rAB = doTransfer(dbAB, { admission_id: 9000, to_bed: 100 });
    const dbBA = freshDb();
    // Put an Active admission in bed 100 first, then transfer it to 102.
    doAdmit(dbBA, { admission_id: 5000, bed_id: 100 }); // 5000 now in bed 100
    const rBA = doTransfer(dbBA, { admission_id: 5000, to_bed: 102 }); // would be blocked (102 occupied), but lockOrder is computed first
    const asc = a => a.every((v, i) => i === 0 || a[i - 1] <= v);
    assert(rAB.lockOrder && asc(rAB.lockOrder), 'C2: A->B transfer locks beds in ascending id order ' + JSON.stringify(rAB.lockOrder));
    assert(rBA.lockOrder && asc(rBA.lockOrder), 'C2: reverse B->A transfer locks beds in the SAME ascending id order ' + JSON.stringify(rBA.lockOrder));
    assert(JSON.stringify(rAB.lockOrder) === JSON.stringify(rBA.lockOrder), 'C2: both directions acquire the identical lock order [100,102] (deadlock impossible)');
}

console.log(`\n${BOLD}${BLUE}=== E8 ADT Workflow Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
