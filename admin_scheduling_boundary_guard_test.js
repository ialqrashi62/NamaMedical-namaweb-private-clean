/**
 * Admin/Scheduling Wave Boundary Guard
 * 8 routes: appointments DELETE, forms (POST/DELETE), queue/ads,
 * referrals POST, settings/rooms (POST/PUT/DELETE)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  { route: '/api/appointments/:id',     verb: 'delete', schema: null },
  { route: '/api/forms',                verb: 'post',   schema: 'formTemplateCreate' },
  { route: '/api/forms/:id',            verb: 'delete', schema: null },
  { route: '/api/queue/ads',            verb: 'post',   schema: 'queueAdCreate' },
  { route: '/api/referrals',            verb: 'post',   schema: 'referralCreate' },
  { route: '/api/settings/rooms',       verb: 'post',   schema: 'settingsRoomCreate' },
  { route: '/api/settings/rooms/:id',   verb: 'put',    schema: 'settingsRoomUpdate' },
  { route: '/api/settings/rooms/:id',   verb: 'delete', schema: null },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `app\\.${c.verb}\\('${escaped}'[\\s\\S]{0,400}?idempotencyGuard\\s*,`
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
console.log(`Admin/scheduling boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);