/**
 * e7_er_workflow_test.js
 * ==========================================
 * E7 Emergency Department — workflow state-machine + tracking board tests.
 * DB-free: static-audits the guarded routes/state-machine code in server.js, then re-simulates
 * the server's transition logic against an in-memory mock (mirrors cross_tenant_emergency_test.js).
 *
 *   node e7_er_workflow_test.js
 *
 * Asserts:
 *   - invalid transitions blocked (disposition before triage => 409; assign before triage => 409)
 *   - valid arrival -> triage -> provider -> disposition is recorded
 *   - time-to-provider captured on assignment
 *   - board sorted by ESI priority then arrival
 *   - ESI computed server-side (engine), client esi_level not persisted
 */

const fs = require('fs');
const path = require('path');
const esi = require('./esi_engine');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== E7 ED Workflow State-Machine Tests ===${RESET}\n`);

// ===== 1. Static code audit: guarded routes + state-machine guards present =====
console.log(`${BOLD}[1] Static audit — routes guarded + state-machine code present${RESET}`);
const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const clean = serverContent.replace(/\s+/g, '');
const routeChecks = [
    { p: "app.get('/api/er/board',requireAuth,requireRole('emergency','nursing','doctor'),requireTenantScope", l: 'GET /api/er/board guarded (auth+role+tenant)' },
    { p: "app.post('/api/er/triage',requireAuth,requireRole('emergency','nursing','doctor'),requireTenantScope", l: 'POST /api/er/triage guarded (auth+role+tenant)' },
    { p: "app.post('/api/er/assign-provider',requireAuth,requireRole('emergency','nursing','doctor'),requireTenantScope", l: 'POST /api/er/assign-provider guarded (auth+role+tenant)' },
    { p: "app.post('/api/er/disposition',requireAuth,requireRole('emergency','nursing','doctor'),requireTenantScope", l: 'POST /api/er/disposition guarded (auth+role+tenant)' }
];
for (const { p, l } of routeChecks) assert(clean.includes(p.replace(/\s+/g, '')), l, p);
assert(clean.includes("esiEngine.computeESI("), 'triage route invokes server-side esiEngine.computeESI');
assert(clean.includes("Cannottriageafterdisposition"), 'triage guards against post-disposition re-triage (409)');
assert(clean.includes("Cannotassignproviderbeforetriage"), 'assign-provider guards "before triage" (409)');
assert(clean.includes("Cannotsetdispositionbeforetriage"), 'disposition guards "before triage" (409)');
assert(clean.includes("require('./esi_engine')") || clean.includes('require("./esi_engine")'), 'server requires ./esi_engine');

// C1-D / I1: the LEGACY PUT /api/emergency/visits/:id must NOT be a bypass for terminal dispositions
// or acuity writes — terminal status transitions route through POST /api/er/disposition; triage
// fields route through POST /api/er/triage.
assert(clean.includes("TERMINAL_STATUSES=['Discharged','Admitted','Transferred','LWBS']") ||
       clean.includes('TERMINAL_STATUSES=["Discharged","Admitted","Transferred","LWBS"]'),
    'C1-D: legacy PUT defines terminal-status guard set');
assert(clean.includes("TERMINAL_STATUSES.includes(status)"), 'C1-D: legacy PUT blocks terminal status transitions');
assert(clean.includes("TerminaldispositionmustusePOST/api/er/disposition"), 'C1-D: legacy PUT 409s terminal status -> directs to /api/er/disposition');
// I3: re-triage blocked when already in treatment.
assert(clean.includes("Cannotre-triageapatientalreadyintreatment"), 'I3: triage route blocks re-triage of InTreatment (409)');
// I2: unconfirmed escalation audit marker + distinct audit event.
assert(clean.includes("unconfirmed_lifesaving_flag"), 'I2: triage persists unconfirmed_lifesaving_flag marker');
assert(clean.includes("ER_TRIAGE_UNCONFIRMED_ESCALATION"), 'I2: triage emits ER_TRIAGE_UNCONFIRMED_ESCALATION audit event');
{
    // C1-D fail-closed: legacy PUT resolves tenant via e7RequireTenant and has NO unscoped fallback.
    const putBody = serverContent.slice(serverContent.indexOf("app.put('/api/emergency/visits/:id'"));
    // Handler text up to the next route declaration, with line comments stripped (prose ignored).
    const putHandler = putBody.slice(0, putBody.indexOf('app.', 5)).replace(/\/\/[^\n]*/g, '');
    assert(putHandler.includes('e7RequireTenant(req)'), 'C1-D: legacy PUT uses fail-closed e7RequireTenant');
    assert(!/WHERE id = \$1'/.test(putHandler) && !putHandler.includes('? [req.params.id, tenantId] : [req.params.id]'),
        'C1-D: legacy PUT has no unscoped (no-tenant) query fallback');
    // I1: triage_level / triage_color no longer destructured/accepted in legacy PUT.
    assert(!putHandler.includes('triage_level') && !putHandler.includes('triage_color'),
        'I1: legacy PUT no longer accepts triage_level / triage_color');
}

// C1-A / C1-B: client discharge + transfer handlers route through /api/er/disposition and no longer
// hit the legacy PUT.
const appContent = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
{
    const grab = (name) => {
        const start = appContent.indexOf('window.' + name + ' =');
        return start < 0 ? '' : appContent.slice(start, appContent.indexOf('window.', start + 10));
    };
    // Strip line comments so prose mentioning a path (e.g. "do NOT call /api/admissions") doesn't
    // false-trigger the negative assertions — we only care about actual API call expressions.
    const code = (s) => s.replace(/\/\/[^\n]*/g, '');
    const discharge = code(grab('confirmERDischarge'));
    const transfer = code(grab('transferERToInpatient'));
    assert(discharge.includes("API.post('/api/er/disposition'") && !discharge.includes("/api/emergency/visits"),
        'C1-A: confirmERDischarge calls /api/er/disposition and NOT legacy PUT /api/emergency/visits');
    assert(transfer.includes("API.post('/api/er/disposition'") && !transfer.includes("/api/emergency/visits") && !transfer.includes("API.post('/api/admissions'"),
        'C1-B: transferERToInpatient calls /api/er/disposition (no legacy PUT, no standalone /api/admissions)');
}

// ===== 2. Simulation of the server state machine =====
console.log(`\n${BOLD}[2] State-machine simulation${RESET}`);

// Mock store of one active visit, untriaged.
function freshVisit() {
    return {
        id: 1000, patient_id: 1, patient_name: 'P1', status: 'Active', er_phase: 'Arrival',
        esi_level: 0, triage_level: 3, triage_color: 'Yellow', esi_rationale: '',
        triage_started_at: '', provider_assigned_at: '', time_to_provider_min: 0,
        assigned_bed: 'ER-1', assigned_doctor: '', disposition: 'Pending', disposition_type: '',
        arrival_time: '2026-06-26T10:00:00.000Z'
    };
}

// Re-implement server transition logic (authoritative copy of server.js rules).
function doTriage(v, body) {
    if (v.status !== 'Active') return { status: 409 };
    if (v.er_phase === 'Disposition') return { status: 409, error: 'Cannot triage after disposition' };
    const r = esi.computeESI(body); // server-side; ignores body.esi_level
    v.esi_level = r.esi_level; v.triage_level = r.esi_level; v.triage_color = r.triage_color;
    v.esi_rationale = JSON.stringify(r.rationale);
    v.er_phase = 'Waiting';
    if (!v.triage_started_at) v.triage_started_at = body._now || '2026-06-26T10:05:00.000Z';
    return { status: 200, esi_level: r.esi_level };
}
function doAssign(v, body) {
    if (v.status !== 'Active') return { status: 409 };
    const triaged = (v.esi_level && v.esi_level > 0) || (v.triage_started_at && v.triage_started_at !== '');
    if (!triaged) return { status: 409, error: 'Cannot assign provider before triage' };
    const nowMs = new Date(body._now || '2026-06-26T10:20:00.000Z').getTime();
    const startMs = new Date(v.triage_started_at || v.arrival_time).getTime();
    const ttp = Math.max(0, Math.round((nowMs - startMs) / 60000));
    v.assigned_doctor = body.provider || 'Provider';
    v.er_phase = 'InTreatment';
    if (!v.provider_assigned_at) v.provider_assigned_at = body._now || '2026-06-26T10:20:00.000Z';
    if (!v.time_to_provider_min) v.time_to_provider_min = ttp;
    return { status: 200, time_to_provider_min: ttp };
}
const DISPOS = ['Admitted', 'Discharged', 'Transferred', 'LWBS'];
function doDisposition(v, body) {
    if (!DISPOS.includes(body.disposition_type)) return { status: 422 };
    if (v.status !== 'Active') return { status: 409, error: 'already ' + v.status };
    const triaged = (v.esi_level && v.esi_level > 0) || (v.triage_started_at && v.triage_started_at !== '');
    if (!triaged) return { status: 409, error: 'Cannot set disposition before triage' };
    const seen = v.provider_assigned_at && v.provider_assigned_at !== '';
    if (body.disposition_type !== 'LWBS' && !seen) return { status: 409, error: 'before provider' };
    const map = { Admitted: 'Admitted', Discharged: 'Discharged', Transferred: 'Transferred', LWBS: 'LWBS' };
    v.status = map[body.disposition_type]; v.disposition_type = body.disposition_type; v.er_phase = 'Disposition';
    return { status: 200, status_set: v.status, admission: body.disposition_type === 'Admitted' };
}

// -- invalid: disposition before triage --
{
    const v = freshVisit();
    assert(doDisposition(v, { disposition_type: 'Discharged' }).status === 409, 'disposition before triage => 409');
}
// -- invalid: assign provider before triage --
{
    const v = freshVisit();
    assert(doAssign(v, {}).status === 409, 'assign provider before triage => 409');
}
// -- invalid disposition_type --
{
    const v = freshVisit(); doTriage(v, { vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 1, age: 40 });
    v.provider_assigned_at = 'x';
    assert(doDisposition(v, { disposition_type: 'Teleport' }).status === 422, 'unknown disposition_type => 422');
}
// -- valid full flow: arrival -> triage -> provider -> disposition --
{
    const v = freshVisit();
    const t = doTriage(v, { vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 2, age: 40 });
    assert(t.status === 200 && v.er_phase === 'Waiting', 'triage moves Arrival -> Waiting');
    assert(v.esi_level === 3, 'server computed ESI-3 from 2 resources (not client-supplied)');
    const a = doAssign(v, { provider: 'Dr X', _now: '2026-06-26T10:20:00.000Z' });
    assert(a.status === 200 && v.er_phase === 'InTreatment', 'assign moves Waiting -> InTreatment');
    assert(v.time_to_provider_min === 15, 'time-to-provider captured = 15 min (10:05 triage -> 10:20 provider)', 'got ' + v.time_to_provider_min);
    const d = doDisposition(v, { disposition_type: 'Admitted' });
    assert(d.status === 200 && v.status === 'Admitted' && v.er_phase === 'Disposition', 'admit disposition recorded + ADT handoff flagged');
    assert(d.admission === true, 'Admitted disposition triggers ADT handoff');
}
// -- LWBS allowed after triage WITHOUT a provider --
{
    const v = freshVisit(); doTriage(v, { vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 0, age: 40 });
    const d = doDisposition(v, { disposition_type: 'LWBS' });
    assert(d.status === 200 && v.status === 'LWBS', 'LWBS allowed after triage without provider');
}
// -- discharge requires a provider --
{
    const v = freshVisit(); doTriage(v, { vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 0, age: 40 });
    assert(doDisposition(v, { disposition_type: 'Discharged' }).status === 409, 'discharge before provider assigned => 409');
}
// -- cannot re-triage after disposition --
{
    const v = freshVisit(); doTriage(v, { vitals: { hr: 80, rr: 16, spo2: 99 }, resource_count: 0, age: 40 });
    v.provider_assigned_at = 'x'; doDisposition(v, { disposition_type: 'Discharged' });
    assert(doTriage(v, { vitals: {} }).status === 409, 'cannot re-triage a dispositioned (closed) visit => 409');
}

// ===== 3. Board ordering: ESI priority then arrival =====
console.log(`\n${BOLD}[3] Tracking board ordering${RESET}`);
{
    const rows = [
        { id: 1, esi_level: 4, arrival_time: '2026-06-26T09:00:00Z' },
        { id: 2, esi_level: 1, arrival_time: '2026-06-26T11:00:00Z' },
        { id: 3, esi_level: 2, arrival_time: '2026-06-26T10:30:00Z' },
        { id: 4, esi_level: 2, arrival_time: '2026-06-26T10:00:00Z' },
        { id: 5, esi_level: 0, triage_level: 3, arrival_time: '2026-06-26T08:00:00Z' }
    ];
    // mirror: ORDER BY COALESCE(NULLIF(esi_level,0),triage_level,3) ASC, arrival_time ASC
    const sorted = [...rows].sort((a, b) => {
        const la = a.esi_level || a.triage_level || 3;
        const lb = b.esi_level || b.triage_level || 3;
        if (la !== lb) return la - lb;
        return new Date(a.arrival_time) - new Date(b.arrival_time);
    });
    const order = sorted.map(r => r.id);
    assert(order[0] === 2, 'ESI-1 patient sorts first regardless of late arrival');
    assert(order[1] === 4 && order[2] === 3, 'two ESI-2 patients ordered by arrival (earlier first)');
    assert(order[3] === 5, 'untriaged (esi 0 -> triage_level 3) before ESI-4');
    assert(order[4] === 1, 'ESI-4 sorts last');
}
// -- time-to-provider breach flag for ESI-1/2 not yet seen --
{
    function breach(v, minsSinceArrival) {
        const lvl = v.esi_level;
        if (v.provider_assigned_at) return false;
        if (lvl !== 1 && lvl !== 2) return false;
        const limit = lvl === 1 ? 0 : 10;
        return minsSinceArrival > limit;
    }
    assert(breach({ esi_level: 1, provider_assigned_at: '' }, 1) === true, 'ESI-1 unseen for 1 min => breach');
    assert(breach({ esi_level: 2, provider_assigned_at: '' }, 12) === true, 'ESI-2 unseen for 12 min (>10) => breach');
    assert(breach({ esi_level: 2, provider_assigned_at: '' }, 5) === false, 'ESI-2 unseen for 5 min (<=10) => no breach');
    assert(breach({ esi_level: 3, provider_assigned_at: '' }, 60) === false, 'ESI-3 has no TTP breach threshold');
    assert(breach({ esi_level: 1, provider_assigned_at: 'x' }, 99) === false, 'ESI-1 already seen => no breach');
}

console.log(`\n${BOLD}${BLUE}=== E7 Workflow Test Results ===${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
else { console.log(`\n${GREEN}ALL PASS: ${passed} passed, 0 failed${RESET}\n`); process.exit(0); }
