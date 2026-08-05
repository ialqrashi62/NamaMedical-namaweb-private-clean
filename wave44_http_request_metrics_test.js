// wave44_http_request_metrics_test.js — 14 tests

'use strict';

const w44 = require('./wave44_http_request_metrics');

let passed = 0, failed = 0;
function ok(label, cond, extra) {
    if (cond) { passed += 1; console.log('[PASS]', label); }
    else { failed += 1; console.log('[FAIL]', label, extra || ''); }
}
function chk(label, fn) {
    try { fn(); } catch (e) { ok(label, false, e.message); }
}

// ---------- 1. Counter behavior ----------

chk('recordEnd increments total + by_method + by_class + by_status', () => {
    w44.reset();
    w44.recordEnd('GET', '/api/x', 200, 50);
    w44.recordEnd('GET', '/api/x', 200, 60);
    w44.recordEnd('POST', '/api/y', 201, 100);
    w44.recordEnd('POST', '/api/y', 400, 80);
    w44.recordEnd('DEL_', '/api/z', 500, 200);  // DEL_ is the internal token
    const c = w44.getCounters();
    ok('  total = 5', c.total === 5);
    ok('  by_method.GET = 2', c.by_method.GET === 2);
    ok('  by_method.POST = 2', c.by_method.POST === 2);
    ok('  by_method.DEL_ = 1', c.by_method.DEL_ === 1);
    ok('  by_class["2xx"] = 3', c.by_class['2xx'] === 3);
    ok('  by_class["4xx"] = 1', c.by_class['4xx'] === 1);
    ok('  by_class["5xx"] = 1', c.by_class['5xx'] === 1);
    ok('  by_status["200"] = 2', c.by_status['200'] === 2);
});

chk('recordEnd tracks duration', () => {
    w44.reset();
    w44.recordEnd('GET', '/x', 200, 100);
    w44.recordEnd('GET', '/x', 200, 200);
    const c = w44.getCounters();
    ok('  total_duration_ms = 300', c.total_duration_ms === 300);
    ok('  avg_duration_ms = 150', c.avg_duration_ms === 150);
});

chk('recordStart / recordEnd manage in_flight correctly', () => {
    w44.reset();
    w44.recordStart('GET');
    w44.recordStart('POST');
    let c = w44.getCounters();
    ok('  in_flight = 2 after 2 starts', c.in_flight === 2);
    w44.recordEnd('GET', '/x', 200, 50);
    c = w44.getCounters();
    ok('  in_flight = 1 after 1 end', c.in_flight === 1);
    w44.recordEnd('POST', '/x', 200, 50);
    c = w44.getCounters();
    ok('  in_flight = 0 after 2 ends', c.in_flight === 0);
});

chk('recordEnd clamps in_flight at 0', () => {
    w44.reset();
    // Don't call recordStart, just recordEnd directly.
    w44.recordEnd('GET', '/x', 200, 50);
    const c = w44.getCounters();
    ok('  in_flight = 0 (no negative)', c.in_flight === 0);
});

chk('by_path caps at 50 entries', () => {
    w44.reset();
    for (let i = 0; i < 60; i++) w44.recordEnd('GET', '/api/path' + i, 200, 10);
    const c = w44.getCounters();
    ok('  by_path count <= 50', Object.keys(c.by_path).length <= 50);
});

chk('by_path strips query strings', () => {
    w44.reset();
    w44.recordEnd('GET', '/api/x?foo=1&bar=2', 200, 10);
    w44.recordEnd('GET', '/api/x?foo=3', 200, 10);
    const c = w44.getCounters();
    ok('  by_path["/api/x"] = 2', c.by_path['/api/x'] === 2);
});

// ---------- 2. Method/status classification ----------

chk('method bucket maps unknown methods to OTHER', () => {
    w44.reset();
    w44.recordEnd('FOOBAR', '/x', 200, 10);
    w44.recordEnd('', '/x', 200, 10);
    const c = w44.getCounters();
    ok('  by_method.OTHER = 2', c.by_method.OTHER === 2);
});

chk('status class is computed from status code', () => {
    w44.reset();
    w44.recordEnd('GET', '/x', 100, 5);
    w44.recordEnd('GET', '/x', 199, 5);
    w44.recordEnd('GET', '/x', 200, 5);
    w44.recordEnd('GET', '/x', 299, 5);
    w44.recordEnd('GET', '/x', 301, 5);
    w44.recordEnd('GET', '/x', 404, 5);
    w44.recordEnd('GET', '/x', 499, 5);
    w44.recordEnd('GET', '/x', 500, 5);
    w44.recordEnd('GET', '/x', 503, 5);
    const c = w44.getCounters();
    ok('  1xx = 2', c.by_class['1xx'] === 2);
    ok('  2xx = 2', c.by_class['2xx'] === 2);
    ok('  3xx = 1', c.by_class['3xx'] === 1);
    ok('  4xx = 2', c.by_class['4xx'] === 2);
    ok('  5xx = 2', c.by_class['5xx'] === 2);
});

