/**
 * wave37_redis_metric_test.js — Unit + structural + safety tests for the
 * Wave 37 Redis metric ping helper.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: source must not embed any secret material.
 *   - Rail 12: never logs client config / connection strings.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const w37 = require('./wave37_redis_metric');
const SOURCE_FILE = path.join(__dirname, 'wave37_redis_metric.js');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error('assertion failed' + (msg ? `: ${msg}` : '')); }
function assertStrictEqual(a, b, msg) { if (a !== b) throw new Error('assertion failed' + (msg ? `: ${msg}` : '') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ----- setGlobalApp -----

test('setGlobalApp: registers the in-process reference', () => {
    w37._resetForTests();
    const fakeApp = { locals: { redisClient: { ping: async () => 'PONG' } } };
    w37.setGlobalApp(fakeApp);
    assertStrictEqual(w37._getRegisteredApp(), fakeApp);
});

test('setGlobalApp: also writes global.__nama_app when global exists', () => {
    w37._resetForTests();
    const fakeApp = { locals: { redisClient: { ping: async () => 'PONG' } } };
    w37.setGlobalApp(fakeApp);
    assertStrictEqual(global.__nama_app, fakeApp);
});

test('setGlobalApp: ignores null / undefined', () => {
    w37._resetForTests();
    w37.setGlobalApp(null);
    w37.setGlobalApp(undefined);
    assertStrictEqual(w37._getRegisteredApp(), null);
});

// ----- resolveRedisClient -----

test('resolveRedisClient: returns null when no app registered', () => {
    w37._resetForTests();
    assertStrictEqual(w37.resolveRedisClient(), null);
});

test('resolveRedisClient: returns the client from the registered app', () => {
    w37._resetForTests();
    const fakeClient = { ping: async () => 'PONG' };
    w37.setGlobalApp({ locals: { redisClient: fakeClient } });
    assertStrictEqual(w37.resolveRedisClient(), fakeClient);
});

test('resolveRedisClient: returns the client from global.__nama_app', () => {
    w37._resetForTests();
    const fakeClient = { ping: async () => 'PONG' };
    global.__nama_app = { locals: { redisClient: fakeClient } };
    assertStrictEqual(w37.resolveRedisClient(), fakeClient);
});

test('resolveRedisClient: returns null when client has no ping()', () => {
    w37._resetForTests();
    w37.setGlobalApp({ locals: { redisClient: { notPing: () => {} } } });
    assertStrictEqual(w37.resolveRedisClient(), null);
});

test('resolveRedisClient: returns null when locals has no redisClient', () => {
    w37._resetForTests();
    w37.setGlobalApp({ locals: {} });
    assertStrictEqual(w37.resolveRedisClient(), null);
});

// ----- probeRedis -----

test('probeRedis: returns ok=true when ping succeeds', async () => {
    const c = { ping: async () => 'PONG' };
    const r = await w37.probeRedis(c);
    assertStrictEqual(r.ok, true);
    assertStrictEqual(r.reason, null);
    assert(r.latencyMs !== null, 'latencyMs must be set');
});

test('probeRedis: returns ok=false when ping throws', async () => {
    const c = { ping: async () => { throw new Error('ECONNREFUSED'); } };
    const r = await w37.probeRedis(c);
    assertStrictEqual(r.ok, false);
    assertStrictEqual(r.reason, 'ECONNREFUSED');
});

test('probeRedis: returns ok=false when ping hangs past timeout', async () => {
    const c = { ping: () => new Promise(() => {}) };  // never resolves
    const r = await w37.probeRedis(c, { timeoutMs: 50 });
    assertStrictEqual(r.ok, false);
    assertStrictEqual(r.reason, 'ping timeout');
});

test('probeRedis: returns ok=false with reason=no_client when client is null', async () => {
    const r = await w37.probeRedis(null);
    assertStrictEqual(r.ok, false);
    assertStrictEqual(r.reason, 'no_client');
});

// ----- toPrometheusMetric -----

test('toPrometheusMetric: emits 1 when ok', () => {
    assertStrictEqual(w37.toPrometheusMetric({ ok: true }), 'nama_redis_up 1');
});

test('toPrometheusMetric: emits 0 when not ok', () => {
    assertStrictEqual(w37.toPrometheusMetric({ ok: false }), 'nama_redis_up 0');
});

test('toPrometheusMetric: emits 0 when probe is null', () => {
    assertStrictEqual(w37.toPrometheusMetric(null), 'nama_redis_up 0');
});

test('toPrometheusMetric: appends a custom suffix', () => {
    assertStrictEqual(w37.toPrometheusMetric({ ok: true }, '_main'),
        'nama_redis_up_main 1');
});

// ----- Safety rails -----

test('source file: present and non-empty', () => {
    assert(fs.existsSync(SOURCE_FILE), `${SOURCE_FILE} must exist`);
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    assert(content.length > 1000, 'source should be substantial');
});

test('source file: never embeds a password or KEK phrase', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/password\s*[:=]/i.test(stripped), 'no password literal');
    assert(!/KEK_PASSPHRASE/i.test(stripped), 'no KEK phrase literal');
    assert(!/PGPASSWORD\s*[:=]/i.test(stripped), 'no PGPASSWORD literal');
});

test('source file: never references DELETE FROM or DROP DATABASE', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/\bDELETE\s+FROM\b/i.test(stripped), 'no DELETE FROM');
    assert(!/\bDROP\s+DATABASE\b/i.test(stripped), 'no DROP DATABASE');
    assert(!/\bDROP\s+TABLE\b/i.test(stripped), 'no DROP TABLE');
});

// ----- Runner -----

(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`[PASS] ${t.name}`);
            passed++;
        } catch (e) {
            console.log(`[FAIL] ${t.name}: ${e.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();