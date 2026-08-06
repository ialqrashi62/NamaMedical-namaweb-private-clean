// wave45_db_pool_metrics_test.js — 13 tests

'use strict';

const w45 = require('./wave45_db_pool_metrics');

let passed = 0, failed = 0;
function ok(label, cond, extra) {
    if (cond) { passed += 1; console.log('[PASS]', label); }
    else { failed += 1; console.log('[FAIL]', label, extra || ''); }
}
function chk(label, fn) {
    try { fn(); } catch (e) { ok(label, false, e.message); }
}

// ---------- 1. summarize() with mock pool ----------

chk('summarize returns all fields from mock pool', () => {
    // node-postgres exposes totalCount/idleCount/waitingCount as **properties** (numbers).
    const mockPool = {
        totalCount: 7,
        idleCount: 3,
        waitingCount: 2,
        options: { max: 20 }
    };
    const s = w45.summarize(mockPool);
    ok('  total = 7', s.total === 7);
    ok('  idle = 3', s.idle === 3);
    ok('  waiting = 2', s.waiting === 2);
    ok('  max = 20', s.max === 20);
    // utilization = (7 - 3) / 20 = 0.2
    ok('  utilization = 0.2', s.utilization === 0.2);
    ok('  captured_at set', typeof s.captured_at === 'string');
});

chk('summarize computes correct utilization at 100%', () => {
    const mockPool = {
        totalCount: 20,
        idleCount: 0,
        waitingCount: 5,
        options: { max: 20 }
    };
    const s = w45.summarize(mockPool);
    ok('  utilization = 1.0', s.utilization === 1.0);
});

chk('summarize handles pool without options.max', () => {
    const mockPool = {
        totalCount: 5,
        idleCount: 5,
        waitingCount: 0
        // no options.max
    };
    const s = w45.summarize(mockPool);
    ok('  max = 0', s.max === 0);
    ok('  utilization = 0 (unknown)', s.utilization === 0);
});

chk('summarize handles null pool safely', () => {
    const s = w45.summarize(null);
    ok('  total = 0', s.total === 0);
    ok('  idle = 0', s.idle === 0);
    ok('  waiting = 0', s.waiting === 0);
    ok('  max = 0', s.max === 0);
});

chk('summarize never throws on weird pool shape', () => {
    let didThrow = false;
    try {
        w45.summarize({});
        w45.summarize({ totalCount: 'not a function' });
        w45.summarize({ totalCount: function() { return 'string'; } });
        w45.summarize(undefined);
    } catch (e) {
        didThrow = true;
    }
    ok('  never throws', !didThrow);
});

// ---------- 2. Cache behavior ----------

chk('getSummary caches results for 5 seconds', () => {
    w45.reset();
    let callCount = 0;
    const mockPool = {
        get totalCount() { callCount += 1; return 5; },
        idleCount: 5,
        waitingCount: 0,
        options: { max: 20 }
    };
    const s1 = w45.getSummary(mockPool);
    const s2 = w45.getSummary(mockPool);
    const s3 = w45.getSummary(mockPool);
    ok('  total = 5', s1.total === 5);
    ok('  same object returned (cached)', s1 === s2 && s2 === s3);
    ok('  pool read only once', callCount === 1);
});

chk('reset() clears cache', () => {
    w45.reset();
    let callCount = 0;
    const mockPool = {
        get totalCount() { callCount += 1; return 5; },
        idleCount: 5,
        waitingCount: 0,
        options: { max: 20 }
    };
    w45.getSummary(mockPool);
    ok('  pool read once before reset', callCount === 1);
    w45.reset();
    w45.getSummary(mockPool);
    ok('  pool read again after reset', callCount === 2);
});

// ---------- 3. Prometheus format ----------

chk('toPrometheusMetrics emits 6 expected gauges', () => {
    const out = w45.toPrometheusMetrics();
    ok('  contains nama_db_pool_total', out.indexOf('nama_db_pool_total') >= 0);
    ok('  contains nama_db_pool_idle', out.indexOf('nama_db_pool_idle') >= 0);
    ok('  contains nama_db_pool_waiting', out.indexOf('nama_db_pool_waiting') >= 0);
    ok('  contains nama_db_pool_max', out.indexOf('nama_db_pool_max') >= 0);
    ok('  contains nama_db_pool_utilization', out.indexOf('nama_db_pool_utilization') >= 0);
});

chk('toPrometheusMetrics reflects values', () => {
    const out = w45.toPrometheusMetrics({
        total: 15, idle: 5, waiting: 0, max: 20, utilization: 0.5
    });
    ok('  total = 15', /^nama_db_pool_total 15$/m.test(out));
    ok('  idle = 5', /^nama_db_pool_idle 5$/m.test(out));
    ok('  waiting = 0', /^nama_db_pool_waiting 0$/m.test(out));
    ok('  max = 20', /^nama_db_pool_max 20$/m.test(out));
    ok('  utilization = 0.5', /^nama_db_pool_utilization 0\.5$/m.test(out));
});

// ---------- 4. Real-ish integration ----------

chk('summarize works with a real pg.Pool-like object', () => {
    // node-postgres Pool exposes totalCount/idleCount/waitingCount as properties.
    let totalCount = 10, idleCount = 6;
    const realLike = {
        get totalCount() { return totalCount; },
        get idleCount() { return idleCount; },
        waitingCount: 0,
        options: { max: 20 }
    };
    const s = w45.summarize(realLike);
    ok('  total = 10', s.total === 10);
    ok('  idle = 6', s.idle === 6);
    // busy = 10 - 6 = 4; util = 4/20 = 0.2
    ok('  utilization = 0.2', s.utilization === 0.2);

    // Now simulate a busy state.
    totalCount = 20;
    idleCount = 0;
    const s2 = w45.summarize(realLike);
    ok('  busy utilization = 1.0', s2.utilization === 1.0);
});

// ---------- 5. Source-file safety ----------

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'wave45_db_pool_metrics.js'), 'utf8');

chk('source file never references DELETE or DROP on prod tables', () => {
    ok('  no SQL DELETE FROM', !/DELETE\s+FROM/i.test(src));
    ok('  no DROP', !/\bDROP\b/.test(src));
});

chk('source file never prints secrets or PHI', () => {
    ok('  no console.log', !/console\.log\s*\(/.test(src));
    ok('  no console.error of req.body', !/console\.error\([^)]*req\.body/i.test(src));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
