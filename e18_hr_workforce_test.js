/**
 * e18_hr_workforce_test.js
 * Business/workflow + state-machine tests for E18:
 *  (A) Static code audit of server.js: RBAC role guards (HR/Admin), tenant scope + fail-closed
 *      helper, explicit tenant_id=$N filters, SELECT FOR UPDATE on state flips, server-authoritative
 *      computation (license expiry / net pay / worked hours / leave days), posting gate, 409 on
 *      invalid transitions, audit on sensitive writes, parameterized SQL.
 *  (B) Static audit of public/js/app.js: legacy fake handlers rewired to safe routes (anti-spoof).
 *  (C) Mock-pool simulation of leave + slip state machines and the posting gate, reusing the real engine.
 *   NODE_PATH=.../node_modules node e18_hr_workforce_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const e18 = require('./e18_hr_engine');

let passed = 0, failed = 0; const failures = [];
function assert(cond, name, det) {
    if (cond) { console.log('  PASS — ' + name); passed++; }
    else { console.log('  FAIL — ' + name + (det ? ' | ' + det : '')); failed++; failures.push(name); }
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
const collapse = s => s.replace(/\s+/g, '');
const srvC = collapse(server);
const has = sub => server.includes(sub);
const hasC = sub => srvC.includes(collapse(sub));

console.log('\n=== E18 HR / WORKFORCE WORKFLOW TESTS ===\n');

// ---------- (A) server.js static audit ----------
console.log('[A] server.js static audit (RBAC / tenant / tx / state machine / anti-spoof / gate)');
assert(has("const e18 = require('./e18_hr_engine')"), 'e18 engine wired into server');
// RBAC + tenant scope on every E18 route (HR+Admin via requireRole('hr'))
[
    "app.get('/api/hr/licenses', requireAuth, requireRole('hr'), requireTenantScope",
    "app.get('/api/hr/licenses/alerts', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/licenses', requireAuth, requireRole('hr'), requireTenantScope",
    "app.get('/api/hr/shifts', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/shifts', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/attendance', requireAuth, requireRole('hr'), requireTenantScope",
    "app.get('/api/hr/leave-requests', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/leave-requests', requireAuth, requireRole('hr'), requireTenantScope",
    "app.put('/api/hr/leave-requests/:id/status', requireAuth, requireRole('hr'), requireTenantScope",
    "app.get('/api/hr/payroll-slips', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/payroll-slips', requireAuth, requireRole('hr'), requireTenantScope",
    "app.put('/api/hr/payroll-slips/:id/status', requireAuth, requireRole('hr'), requireTenantScope",
    "app.get('/api/hr/competencies', requireAuth, requireRole('hr'), requireTenantScope",
    "app.post('/api/hr/competencies', requireAuth, requireRole('hr'), requireTenantScope"
].forEach(sig => assert(hasC(sig), 'route guarded: ' + sig.match(/'(\/api\/hr\/[^']+)'/)[1] + ' (' + sig.split("'")[0].trim() + ')'));

// fail-closed tenant resolver present + used (403 on null tenant)
assert(has('function e18RequireTenant(req)'), 'e18RequireTenant helper defined');
assert(has("if (!tenantId) return { ok: false }"), 'e18RequireTenant fail-CLOSED (no unscoped fallback)');
assert((server.match(/if \(!t\.ok\) return res\.status\(403\)/g) || []).length >= 10, 'every route 403s on null tenant');

// explicit tenant_id=$N filters (defense in depth over FORCE RLS)
assert(has('WHERE l.tenant_id=$1') && has('WHERE s.tenant_id=$1') && has('WHERE r.tenant_id=$1'), 'list queries carry explicit tenant_id=$1');
assert(has('FROM hr_employees WHERE id=$1 AND tenant_id=$2'), 'employee IDOR guard: id + tenant_id');

// transactional / race-safe state flips
assert(has('async function e18BeginTenantTx'), 'dedicated-tx helper present');
assert(has("set_config('app.tenant_id', $1, true)"), 'tx sets app.tenant_id (RLS-visible under FOR UPDATE)');
assert(has('FROM hr_leave_requests WHERE id=$1 AND tenant_id=$2 FOR UPDATE'), 'leave status flip locks row FOR UPDATE');
assert(has('FROM hr_payroll_slips WHERE id=$1 AND tenant_id=$2 FOR UPDATE'), 'slip status flip locks row FOR UPDATE');
assert(has('ORDER BY id ASC FOR UPDATE'), 'shift overlap check locks same-day rows ascending id (deadlock-safe)');

// state machine 409s
assert(has('e18.canTransitionLeave') && has('Invalid leave transition'), 'leave invalid transition => 409');
assert(has('e18.canTransitionSlip') && has('Invalid slip transition'), 'slip invalid transition => 409');
assert(has('e18.hasShiftConflict') && has('Shift overlaps'), 'overlapping shift => 409');

// posting gate (E10-style, default OFF)
assert(has('e18.isPostingEnabled()'), 'posting gate consulted');
assert(has("target === 'posted' && !e18.isPostingEnabled()") && has('Payroll GL posting is disabled'), 'posted blocked 403 when gate OFF');

// anti-spoof: authority fields computed server-side, not from client body
assert(has('e18.computePayrollSlip') && has('FROM hr_employees') && has('basic_salary, housing_allowance, transport_allowance'),
    'net pay computed server-side from employee master (client cannot supply salary)');
assert(has("status, 'requested'") || has("status, status, reason") || has("VALUES ($1,$2,$3,$4,$5,'requested'"), 'new leave forced status=requested (client cannot pre-approve)');
assert(has('e18.computeWorkedHours'), 'attendance hours computed server-side (anti-spoof)');
assert(has('e18.licenseStatus(r.expiry_date, r.alert_days)'), 'license expiry computed server-side');
assert(has('e18.leaveDays(start_date, end_date)'), 'leave days computed server-side');

// audit on sensitive writes
['CREATE_HR_LICENSE', 'CREATE_HR_SHIFT', 'RECORD_HR_ATTENDANCE', 'CREATE_LEAVE_REQUEST', 'UPDATE_LEAVE_STATUS',
 'GENERATE_PAYROLL_SLIP', 'UPDATE_PAYROLL_SLIP_STATUS', 'CREATE_HR_COMPETENCY'].forEach(act =>
    assert(has("'" + act + "'"), 'logAudit action present: ' + act));

// integer id comparison (no padded-id bypass)
assert(has('e18.e18IntId(req.params.id)') && has('e18.e18IntId(req.body.employee_id)'), 'ids parsed via e18IntId (integer-strict)');

// parameterized SQL (no obvious interpolation of ids)
assert(!/hr_leave_requests WHERE id = \$\{/.test(server) && !/hr_payroll_slips WHERE id = \$\{/.test(server), 'no string-interpolated ids in HR queries');

// ---------- (B) app.js anti-spoof rewire audit ----------
console.log('\n[B] app.js legacy-handler rewire (PRIMARY buttons call safe routes)');
assert(app.includes("API.post('/api/hr/leave-requests'"), 'requestLeave() POSTs to safe leave route (was fake toast)');
assert(app.includes("API.put(`/api/hr/leave-requests/${id}/status`"), 'approveLeave() PUTs state transition (was fake toast)');
assert(app.includes("API.post('/api/hr/payroll-slips'"), 'showPayslip() POSTs to compute server-side slip (was client-computed)');
assert(!/const net = basic \+ housing \+ transport - deductions;/.test(app), 'client-side net-pay computation removed (anti-spoof)');
assert(app.includes("API.get('/api/hr/leave-requests')"), 'leaves tab reads the new state-machine endpoint');

// C1: payslip button must pass employee_id (not the salary-record serial PK)
assert(app.includes('id: s.employee_id || s.id'), 'C1: payroll row id uses s.employee_id || s.id (not salary PK)');

// I2: fabricated payroll fallback (employees.map with hardcoded net_salary*1.25+status Paid) must be gone
assert(!app.includes("net_salary: (e.salary || 4000) * 1.25"), 'I2: no hardcoded net_salary*1.25 fabrication in payroll fallback');
assert(!app.includes("const displaySalaries = salaries.length ? salaries : employees.map"), 'I2: payroll tab no longer falls back to employees.map (fabricated pay removed)');
assert(!app.includes("net_salary: (e.salary"), 'I2: no client-computed net_salary from employee.salary in payroll fallback');

// ---------- (C) mock-pool simulation ----------
console.log('\n[C] state-machine + posting-gate simulation (mock pool + real engine)');

// Simulate the leave status route logic
function simLeaveTransition(currentStatus, target) {
    if (!e18.LEAVE_STATUSES.includes(target)) return { code: 422 };
    if (!e18.canTransitionLeave(currentStatus, target)) return { code: 409 };
    return { code: 200, status: target };
}
assert(simLeaveTransition('requested', 'approved').code === 200, 'sim: requested->approved 200');
assert(simLeaveTransition('approved', 'denied').code === 409, 'sim: approved->denied 409 (terminal)');
assert(simLeaveTransition('requested', 'bogus').code === 422, 'sim: bogus target 422');

// Simulate the slip status route logic INCLUDING the posting gate
function simSlipTransition(currentStatus, target, env) {
    if (!e18.SLIP_STATUSES.includes(target)) return { code: 422 };
    if (target === 'posted' && !e18.isPostingEnabled(env)) return { code: 403 };
    if (!e18.canTransitionSlip(currentStatus, target)) return { code: 409 };
    return { code: 200, status: target, posted: target === 'posted' };
}
assert(simSlipTransition('draft', 'approved', {}).code === 200, 'sim: draft->approved 200');
assert(simSlipTransition('approved', 'posted', {}).code === 403, 'sim: approved->posted BLOCKED 403 (gate OFF)');
assert(simSlipTransition('approved', 'posted', { HR_PAYROLL_POSTING_ENABLED: 'true' }).code === 200, 'sim: approved->posted 200 when gate ON');
assert(simSlipTransition('draft', 'posted', { HR_PAYROLL_POSTING_ENABLED: 'true' }).code === 409, 'sim: draft->posted 409 even with gate ON (must approve first)');

// Simulate payroll generation pulling from employee master (client salary ignored)
function simGenerateSlip(emp, clientBody) {
    const isSaudi = String(emp.national_id || '').startsWith('1');
    return e18.computePayrollSlip({
        basic_salary: emp.basic_salary, housing_allowance: emp.housing_allowance,
        transport_allowance: emp.transport_allowance,
        other_allowances: clientBody.other_allowances, advances_deducted: clientBody.advances_deducted,
        is_saudi: isSaudi
    });
}
const genSlip = simGenerateSlip(
    { basic_salary: 8000, housing_allowance: 2000, transport_allowance: 800, national_id: '1099887766' },
    { basic_salary: 999999 /* client attempt — IGNORED */ });
assert(genSlip.basic === 8000, 'sim: slip uses employee-master basic, ignores client-supplied salary (anti-spoof)');
assert(genSlip.gosi_deduction === Math.round((8000 + 2000) * 0.09 * 100) / 100, 'sim: GOSI from master figures');

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
process.exit(0);
