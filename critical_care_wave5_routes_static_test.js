/**
 * critical_care_wave5_routes_static_test.js — DB-free static check verifying the
 * 9 Wave 5 (Critical Care & Emergency) stateless routes are mounted in the
 * Phase 3 calculators router at /api/phase3/* and call the matching engine
 * function via runOr400 (fail-closed 400 on bad input).
 *
 * Updated for the batch-18 unified Phase 3 router topology (commit e23714a).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const routerSrc = fs.readFileSync(path.join(__dirname, 'phase3_calculators_router.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(__dirname, 'critical_care_wave5_engine.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const ROUTES = [
    { path: '/stroke/tpa-eligibility',         fn: 'checkTpaEligibility' },
    { path: '/tox-er/toxidrome-id',            fn: 'matchToxidromeAntidote' },
    { path: '/obs-unit/disposition-check',     fn: 'checkObservationDispositionAlert' },
    { path: '/minor-surg-er/wound-assessment', fn: 'checkWoundComplexityRouting' },
    { path: '/neuro-icu/icp-log',              fn: 'checkCushingsTriad' },
    { path: '/onc-icu/dual-surveillance',      fn: 'checkOncologyIcuDualSurveillance' },
    { path: '/transplant-icu/dual-workup',     fn: 'checkTransplantFeverWorkup' },
    { path: '/hbot/pre-session-screen',        fn: 'checkHbotSafetyGate' },
    { path: '/trauma-center/activation-level', fn: 'checkTraumaActivationLevel' },
];

function runTests() {
    for (const r of ROUTES) {
        assert.ok(
            new RegExp('\\b' + r.fn + '\\b').test(engineSrc),
            `critical_care_wave5_engine.js must export ${r.fn}`
        );
    }
    assert.ok(
        /app\.use\(\s*['"]\/api\/phase3['"]\s*,/.test(serverSrc) &&
        /makePhase3CalculatorsRouter/.test(serverSrc),
        'server.js must mount /api/phase3 via makePhase3CalculatorsRouter'
    );
    assert.ok(
        /router\.use\(\s*(requireAuth|requireTenantScope)/.test(routerSrc),
        'phase3_calculators_router.js must apply requireAuth/requireTenantScope at router level'
    );
    for (const r of ROUTES) {
        const declStr = `router.post('${r.path}'`;
        const idx = routerSrc.indexOf(declStr);
        assert.ok(idx !== -1, `route must exist: ${r.path}`);

        const blockEnd = routerSrc.indexOf('));', idx);
        const block = routerSrc.slice(idx, blockEnd === -1 ? idx + 300 : blockEnd);
        assert.ok(block.includes('runOr400'), `${r.path} must use runOr400 helper`);
        assert.ok(block.includes(r.fn), `${r.path} must call engine function ${r.fn}`);
    }

    console.log(`critical_care_wave5_routes_static_test: all ${ROUTES.length} routes verified`);
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
