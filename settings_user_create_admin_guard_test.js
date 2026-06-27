/**
 * settings_user_create_admin_guard_test.js
 * اختبار ثابت: التحقق من أن إنشاء مستخدم نظام (POST /api/settings/users) محمي بحارس Admin فقط.
 * Static assertion test — no DB/HTTP, no PHI. node settings_user_create_admin_guard_test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// isolate the POST /api/settings/users handler body (up to the next app.<verb>)
const start = src.indexOf("app.post('/api/settings/users'");
ok(start > -1, "POST /api/settings/users handler exists");
const rest = src.slice(start);
const next = rest.indexOf("app.put('/api/settings/users/:id'");
const body = rest.slice(0, next > -1 ? next : 4000);

ok(/req\.session\.user\.role\s*!==\s*'Admin'/.test(body), "guard checks session role !== 'Admin'");
ok(/BLOCKED_USER_CREATE/.test(body), "audit log on blocked create");
ok(/return res\.status\(403\)/.test(body), "returns 403 for non-admin");
// the guard must appear BEFORE the INSERT INTO system_users
const guardIdx = body.indexOf("!== 'Admin'");
const insertIdx = body.indexOf('INSERT INTO system_users');
ok(guardIdx > -1 && insertIdx > -1 && guardIdx < insertIdx, "admin guard precedes INSERT INTO system_users");
// identity must come from session, never req.body (no req.body.role decides authz)
ok(/requireRole\('settings'\)/.test(body), "still layered behind requireRole('settings')");

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
