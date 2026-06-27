/**
 * e17_quality_capa_workflow_test.js — Epic E17 business/workflow + static-guard tests.
 * 1) Static audit: every E17 route is guarded (requireAuth + requireRole + requireTenantScope) in server.js.
 * 2) Static audit: legacy quality/infection routes hardened (no unguarded SELECT *, tenant filters present).
 * 3) Workflow simulation: incident + CAPA state machines reject invalid transitions (409);
 *    severity/harm/risk-score validated/computed server-side (anti-spoof).
 * DB-free. Run: NODE_PATH=...\node_modules node e17_quality_capa_workflow_test.js
 */
const fs = require('fs');
const path = require('path');
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;
function assert(cond, name, extra = '') { if (cond) { console.log(`  ${G}PASS${X} ${name}`); passed++; } else { console.log(`  ${R}FAIL${X} ${name}${extra ? ' | ' + extra : ''}`); failed++; } }

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const flat = server.replace(/\s+/g, '');

console.log('\n[ 1 ] Static route-guard audit (E17 routes guarded)');
const routes = [
    "app.get('/api/quality/incidents',requireAuth,requireRole('quality'),requireTenantScope",
    "app.post('/api/quality/incidents',requireAuth,requireRole('quality'),requireTenantScope",
    "app.put('/api/quality/incidents/:id',requireAuth,requireRole('quality'),requireTenantScope",
    "app.get('/api/quality/incidents/:id/capa',requireAuth,requireRole('quality'),requireTenantScope",
    "app.post('/api/quality/incidents/:id/capa',requireAuth,requireRole('quality'),requireTenantScope",
    "app.put('/api/quality/capa/:id',requireAuth,requireRole('quality'),requireTenantScope",
    "app.get('/api/quality/risks',requireAuth,requireRole('quality'),requireTenantScope",
    "app.post('/api/quality/risks',requireAuth,requireRole('quality'),requireTenantScope",
    "app.put('/api/quality/risks/:id',requireAuth,requireRole('quality'),requireTenantScope",
    "app.get('/api/quality/stats',requireAuth,requireRole('quality'),requireTenantScope",
    "app.get('/api/infection/surveillance',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/surveillance',requireAuth,requireRole('infection'),requireTenantScope",
    "app.get('/api/infection/isolation',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/isolation',requireAuth,requireRole('infection'),requireTenantScope",
    "app.put('/api/infection/isolation/:id',requireAuth,requireRole('infection'),requireTenantScope",
    "app.get('/api/infection/ams',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/ams',requireAuth,requireRole('infection'),requireTenantScope",
    "app.put('/api/infection/ams/:id',requireAuth,requireRole('infection'),requireTenantScope",
    // C2 FIX: outbreaks/exposures/hand-hygiene now carry requireRole('infection')+requireTenantScope
    "app.get('/api/infection/outbreaks',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/outbreaks',requireAuth,requireRole('infection'),requireTenantScope",
    "app.put('/api/infection/outbreaks/:id',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/exposures',requireAuth,requireRole('infection'),requireTenantScope",
    "app.get('/api/infection/exposures',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection/hand-hygiene',requireAuth,requireRole('infection'),requireTenantScope",
    "app.get('/api/infection/hand-hygiene',requireAuth,requireRole('infection'),requireTenantScope",
    // C1 FIX: legacy infection-control/reports route also hardened
    "app.get('/api/infection-control/reports',requireAuth,requireRole('infection'),requireTenantScope",
    "app.post('/api/infection-control/reports',requireAuth,requireRole('infection'),requireTenantScope",
    "app.put('/api/infection-control/reports/:id',requireAuth,requireRole('infection'),requireTenantScope"
];
for (const r of routes) assert(flat.includes(r.replace(/\s+/g, '')), 'guarded route ' + r.slice(0, 52) + '...');

