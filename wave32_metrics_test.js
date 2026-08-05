/**
 * wave32_metrics_test.js — Unit tests for Wave 32 metrics + alert engine.
 */
'use strict';

const assert = require('assert');
const { evaluateAlerts, RULES } = require('./wave32_metrics');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('[PASS]', name); passed++; }
    catch (e) { console.error('[FAIL]', name, e && e.message ? e.message : e); failed++; }
}

test('evaluateAlerts: db_down fires when dbUp=false', () => {
    const firing = evaluateAlerts({ dbUp: false, uptime: 600 });
    assert.ok(firing.some(a => a.id === 'db_down'), 'should fire db_down');
});

test('evaluateAlerts: redis_down fires when redis configured but down', () => {
    const firing = evaluateAlerts({ dbUp: true, redisConfigured: true, redisUp: false, uptime: 600 });
    assert.ok(firing.some(a => a.id === 'redis_down'), 'should fire redis_down');
});

test('evaluateAlerts: redis_down NOT firing when not configured', () => {
    const firing = evaluateAlerts({ dbUp: true, redisConfigured: false, redisUp: false, uptime: 600 });
    assert.ok(!firing.some(a => a.id === 'redis_down'), 'redis_down should not fire when not configured');
});

test('evaluateAlerts: rls_undefended_risk_present fires when > 0 (Wave 36)', () => {
    const none = evaluateAlerts({ dbUp: true, uptime: 600, rlsUndefendedRisk: 0 });
    const some = evaluateAlerts({ dbUp: true, uptime: 600, rlsUndefendedRisk: 1 });
    assert.ok(!none.some(a => a.id === 'rls_undefended_risk_present'),
        'undefended=0 must NOT fire (this is the alert we want to silence)');
    assert.ok(some.some(a => a.id === 'rls_undefended_risk_present'),
        'undefended>0 must fire');
});

test('evaluateAlerts: legacy rls_risk_count_high is no longer in RULES (Wave 36)', () => {
    assert.ok(!RULES.some(r => r.id === 'rls_risk_count_high'),
        'old alert must be removed (replaced by rls_undefended_risk_present)');
});

test('evaluateAlerts: audit_chain_gap fires when auditChainGapsTotal > 0 (Wave 38)', () => {
    const none = evaluateAlerts({ dbUp: true, uptime: 600, auditChainGapsTotal: 0 });
    const some = evaluateAlerts({ dbUp: true, uptime: 600, auditChainGapsTotal: 1 });
    assert.ok(!none.some(a => a.id === 'audit_chain_gap'),
        'must NOT fire when auditChainGapsTotal=0');
    assert.ok(some.some(a => a.id === 'audit_chain_gap'),
        'must fire when auditChainGapsTotal>0 (operator-visible count)');
});

test('evaluateAlerts: process_uptime_low fires when uptime < 60', () => {
    const fresh = evaluateAlerts({ dbUp: true, uptime: 30 });
    assert.ok(fresh.some(a => a.id === 'process_uptime_low'));
});

test('evaluateAlerts: clean probe fires nothing', () => {
    const firing = evaluateAlerts({
        dbUp: true, uptime: 3600, redisUp: true, redisConfigured: true,
        redisErrors: 0, rlsRisk: 0, rlsUndefendedRisk: 0, auditChainGaps: 0,
    });
    assert.strictEqual(firing.length, 0, 'no alerts should fire on a clean probe');
});

test('RULES: every rule has id, severity, title, check, remediation', () => {
    for (const r of RULES) {
        assert.ok(r.id && typeof r.id === 'string');
        assert.ok(['critical', 'warning', 'info'].includes(r.severity));
        assert.ok(r.title);
        assert.ok(typeof r.check === 'function');
        assert.ok(r.remediation);
    }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
