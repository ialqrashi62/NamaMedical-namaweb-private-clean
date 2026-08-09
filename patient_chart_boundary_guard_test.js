/**
 * Patient Chart Boundary Guard
 * --------------------------------------------------------------------
 * Static verification that every critical patient-chart mutation
 * endpoint now sits behind validateBody(RS.*) and idempotencyGuard.
 *
 * This is the boundary-hardening counterpart to the live tests in
 * test:clinical:safety. It must fail fast if a route regresses.
 *
 * Run: node patient_chart_boundary_guard_test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const SERVER_JS = path.join(ROOT, 'server.js');
const SCHEMAS_JS = path.join(ROOT, 'route_schemas.js');

const serverSrc = fs.readFileSync(SERVER_JS, 'utf8');
const schemasSrc = fs.readFileSync(SCHEMAS_JS, 'utf8');

const checks = [
  {
    label: 'POST /api/patients → patientCreate + idempotencyGuard',
    regex: /app\.post\(\s*'\/api\/patients'\s*,\s*requireAuth\s*,\s*requireRole\('patients'\)\s*,\s*validateBody\(RS\.patientCreate\)\s*,\s*idempotencyGuard\s*,/,
    schema: 'patientCreate',
  },
  {
    label: 'PUT /api/patients/:id → patientUpdate + idempotencyGuard',
    regex: /app\.put\(\s*'\/api\/patients\/:id'\s*,\s*requireAuth\s*,\s*requireRole\('patients'\)\s*,\s*validateBody\(RS\.patientUpdate\)\s*,\s*idempotencyGuard\s*,/,
    schema: 'patientUpdate',
  },
  {
    label: 'POST /api/patients/:id/problems → patientProblemCreate + idempotencyGuard',
    regex: /app\.post\(\s*'\/api\/patients\/:id\/problems'\s*,\s*requireAuth\s*,\s*requireTenantScope\s*,\s*validateBody\(RS\.patientProblemCreate\)\s*,\s*idempotencyGuard\s*,/,
    schema: 'patientProblemCreate',
  },
  {
    label: 'POST /api/patients/:id/social-history → patientSocialHistoryUpsert + idempotencyGuard',
    regex: /app\.post\(\s*'\/api\/patients\/:id\/social-history'\s*,\s*requireAuth\s*,\s*requireTenantScope\s*,\s*validateBody\(RS\.patientSocialHistoryUpsert\)\s*,\s*idempotencyGuard\s*,/,
    schema: 'patientSocialHistoryUpsert',
  },
  {
    label: 'POST /api/patients/:id/family-history → patientFamilyHistoryCreate + idempotencyGuard',
    regex: /app\.post\(\s*'\/api\/patients\/:id\/family-history'\s*,\s*requireAuth\s*,\s*requireTenantScope\s*,\s*validateBody\(RS\.patientFamilyHistoryCreate\)\s*,\s*idempotencyGuard\s*,/,
    schema: 'patientFamilyHistoryCreate',
  },
  {
    label: 'POST /api/patients/:id/consent → idempotencyGuard (no schema — body empty)',
    regex: /app\.post\(\s*'\/api\/patients\/:id\/consent'\s*,\s*requireAuth\s*,\s*requireRole\('patients'\)\s*,\s*idempotencyGuard\s*,/,
    schema: null,
  },
  {
    label: 'POST /api/encounters/:id/sign → idempotencyGuard (no schema — body empty)',
    regex: /app\.post\(\s*'\/api\/encounters\/:id\/sign'\s*,\s*requireAuth\s*,\s*requireTenantScope\s*,\s*idempotencyGuard\s*,/,
    schema: null,
  },
];

let pass = 0;
let fail = 0;

for (const c of checks) {
  try {
    assert.ok(c.regex.test(serverSrc), `route signature missing for: ${c.label}`);
    if (c.schema) {
      const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
      assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined in route_schemas.js`);
      const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
      assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported from route_schemas.js`);
    }
    console.log(`  PASS  ${c.label}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.label}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`Patient chart boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);