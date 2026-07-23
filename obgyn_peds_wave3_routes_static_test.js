'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const routerSrc = fs.readFileSync(path.join(__dirname, 'phase3_calculators_router.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(__dirname, 'obgyn_peds_wave3_engine.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const ROUTES = [
  {
    "path": "/gyn-surg/mass-assessment",
    "fn": "checkAdnexalMassRouting"
  },
  {
    "path": "/ivf/ohss-risk-check",
    "fn": "checkOhssFreezeAllRecommendation"
  },
  {
    "path": "/adolescent-gyn/pubertal-assessment",
    "fn": "checkPubertalTimingReferral"
  },
  {
    "path": "/menopause/hrt-eligibility",
    "fn": "checkHrtEligibility"
  },
  {
    "path": "/urogyn/routing-check",
    "fn": "checkUrogynecologyRouting"
  },
  {
    "path": "/peds-genetics/carrier-screening-check",
    "fn": "checkExpandedCarrierScreening"
  },
  {
    "path": "/peds/malnutrition-classification",
    "fn": "checkMalnutritionClassification"
  },
  {
    "path": "/peds/developmental-regression",
    "fn": "checkDevelopmentalRegressionFlag"
  },
  {
    "path": "/peds/dose-guard",
    "fn": "checkPediatricDoseGuard"
  }
];

function runTests() {
    for (const r of ROUTES) {
        assert.ok(
            new RegExp('\\b' + r.fn + '\\b').test(engineSrc),
            'obgyn_peds_wave3_engine.js must export ' + r.fn
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
        const declStr = "router.post('" + r.path + "'";
        const idx = routerSrc.indexOf(declStr);
        assert.ok(idx !== -1, 'route must exist: ' + r.path);
        const blockEnd = routerSrc.indexOf('));', idx);
        const block = routerSrc.slice(idx, blockEnd === -1 ? idx + 300 : blockEnd);
        assert.ok(block.includes('runOr400'), r.path + ' must use runOr400 helper');
        assert.ok(block.includes(r.fn), r.path + ' must call engine function ' + r.fn);
    }
    console.log('obgyn_peds_wave3_engine_routes_static_test: all ' + ROUTES.length + ' routes verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
