/**
 * rbac_phi_guard_test.js
 * ==========================================
 * PHASE 2B (H-6/H-7) — RBAC guards on audit-trail + secondary PHI routes.
 * (1) Behavioral: replays the project's real ROLE_PERMISSIONS + requireRole() decision logic to prove
 *     the chosen module guards DENY wrong roles and ALLOW the intended ones.
 * (2) Static: asserts each sensitive route signature now carries requireRole (+ requireTenantScope where applicable),
 *     i.e. is no longer requireAuth-only.
 * DB-free, deterministic. No route execution, no DB.
 *
 *   node rbac_phi_guard_test.js
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== RBAC / Secondary-PHI Guards (H-6/H-7) ===${RESET}\n`);

// ---- extract the REAL ROLE_PERMISSIONS literal from server.js and the requireRole() decision logic ----
const rpMatch = src.match(/const ROLE_PERMISSIONS = (\{[\s\S]*?\n\};)/);
assert(!!rpMatch, 'ROLE_PERMISSIONS literal extracted from server.js');
// NO eval: the literal uses single-quoted keys/values with no embedded quotes (role/module names are
// simple strings), so swapping ' -> " yields valid JSON we can safely JSON.parse.
const ROLE_PERMISSIONS = JSON.parse(rpMatch[1].replace(/;\s*$/, '').replace(/'/g, '"'));
// mirrors requireRole(): Admin('*') passes; else role must hold at least one of the required modules
function roleAllowed(role, modules) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms === '*') return true;
    return !!(perms && modules.some(m => perms.includes(m)));
}

// ---- H-6: audit-trail = settings (IT/Admin only) ----
console.log(`${BOLD}[H-6] audit-trail role gate (settings)${RESET}`);
assert(roleAllowed('Admin', ['settings']), 'Admin allowed on audit-trail');
assert(roleAllowed('IT', ['settings']), 'IT allowed on audit-trail (system/security operator)');
['Doctor', 'Nurse', 'Lab Technician', 'Pharmacist', 'Finance', 'Reception'].forEach(r =>
    assert(!roleAllowed(r, ['settings']), `${r} DENIED on audit-trail`));

// ---- H-7: cosmetic = doctor/surgery ----
console.log(`${BOLD}[H-7] cosmetic role gate (doctor/surgery)${RESET}`);
assert(roleAllowed('Doctor', ['doctor', 'surgery']), 'Doctor allowed on cosmetic');
assert(roleAllowed('Admin', ['doctor', 'surgery']), 'Admin allowed on cosmetic');
['Lab Technician', 'Pharmacist', 'Finance', 'Blood Bank', 'IT', 'Reception'].forEach(r =>
    assert(!roleAllowed(r, ['doctor', 'surgery']), `${r} DENIED on cosmetic`));

// ---- H-7: social-work + mortuary = him/nursing ----
console.log(`${BOLD}[H-7] social-work & mortuary role gate (him/nursing)${RESET}`);
assert(roleAllowed('HIM', ['him', 'nursing']), 'HIM allowed on social-work/mortuary');
assert(roleAllowed('Nurse', ['him', 'nursing']), 'Nurse allowed on social-work/mortuary');
assert(roleAllowed('Admin', ['him', 'nursing']), 'Admin allowed on social-work/mortuary');
['Lab Technician', 'Pharmacist', 'Finance', 'Insurance', 'Blood Bank', 'Radiologist'].forEach(r =>
    assert(!roleAllowed(r, ['him', 'nursing']), `${r} DENIED on social-work/mortuary`));

// ---- H-7: employee CREATE/DELETE = hr (Admin/HR). employees GET stays OPEN (no requireRole, per
// committed decision bc24a47) BUT compensation fields are projected out for non-HR/Admin (Option C).
console.log(`${BOLD}[H-7] employee create/delete role gate (hr)${RESET}`);
assert(roleAllowed('HR', ['hr']), 'HR allowed on employee create/delete');
assert(roleAllowed('Admin', ['hr']), 'Admin allowed on employee create/delete');
['Doctor', 'Nurse', 'Lab Technician', 'Finance', 'Reception'].forEach(r =>
    assert(!roleAllowed(r, ['hr']), `${r} DENIED on employee create/delete`));

// ---- H-7 Option C: employees GET field filtering (salary hidden from non-HR/Admin) ----
console.log(`${BOLD}[H-7 Option C] employees GET compensation field filtering${RESET}`);
// behavioral: replay isHrOrAdmin() decision using the real ROLE_PERMISSIONS
function isHrOrAdmin(role) {
    if (role === 'Admin') return true;
    const perms = ROLE_PERMISSIONS[role];
    return Array.isArray(perms) && perms.includes('hr');
}
assert(isHrOrAdmin('HR') === true, 'HR => full employee record (salary visible)');
assert(isHrOrAdmin('Admin') === true, 'Admin => full employee record (salary visible)');
['Doctor', 'Nurse', 'Lab Technician', 'Finance', 'Reception', 'IT', 'Pharmacist'].forEach(r =>
    assert(isHrOrAdmin(r) === false, `${r} => directory projection only (salary HIDDEN)`));
// static: the directory projection constant excludes compensation fields, and GET uses it
const dirMatch = src.match(/const EMPLOYEE_DIRECTORY_COLS = '([^']*)';/);
assert(!!dirMatch, 'EMPLOYEE_DIRECTORY_COLS constant exists');
const dirCols = dirMatch ? dirMatch[1] : '';
['salary', 'commission_type', 'commission_value'].forEach(f =>
    assert(!new RegExp('\\b' + f + '\\b').test(dirCols), `directory projection EXCLUDES ${f}`));
['id', 'name', 'role'].forEach(f =>
    assert(new RegExp('\\b' + f + '\\b').test(dirCols), `directory projection INCLUDES safe field ${f}`));
const getEmp = (src.match(/app\.get\('\/api\/employees',[\s\S]{0,800}?\n\}\);/) || [''])[0];
assert(/isHrOrAdmin\(/.test(getEmp) && /EMPLOYEE_DIRECTORY_COLS/.test(getEmp), 'employees GET branches on isHrOrAdmin + uses directory projection');
assert(!/SELECT \* FROM employees/.test(getEmp), 'employees GET no longer hardcodes SELECT * (role-gated projection instead)');

// ---- static: sensitive routes are no longer requireAuth-only ----
console.log(`${BOLD}[static] route signatures carry requireRole (+ tenant scope)${RESET}`);
function sig(re) { const m = src.match(re); return m ? m[0] : ''; }
const checks = [
    [/app\.get\('\/api\/audit-trail',[^\n]*/, "requireRole('settings')", 'requireTenantScope', 'audit-trail'],
    [/app\.post\('\/api\/employees',[^\n]*/, "requireRole('hr')", null, 'employees POST'],
    [/app\.delete\('\/api\/employees\/:id',[^\n]*/, "requireRole('hr')", null, 'employees DELETE'],
    [/app\.get\('\/api\/cosmetic\/cases',[^\n]*/, "requireRole('doctor', 'surgery')", 'requireTenantScope', 'cosmetic/cases'],
    [/app\.put\('\/api\/cosmetic\/cases\/:id',[^\n]*/, "requireRole('doctor', 'surgery')", 'requireTenantScope', 'cosmetic/cases PUT'],
    [/app\.get\('\/api\/social-work\/cases',[^\n]*/, "requireRole('him', 'nursing')", 'requireTenantScope', 'social-work/cases'],
    [/app\.put\('\/api\/social-work\/cases\/:id',[^\n]*/, "requireRole('him', 'nursing')", 'requireTenantScope', 'social-work PUT'],
    [/app\.get\('\/api\/mortuary\/cases',[^\n]*/, "requireRole('him', 'nursing')", 'requireTenantScope', 'mortuary/cases'],
    [/app\.put\('\/api\/mortuary\/cases\/:id',[^\n]*/, "requireRole('him', 'nursing')", 'requireTenantScope', 'mortuary PUT'],
];
for (const [re, role, scope, label] of checks) {
    const s = sig(re);
    assert(s.includes('requireAuth') && s.includes(role), `${label} carries ${role}`, s.slice(0, 90));
    if (scope) assert(s.includes(scope), `${label} carries ${scope}`);
    assert(!/requireAuth,\s*async/.test(s), `${label} is NOT requireAuth-only`);
}

console.log(`\n${BOLD}Result: ${passed} passed, ${failed} failed${RESET}`);
if (failed > 0) { console.log(`${RED}Failures:${RESET}`); failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
process.exit(0);
