'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const routerSrc = fs.readFileSync(path.join(__dirname, 'phase3_calculators_router.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(__dirname, 'internal_medicine_wave1_engine_batch3.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const ROUTES = [
  {
    "path": "/gyn-onc/recurrence-risk",
    "fn": "checkGynOncRecurrenceRisk"
  },
  {
    "path": "/ob/preeclampsia-alert",
    "fn": "checkPreeclampsiaAlert"
  },
  {
    "path": "/ibd/step-up-therapy",
    "fn": "checkStepUpTherapyNeeded"
  },
  {
    "path": "/endocrine/hypercalcemic-crisis",
    "fn": "checkHypercalcemicCrisis"
  },
  {
    "path": "/bariatric/weight-loss-plateau",
    "fn": "checkWeightLossPlateau"
  },
  {
    "path": "/gyn/pid-referral",
    "fn": "checkPidReferral"
  }
];

function runTests() {
    for (const r of ROUTES) {
        assert.ok(
            new RegExp('\\b' + r.fn + '\\b').test(engineSrc),
            'internal_medicine_wave1_engine_batch3.js must export ' + r.fn
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
    console.log('internal_medicine_wave1_engine_batch3_routes_static_test: all ' + ROUTES.length + ' routes verified');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
