'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'diagnostics_wave4_routes_static_test.js',
  'internal_medicine_wave1_routes_static_test.js',
  'internal_medicine_wave1_batch2_routes_static_test.js',
  'internal_medicine_wave1_batch3_routes_static_test.js',
  'internal_medicine_wave1_batch4_routes_static_test.js',
  'obgyn_peds_wave3_routes_static_test.js',
  'rare_specialized_routes_static_test.js',
  'surgical_wave2_routes_static_test.js',
];

const NEW_ASSERTION_LINES = [
  "    assert.ok(",
  "        /app\\.use\\(\\s*['\"]\\/api\\/phase3['\"]\\s*,/.test(serverSrc) &&",
  "        /makePhase3CalculatorsRouter/.test(serverSrc),",
  "        'server.js must mount /api/phase3 via makePhase3CalculatorsRouter'",
  "    );",
];
const NEW_ASSERTION = NEW_ASSERTION_LINES.join('\n');

const ROUTER_ASSERTION_LINES = [
  "    assert.ok(",
  "        /router\\.use\\(\\s*(requireAuth|requireTenantScope)/.test(routerSrc),",
  "        'phase3_calculators_router.js must apply requireAuth/requireTenantScope at router level'",
  "    );",
];
const ROUTER_ASSERTION = ROUTER_ASSERTION_LINES.join('\n');

for (const f of FILES) {
  const p = path.join(ROOT, f);
  let c = fs.readFileSync(p, 'utf8');
  const before = c;

  // Replace the broken app.use+phase3 assertion block: from `assert.ok(` to `);` spanning the broken regex.
  // We use a more permissive pattern: replace from the first `assert.ok(` containing 'app' all the way to the closing `);` of that block.
  // Easier: locate by content anchors.

  // Find the app.use block: starts at "    assert.ok(\n" line that contains "phase3['"
  // and ends with the next "\n    );"
  const appBlockRe = /    assert\.ok\(\s*\n[^\n]*?app\\\.use[^\n]*?phase3[^\n]*?\n        \/makePhase3CalculatorsRouter\/[^\n]*?\n        'server\.js must mount[^\n]*?\n    \);/;
  c = c.replace(appBlockRe, NEW_ASSERTION);

  // Find the router.use block similarly
  const routerBlockRe = /    assert\.ok\(\s*\n[^\n]*?router\\\.use[^\n]*?requireAuth[^\n]*?\n        'phase3_calculators_rout[^\n]*?\n    \);/;
  c = c.replace(routerBlockRe, ROUTER_ASSERTION);

  fs.writeFileSync(p, c);
  console.log('processed', f, c === before ? '(no change)' : '(rewrote)');
}