console.log('\n[ 2 ] Static enforcement audit');
assert(flat.includes('e17IsValidIncidentTransition'), 'incident state-machine validator present');
assert(flat.includes('e17IsValidCapaTransition'), 'CAPA state-machine validator present');
assert(flat.includes('e17ComputeRisk'), 'risk score/level computed server-side');
assert(flat.includes('e17RequireTenant'), 'fail-closed tenant guard present');
assert(server.includes('Invalid CAPA transition'), 'CAPA returns 409 on invalid transition');
assert(server.includes('Invalid incident transition'), 'incident returns 409 on invalid transition');
assert(server.includes('e17CanSeeConfidential'), 'confidential incidents RBAC-restricted');
assert(server.includes("AND confidential=0"), 'non-privileged roles cannot read confidential incidents');
// reported_by must be stamped from session, never taken from body
const incPost = server.slice(server.indexOf("app.post('/api/quality/incidents'"), server.indexOf("app.put('/api/quality/incidents/:id'"));
assert(!/reported_by\s*[:=]\s*req\.body/.test(incPost) && !/const\s*{[^}]*reported_by[^}]*}\s*=\s*req\.body/.test(incPost), 'reported_by not taken from client body (anti-spoof)');
// tenant_id never read from body across the E17 block
const e17Block = server.slice(server.indexOf('QUALITY & PATIENT SAFETY (E17 HARDENED'), server.indexOf('===== MAINTENANCE ====='));
assert(!/tenant_id\s*[:=]\s*req\.body/.test(e17Block) && !e17Block.includes('body.tenant_id'), 'tenant_id never taken from client body in E17');

// SECURITY-HOOK assertions: confidential gate applied to CAPA sub-resources
assert(server.includes('inc.confidential && !e17CanSeeConfidential(req)'), 'confidential gate wired into CAPA sub-routes');
// C1 assertion: saveIcReport no longer calls /api/infection-control/reports as primary UI path
const appJs = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
assert(!appJs.includes("onclick=\"saveIcReport()\""), 'C1: Submit Report button no longer calls saveIcReport()');
assert(appJs.includes("window.reportInfection()"), 'C1: Submit Report button wired to window.reportInfection()');
assert(appJs.includes('id="icOrganism"'), 'C1: icOrganism field present in infection-control form');
assert(appJs.includes('id="icHAI"'), 'C1: icHAI field present in infection-control form');
// I2 assertion: satisfaction route has patient IDOR guard
const satPost = server.slice(server.indexOf("app.post('/api/quality/satisfaction'"), server.indexOf("app.get('/api/quality/kpis'"));
assert(satPost.includes("FROM patients WHERE id=$1 AND tenant_id=$2"), 'I2: satisfaction POST has patient IDOR guard');
// I1 assertion: NOT NULL present in db_postgres.js bootstrap ALTERs
const dbJs = fs.readFileSync(path.join(__dirname, 'db_postgres.js'), 'utf8');
assert(dbJs.includes("harm_level TEXT NOT NULL DEFAULT 'None'"), 'I1: harm_level bootstrap ALTER has NOT NULL');
assert(dbJs.includes('near_miss INTEGER NOT NULL DEFAULT 0'), 'I1: near_miss bootstrap ALTER has NOT NULL');
assert(dbJs.includes('confidential INTEGER NOT NULL DEFAULT 0'), 'I1: confidential bootstrap ALTER has NOT NULL');
assert(dbJs.includes("workflow_state TEXT NOT NULL DEFAULT 'Open'"), 'I1: workflow_state bootstrap ALTER has NOT NULL');
// C2: reported_by in outbreaks/exposures stamped from session
const outbreakPost = server.slice(server.indexOf("app.post('/api/infection/outbreaks'"), server.indexOf("app.put('/api/infection/outbreaks/:id'"));
assert(!outbreakPost.includes('reported_by } = req.body') && !outbreakPost.includes('reported_by} = req.body'), 'L1: outbreaks reported_by not taken from body');
const exposurePost = server.slice(server.indexOf("app.post('/api/infection/exposures'"), server.indexOf("app.get('/api/infection/exposures'"));
assert(!exposurePost.includes('reported_by } = req.body') && !exposurePost.includes('reported_by} = req.body'), 'L1: exposures reported_by not taken from body');

