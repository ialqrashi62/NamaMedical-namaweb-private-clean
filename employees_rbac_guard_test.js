/**
 * employees_rbac_guard_test.js — static assertion: employee create/delete are HR/Admin-gated; GET stays open.
 * No DB/HTTP, no PHI. node employees_rbac_guard_test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const getSig = src.match(/app\.get\('\/api\/employees',[^\n]*/)[0];
ok(/requireAuth/.test(getSig), "GET /api/employees has requireAuth");
ok(!/requireRole/.test(getSig), "GET /api/employees stays OPEN (no requireRole — doctor lists)");
ok(src.includes("app.post('/api/employees', requireAuth, requireRole('hr')"), "POST /api/employees requires role 'hr' (HR+Admin)");
ok(src.includes("app.delete('/api/employees/:id', requireAuth, requireRole('hr')"), "DELETE /api/employees/:id requires role 'hr' (HR+Admin)");
ok(/CREATE_EMPLOYEE/.test(src), "POST audited (CREATE_EMPLOYEE)");
ok(/DELETE_EMPLOYEE/.test(src), "DELETE audited (DELETE_EMPLOYEE)");

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
