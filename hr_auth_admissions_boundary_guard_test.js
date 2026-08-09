/**
 * HR/Auth/Admissions Wave Boundary Guard
 * 22 routes: 4 MFA + 3 employees + 3 admissions + 12 HR ops
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  // MFA — enroll body empty (idempotencyGuard only); verify/disable/admin-reset have schemas
  { route: '/api/mfa/enroll',        verb: 'post', schema: null },
  { route: '/api/mfa/verify',        verb: 'post', schema: 'mfaVerify' },
  { route: '/api/mfa/disable',       verb: 'post', schema: 'mfaDisable' },
  { route: '/api/mfa/admin-reset',   verb: 'post', schema: 'mfaAdminReset' },
  // Employees
  { route: '/api/employees',         verb: 'post',   schema: 'employeeCreate' },
  { route: '/api/employees/:id',     verb: 'delete', schema: null },
  { route: '/api/hr/employees',      verb: 'post',   schema: 'employeeCreate' },
  // Admissions
  { route: '/api/admissions',                 verb: 'post', schema: 'admissionCreate' },
  { route: '/api/admissions/:id/discharge',   verb: 'put',  schema: 'admissionDischargeUpdate' },
  { route: '/api/admissions/:id/rounds',      verb: 'post', schema: 'admissionRoundCreate' },
  // HR ops
  { route: '/api/hr/licenses',                       verb: 'post', schema: 'hrLicenseCreate' },
  { route: '/api/hr/shifts',                         verb: 'post', schema: 'hrShiftCreate' },
  { route: '/api/hr/attendance',                     verb: 'post', schema: 'hrAttendanceCreate' },
  { route: '/api/hr/leave-requests',                 verb: 'post', schema: 'hrLeaveRequestCreate' },
  { route: '/api/hr/leave-requests/:id/status',      verb: 'put',  schema: 'hrLeaveRequestStatusUpdate' },
  { route: '/api/hr/payroll-slips',                  verb: 'post', schema: 'hrPayrollSlipCreate' },
  { route: '/api/hr/payroll-slips/:id/status',       verb: 'put',  schema: 'hrPayrollSlipStatusUpdate' },
  { route: '/api/hr/competencies',                   verb: 'post', schema: 'hrCompetencyCreate' },
  { route: '/api/hr/credentialing',                  verb: 'post', schema: 'hrCredentialingCreate' },
  { route: '/api/hr/credentialing/:id/verify',       verb: 'put',  schema: 'hrCredentialingVerify' },
  { route: '/api/hr/gosi/calculate',                 verb: 'post', schema: 'hrGosiCalculate' },
  { route: '/api/hr/wps/generate',                   verb: 'post', schema: 'hrWpsGenerate' },
  { route: '/api/hr/wps/:id/submit',                 verb: 'put',  schema: 'hrWpsSubmit' },
  { route: '/api/hr/nitaqat/calculate',              verb: 'post', schema: 'hrNitaqatCalculate' },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `app\\.${c.verb}\\('${escaped}'[\\s\\S]{0,500}?idempotencyGuard\\s*,`
  );
  try {
    assert.ok(re.test(serverSrc), `idempotencyGuard missing for: ${c.verb.toUpperCase()} ${c.route}`);
    if (c.schema) {
      const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
      assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined`);
      const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
      assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported`);
    }
    console.log(`  PASS  ${c.verb.toUpperCase().padEnd(6)} ${c.route}${c.schema ? '  ->  ' + c.schema : '  (idempotencyGuard only)'}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.verb.toUpperCase().padEnd(6)} ${c.route}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`HR/Auth/Admissions boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);