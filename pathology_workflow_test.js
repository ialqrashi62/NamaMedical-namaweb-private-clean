/**
 * pathology_workflow_test.js — E15 business/workflow test (DB-free).
 * Simulates the full lifecycle through handlers that mirror server.js logic:
 *   accession -> add block -> add slide -> advance states -> save report
 *   -> sign-out -> addendum, asserting the state machine + immutability + flags.
 *   node pathology_workflow_test.js
 */
'use strict';
const eng = require('./pathology_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', BOLD = '\x1b[1m', RESET = '\x1b[0m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name) {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}`); failed++; failures.push(name); }
}

console.log(`\n${BOLD}${BLUE}E15 Pathology — Business / Workflow Lifecycle Test${RESET}\n`);

// ---- In-memory store mirroring the DB chain (single tenant for workflow focus) ----
const TENANT = 1;
const db = { specimens: [], blocks: [], slides: [], reports: [], seqToday: 0, audit: [] };
function audit(action) { db.audit.push(action); }

// ---- Handlers mirroring server.js semantics ----
function accession(body) {
    if (!Number.isInteger(body.patient_id)) return { status: 400 };
    const accession_number = eng.generateAccession(TENANT, db.seqToday++);
    const sp = { id: db.specimens.length + 1, tenant_id: TENANT, patient_id: body.patient_id,
        accession_number, specimen_type: body.specimen_type || '', state: 'Received', blocks_count: 0 };
    db.specimens.push(sp);
    db.reports.push({ id: 100 + sp.id, specimen_id: sp.id, tenant_id: TENANT, state: 'Received',
        diagnosis: '', malignancy_flag: false, critical_flag: false, addendum_count: 0, addenda: [] });
    audit('PATHOLOGY_SPECIMEN_CREATE');
    return { status: 200, specimen: sp };
}
function addBlock(sid, block_no) {
    const sp = db.specimens.find(s => s.id === sid && s.tenant_id === TENANT);
    if (!sp) return { status: 404 };
    if (sp.state === 'SignedOut') return { status: 409 };
    const b = { id: db.blocks.length + 1, tenant_id: TENANT, specimen_id: sid, block_no };
    db.blocks.push(b); sp.blocks_count++;
    return { status: 200, block: b };
}
function addSlide(blockId, slide_no, stain) {
    const b = db.blocks.find(x => x.id === blockId && x.tenant_id === TENANT);
    if (!b) return { status: 404 };
    const sl = { id: db.slides.length + 1, tenant_id: TENANT, block_id: blockId, specimen_id: b.specimen_id, slide_no, stain_type: stain };
    db.slides.push(sl); return { status: 200, slide: sl };
}
function advance(sid, target) {
    const sp = db.specimens.find(s => s.id === sid && s.tenant_id === TENANT);
    if (!sp) return { status: 404 };
    if (!eng.isValidTransition(sp.state, target)) return { status: 409 };
    sp.state = target;
    const rep = db.reports.find(r => r.specimen_id === sid); rep.state = target;
    audit('PATHOLOGY_STATE_CHANGE');
    return { status: 200, state: target };
}
function saveReport(sid, body) {
    const rep = db.reports.find(r => r.specimen_id === sid && r.tenant_id === TENANT);
    if (!rep) return { status: 404 };
    if (eng.isImmutable(rep.state)) return { status: 409 };
    const flags = eng.deriveFlags({ diagnosis: body.diagnosis, micro_text: body.micro_text, snomed_codes: body.snomed_codes || [] });
    rep.diagnosis = body.diagnosis || ''; rep.micro_text = body.micro_text || '';
    rep.malignancy_flag = flags.malignancy_flag; rep.critical_flag = flags.critical_flag;
    audit('PATHOLOGY_REPORT_SAVE');
    return { status: 200, ...flags };
}
function signOut(sid) {
    const sp = db.specimens.find(s => s.id === sid && s.tenant_id === TENANT);
    if (!sp) return { status: 404 };
    if (sp.state === 'SignedOut') return { status: 409 };
    if (!eng.isValidTransition(sp.state, 'SignedOut')) return { status: 409 };
    const rep = db.reports.find(r => r.specimen_id === sid);
    if (!rep || !rep.diagnosis.trim()) return { status: 409 };
    sp.state = 'SignedOut'; rep.state = 'SignedOut'; rep.signed_at = new Date().toISOString();
    audit('PATHOLOGY_SPECIMEN_SIGNOUT');
    return { status: 200 };
}
function addendum(sid, text) {
    const rep = db.reports.find(r => r.specimen_id === sid && r.tenant_id === TENANT);
    if (!rep) return { status: 404 };
    if (rep.state !== 'SignedOut') return { status: 409 };
    if (!text || !text.trim()) return { status: 400 };
    rep.addenda.push({ text }); rep.addendum_count++;
    audit('PATHOLOGY_ADDENDUM_ADD');
    return { status: 200, addendum_count: rep.addendum_count };
}