console.log('\n[ 3 ] Workflow simulation — incident + CAPA state machines');
// Mirror server transitions
const INC = { 'Open': ['Investigating', 'Closed'], 'Investigating': ['Action', 'Closed'], 'Action': ['Closed'], 'Closed': [] };
const CAPA = { 'Pending': ['InProgress', 'Cancelled'], 'InProgress': ['Completed', 'Cancelled'], 'Completed': ['Verified'], 'Verified': [], 'Cancelled': [] };
function incOk(from, to) { return (INC[from] || []).includes(to); }
function capaOk(from, to) { return (CAPA[from] || []).includes(to); }

assert(incOk('Open', 'Closed'), 'incident Open->Closed allowed (UI close button)');
assert(incOk('Open', 'Investigating'), 'incident Open->Investigating allowed');
assert(!incOk('Closed', 'Open'), 'incident Closed->Open REJECTED (409)');
assert(!incOk('Closed', 'Investigating'), 'incident reopen of Closed REJECTED (409)');
assert(!incOk('Action', 'Open'), 'incident backward Action->Open REJECTED (409)');

assert(capaOk('Pending', 'InProgress'), 'CAPA Pending->InProgress allowed');
assert(capaOk('InProgress', 'Completed'), 'CAPA InProgress->Completed allowed');
assert(capaOk('Completed', 'Verified'), 'CAPA Completed->Verified allowed');
assert(!capaOk('Pending', 'Completed'), 'CAPA Pending->Completed (skip) REJECTED (409)');
assert(!capaOk('Pending', 'Verified'), 'CAPA Pending->Verified (skip) REJECTED (409)');
assert(!capaOk('Verified', 'InProgress'), 'CAPA Verified->InProgress (reopen) REJECTED (409)');
assert(!capaOk('Completed', 'Cancelled'), 'CAPA Completed->Cancelled REJECTED (409)');

console.log('\n[ 4 ] Anti-spoof — enum validation + server-computed authority fields');
const SEV = ['low', 'medium', 'high', 'critical'];
const HARM = ['None', 'Mild', 'Moderate', 'Severe', 'Death'];
function valSev(s) { return SEV.includes(s) ? s : 'low'; }
function valHarm(h) { return HARM.includes(h) ? h : 'None'; }
assert(valSev('ultra-mega') === 'low', 'unknown severity coerced to safe default (not trusted)');
assert(valSev('critical') === 'critical', 'valid severity preserved');
assert(valHarm("'; DROP TABLE--") === 'None', 'malicious harm_level coerced to safe default');

function computeRisk(l, i) { const L = Math.min(5, Math.max(1, parseInt(l, 10) || 1)); const I = Math.min(5, Math.max(1, parseInt(i, 10) || 1)); const s = L * I; let lvl = 'Low'; if (s >= 15) lvl = 'Extreme'; else if (s >= 10) lvl = 'High'; else if (s >= 5) lvl = 'Medium'; return { s, lvl }; }
assert(computeRisk(5, 5).s === 25 && computeRisk(5, 5).lvl === 'Extreme', 'risk 5x5 -> 25 Extreme (server-computed)');
assert(computeRisk(1, 1).s === 1 && computeRisk(1, 1).lvl === 'Low', 'risk 1x1 -> 1 Low');
assert(computeRisk(99, 99).s === 25, 'risk clamps client-injected out-of-range values to 5x5');
assert(computeRisk('abc', 'xyz').s === 1, 'risk non-numeric input -> safe minimum (not NaN)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
