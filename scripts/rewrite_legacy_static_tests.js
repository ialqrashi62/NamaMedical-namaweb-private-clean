'use strict';
const fs = require('fs');
const path = require('path');

const TARGETS = [
  { file: 'diagnostics_wave4_routes_static_test.js', engine: 'diagnostics_wave4_engine' },
  { file: 'internal_medicine_wave1_routes_static_test.js', engine: 'internal_medicine_wave1_engine' },
  { file: 'internal_medicine_wave1_batch2_routes_static_test.js', engine: 'internal_medicine_wave1_engine_batch2' },
  { file: 'internal_medicine_wave1_batch3_routes_static_test.js', engine: 'internal_medicine_wave1_engine_batch3' },
  { file: 'internal_medicine_wave1_batch4_routes_static_test.js', engine: 'internal_medicine_wave1_engine_batch4' },
  { file: 'obgyn_peds_wave3_routes_static_test.js', engine: 'obgyn_peds_wave3_engine' },
  { file: 'rare_specialized_routes_static_test.js', engine: 'rare_specialized_engine' },
  { file: 'surgical_wave2_routes_static_test.js', engine: 'surgical_wave2_engine' },
];

for (const t of TARGETS) {
  const existing = fs.readFileSync(path.join(__dirname, t.file), 'utf8');
  const routeMatches = [...existing.matchAll(/\{\s*route:\s*'([^']+)'/g)];
  const fnMatches = [...existing.matchAll(/\{\s*route:\s*'[^']+',\s*fn:\s*'([^']+)'/g)];
  if (routeMatches.length === 0) continue;

  const newRoutes = routeMatches.map((m, i) => ({
    path: m[1].replace(/^\/api/, ''),
    fn: fnMatches[i] ? fnMatches[i][1] : 'unknown',
  }));

  const header = '/**\n'
    + ' * ' + t.file + ' - DB-free static check that the '
    + newRoutes.length + ' ' + t.engine + ' stateless\n'
    + ' * decision-support routes are mounted in the Phase 3 unified router at\n'
    + ' * /api/phase3/* and call the matching engine function via runOr400.\n'
    + ' *\n'
    + ' * Updated for the batch-18 unified Phase 3 router topology (commit e23714a).\n'
    + ' */\n';
  const body = "'use strict';\n"
    + "const fs = require('fs');\n"
    + "const path = require('path');\n"
    + "const assert = require('assert');\n"
    + "\n"
    + "const routerSrc = fs.readFileSync(path.join(__dirname, 'phase3_calculators_router.js'), 'utf8');\n"
    + "const engineSrc = fs.readFileSync(path.join(__dirname, '" + t.engine + ".js'), 'utf8');\n"
    + "const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');\n"
    + "\n"
    + "const ROUTES = " + JSON.stringify(newRoutes, null, 4) + ";\n"
    + "\n"
    + "function runTests() {\n"
    + "    for (const r of ROUTES) {\n"
    + "        assert.ok(\n"
    + "            new RegExp('\\\\b' + r.fn + '\\\\b').test(engineSrc),\n"
    + "            '" + t.engine + ".js must export ' + r.fn\n"
    + "        );\n"
    + "    }\n"
    + "    assert.ok(\n"
    + "        /app\\\\.use\\\\(\\\\s*['\"]\\\\/api\\\\/phase3['\"]\\\\s*,/.test(serverSrc) &&\n"
    + "        /makePhase3CalculatorsRouter/.test(serverSrc),\n"
    + "        'server.js must mount /api/phase3 via makePhase3CalculatorsRouter'\n"
    + "    );\n"
    + "    assert.ok(\n"
    + "        /router\\\\.use\\\\(\\\\s*(requireAuth|requireTenantScope)/.test(routerSrc),\n"
    + "        'phase3_calculators_router.js must apply requireAuth/requireTenantScope at router level'\n"
    + "    );\n"
    + "    for (const r of ROUTES) {\n"
    + "        const declStr = \"router.post('\" + r.path + \"'\";\n"
    + "        const idx = routerSrc.indexOf(declStr);\n"
    + "        assert.ok(idx !== -1, 'route must exist: ' + r.path);\n"
    + "        const blockEnd = routerSrc.indexOf('));', idx);\n"
    + "        const block = routerSrc.slice(idx, blockEnd === -1 ? idx + 300 : blockEnd);\n"
    + "        assert.ok(block.includes('runOr400'), r.path + ' must use runOr400 helper');\n"
    + "        assert.ok(block.includes(r.fn), r.path + ' must call engine function ' + r.fn);\n"
    + "    }\n"
    + "    console.log('" + t.engine + "_routes_static_test: all ' + ROUTES.length + ' routes verified');\n"
    + "}\n"
    + "\n"
    + "if (require.main === module) {\n"
    + "    runTests();\n"
    + "}\n"
    + "\n"
    + "module.exports = { runTests };\n";

  fs.writeFileSync(path.join(__dirname, t.file), header + body);
  console.log('rewrote', t.file, 'with', newRoutes.length, 'routes');
}