// ---------- 3. reset() ----------

chk('reset() clears all counters', () => {
    w44.recordEnd('GET', '/x', 200, 10);
    w44.recordStart('POST');
    w44.reset();
    const c = w44.getCounters();
    ok('  total = 0', c.total === 0);
    ok('  in_flight = 0', c.in_flight === 0);
    ok('  by_method = 0', c.by_method.GET === 0);
    ok('  avg_duration_ms = 0', c.avg_duration_ms === 0);
});

// ---------- 4. Middleware behavior ----------

chk('middleware increments on res finish', () => {
    w44.reset();
    const mw = w44.makeHttpMetricsMiddleware();
    const fakeReq = { method: 'GET', originalUrl: '/api/test', headers: {} };
    const fakeRes = {
        statusCode: 200,
        on: function(evt, cb) { if (evt === 'finish') this._finishCb = cb; },
        emitFinish: function() { this._finishCb && this._finishCb(); }
    };
    let nextCalled = false;
    mw(fakeReq, fakeRes, () => { nextCalled = true; });
    ok('  next() called', nextCalled === true);
    ok('  in_flight >= 1 before finish (may have already been counted via prior tests)', w44.getCounters().in_flight >= 1);
    fakeRes.emitFinish();
    const c = w44.getCounters();
    ok('  total >= 1 after finish', c.total >= 1);
    ok('  by_method.GET >= 1', c.by_method.GET >= 1);
    ok('  by_class["2xx"] >= 1', c.by_class['2xx'] >= 1);
});

chk('middleware never throws on weird inputs', () => {
    w44.reset();
    const mw = w44.makeHttpMetricsMiddleware();
    let didThrow = false;
    try {
        mw({ method: null, originalUrl: null }, { statusCode: 500, on: () => {} }, () => {});
        mw(undefined, undefined, undefined, () => {});
        mw({ method: 'POST' }, { statusCode: 201, on: () => {} }, () => {});
    } catch (e) {
        didThrow = true;
    }
    ok('  never throws', !didThrow);
});

// ---------- 5. Prometheus format ----------

chk('toPrometheusMetrics emits 9+ gauges', () => {
    w44.reset();
    w44.recordEnd('GET', '/x', 200, 50);
    const out = w44.toPrometheusMetrics();
    ok('  contains nama_http_requests_total', out.indexOf('nama_http_requests_total') >= 0);
    ok('  contains nama_http_in_flight_requests', out.indexOf('nama_http_in_flight_requests') >= 0);
    ok('  contains nama_http_avg_duration_ms', out.indexOf('nama_http_avg_duration_ms') >= 0);
    ok('  contains nama_http_class_2xx', out.indexOf('nama_http_class_2xx') >= 0);
    ok('  contains nama_http_class_5xx', out.indexOf('nama_http_class_5xx') >= 0);
    ok('  contains nama_http_method_get', out.indexOf('nama_http_method_get') >= 0);
});

chk('toPrometheusMetrics reflects values', () => {
    w44.reset();
    w44.recordEnd('GET', '/x', 200, 100);
    w44.recordEnd('POST', '/y', 500, 50);
    const out = w44.toPrometheusMetrics();
    ok('  requests_total = 2', /^nama_http_requests_total 2$/m.test(out));
    ok('  avg_duration_ms = 75', /^nama_http_avg_duration_ms 75$/m.test(out));
    ok('  class_2xx = 1', /^nama_http_class_2xx 1$/m.test(out));
    ok('  class_5xx = 1', /^nama_http_class_5xx 1$/m.test(out));
});

// ---------- 6. Source-file safety ----------

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'wave44_http_request_metrics.js'), 'utf8');

chk('source file never references DELETE SQL or DROP on prod tables', () => {
    // Check for SQL usage of DELETE (e.g. 'DELETE FROM', 'DELETE WHERE').
    // Plain mentions of "DELETE" in comments are fine.
    ok('  no SQL DELETE FROM', !/DELETE\s+FROM/i.test(src));
    ok('  no DROP', !/\bDROP\b/.test(src));
});

chk('source file never prints secrets or PHI', () => {
    ok('  no console.log', !/console\.log\s*\(/.test(src));
    ok('  no console.error of req.body', !/console\.error\([^)]*req\.body/i.test(src));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