// ===== 1. Accession =====
console.log(`${BOLD}[1] Accession${RESET}`);
const a = accession({ patient_id: 101, specimen_type: 'biopsy' });
assert(a.status === 200, 'specimen accessioned');
assert(/^PA-1-\d{8}-0001$/.test(a.specimen.accession_number), 'accession number server-generated: ' + a.specimen.accession_number);
assert(a.specimen.state === 'Received', 'initial state Received');
assert(accession({ patient_id: 'x' }).status === 400, 'non-integer patient_id rejected (no string-id coercion)');
const sid = a.specimen.id;

// ===== 2. Blocks & slides =====
console.log(`\n${BOLD}[2] Blocks & slides hierarchy${RESET}`);
const b = addBlock(sid, 'A1');
assert(b.status === 200, 'block added');
assert(db.specimens.find(s => s.id === sid).blocks_count === 1, 'blocks_count incremented');
const sl = addSlide(b.block.id, 'A1-1', 'H&E');
assert(sl.status === 200 && sl.slide.specimen_id === sid, 'slide added and linked to specimen');
assert(addBlock(999, 'X').status === 404, 'block on missing specimen -> 404');

// ===== 3. State machine (forward only; bad jumps 409) =====
console.log(`\n${BOLD}[3] State machine${RESET}`);
assert(advance(sid, 'Received').status === 409, 'self-transition rejected 409');
assert(advance(sid, 'Grossing').status === 200, 'Received -> Grossing');
assert(advance(sid, 'Received').status === 409, 'backward Grossing -> Received rejected 409');
assert(advance(sid, 'Processing').status === 200, 'Grossing -> Processing');
assert(advance(sid, 'Reported').status === 200, 'Processing -> Reported');

// ===== 4. Report + server-derived flags (malignancy) =====
console.log(`\n${BOLD}[4] Report & flags${RESET}`);
const r = saveReport(sid, { diagnosis: 'Invasive ductal carcinoma', micro_text: 'pleomorphic cells', snomed_codes: ['M85003'] });
assert(r.status === 200, 'report saved');
assert(r.malignancy_flag === true && r.critical_flag === true, 'malignancy + critical flags derived server-side');
assert(db.reports[0].malignancy_flag === true, 'flag persisted on report');

// ===== 5. Sign-out (final) + immutability =====
console.log(`\n${BOLD}[5] Sign-out & immutability${RESET}`);
// add a fresh specimen to test sign-out-without-diagnosis guard
const a2 = accession({ patient_id: 101 });
advance(a2.specimen.id, 'Reported');
assert(signOut(a2.specimen.id).status === 409, 'sign-out without diagnosis -> 409 (incomplete, never falsely-OK)');
assert(signOut(sid).status === 200, 'sign-out of fully-reported specimen -> 200');
assert(db.specimens.find(s => s.id === sid).state === 'SignedOut', 'state is SignedOut');
assert(signOut(sid).status === 409, 'repeat sign-out -> 409');
assert(saveReport(sid, { diagnosis: 'changed' }).status === 409, 'cannot edit report after sign-out (immutable)');
assert(advance(sid, 'Reported').status === 409, 'cannot transition out of SignedOut');

// ===== 6. Addendum-only after sign-out =====
console.log(`\n${BOLD}[6] Addendum${RESET}`);
assert(addendum(a2.specimen.id, 'note').status === 409, 'addendum before sign-out -> 409');
const ad = addendum(sid, 'IHC confirms ER+');
assert(ad.status === 200 && ad.addendum_count === 1, 'addendum appended after sign-out');
assert(addendum(sid, '').status === 400, 'empty addendum rejected');

// ===== 7. Audit trail emitted =====
console.log(`\n${BOLD}[7] Audit trail${RESET}`);
['PATHOLOGY_SPECIMEN_CREATE', 'PATHOLOGY_STATE_CHANGE', 'PATHOLOGY_REPORT_SAVE',
 'PATHOLOGY_SPECIMEN_SIGNOUT', 'PATHOLOGY_ADDENDUM_ADD'].forEach(act =>
    assert(db.audit.includes(act), 'audit emitted: ' + act));

console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed ? RED : ''}${failed} failed${RESET}`);
if (failed) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
process.exit(0);
