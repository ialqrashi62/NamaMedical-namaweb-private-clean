/**
 * emr_lock_signature_guard_test.js — static assertion for Phase A1 EMR lock/signature endpoints.
 * No DB/HTTP, no PHI. node emr_lock_signature_guard_test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

ok(src.includes("app.post('/api/medical-records/:id/sign', requireAuth, requireRole('doctor', 'nursing')"), "sign endpoint exists, role-guarded");
ok(src.includes("app.post('/api/medical-records/:id/amend', requireAuth, requireRole('doctor', 'nursing')"), "amend endpoint exists, role-guarded");
ok(src.includes("app.get('/api/medical-records/:id/amendments', requireAuth, requireRole('doctor', 'nursing')"), "amendments read endpoint exists, role-guarded");
ok(/emr_status<>'locked'/.test(src), "sign UPDATE guarded by emr_status<>'locked' (no double-lock / no silent edit)");
ok(/emr_status === 'locked'/.test(src) && /already locked/.test(src), "sign returns 409 when already locked");
ok(/Amendment applies only to locked records/.test(src), "amend requires locked record (409 otherwise)");
ok(/Amendment reason required/.test(src), "amend requires reason (400 otherwise)");
ok(/INSERT INTO emr_amendments/.test(src), "amend writes emr_amendments ledger");
ok(/SIGN_LOCK_RECORD/.test(src) && /AMEND_RECORD/.test(src), "audit events SIGN_LOCK_RECORD + AMEND_RECORD");
ok(/integrity_hash/.test(src) && /createHash\('sha256'\)/.test(src), "integrity hash computed on sign");

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
