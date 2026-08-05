// wave43_error_handler_test.js — 13 tests

'use strict';

const w43 = require('./wave43_error_handler');

let passed = 0, failed = 0;
function ok(label, cond, extra) {
    if (cond) { passed += 1; console.log('[PASS]', label); }
    else { failed += 1; console.log('[FAIL]', label, extra || ''); }
}
function chk(label, fn) {
    try { fn(); } catch (e) { ok(label, false, e.message); }
}

// ---------- 1. Counter behavior ----------

chk('inc() total increments per call', () => {
    w43.reset();
    w43.inc('parse', 400, '/api/x');
    w43.inc('parse', 400, '/api/y');
    w43.inc('server', 500, '/api/z');
    const c = w43.getCounters();
    ok('  total = 3', c.total === 3);
    ok('  parse_errors = 2', c.parse_errors === 2);
    ok('  server_errors = 1', c.server_errors === 1);
});

chk('inc() by_status tracks status breakdown', () => {
    w43.reset();
    w43.inc('parse', 400, '/api/x');
    w43.inc('parse', 400, '/api/y');
    w43.inc('server', 500, '/api/z');
    const c = w43.getCounters();
    ok('  by_status["400"] = 2', c.by_status['400'] === 2);
    ok('  by_status["500"] = 1', c.by_status['500'] === 1);
});

chk('inc() by_path caps at 100 entries', () => {
    w43.reset();
    for (let i = 0; i < 105; i++) w43.inc('server', 500, '/api/path' + i);
    const c = w43.getCounters();
    ok('  by_path count <= 100', Object.keys(c.by_path).length <= 100);
});

// ---------- 2. Classification ----------

chk('isRlsError detects row-level security', () => {
    ok('  true (with dash)', w43.isRlsError('row-level security violation'));
    ok('  true (no dash)', w43.isRlsError('RLS: row level security'));
    ok('  false (unrelated)', !w43.isRlsError('connection refused'));
});

chk('isParseError detects body-parser errors', () => {
    ok('  true (entity.parse.failed)', w43.isParseError({ type: 'entity.parse.failed', message: 'bad' }));
    ok('  true (JSON parse in message)', w43.isParseError({ message: 'Unexpected token' }));
    ok('  false (other)', !w43.isParseError({ message: 'TypeError: undefined' }));
    ok('  false (null)', !w43.isParseError(null));
});

// ---------- 3. reset() ----------

chk('reset() clears all counters', () => {
    w43.inc('server', 500, '/api/x');
    w43.reset();
    const c = w43.getCounters();
    ok('  total = 0', c.total === 0);
    ok('  server_errors = 0', c.server_errors === 0);
    ok('  by_status = {}', Object.keys(c.by_status).length === 0);
});

// ---------- 4. Middleware behavior ----------

chk('middleware classifies parse error', () => {
    w43.reset();
    const mw = w43.makeErrorMiddleware();
    const fakeRes = { headersSent: false, statusCode: 200, status: function(s) { this.statusCode = s; return this; }, json: function(o) { this.body = o; return this; } };
    mw({ type: 'entity.parse.failed', message: 'Unexpected token x in JSON at position 5' }, { originalUrl: '/api/test', ip: '127.0.0.1' }, fakeRes, () => {});
    const c = w43.getCounters();
    ok('  parse_errors = 1', c.parse_errors === 1);
    ok('  last_message contains Unexpected', /Unexpected/.test(c.last_message));
});

chk('middleware classifies RLS error', () => {
    w43.reset();
    const mw = w43.makeErrorMiddleware();
    const fakeRes = { headersSent: false, statusCode: 200, status: function(s) { this.statusCode = s; return this; }, json: function(o) { this.body = o; return this; } };
    mw({ message: 'new row violates row-level security policy for table "x"' }, { originalUrl: '/api/x', ip: '127.0.0.1' }, fakeRes, () => {});
    const c = w43.getCounters();
    ok('  rls_errors = 1', c.rls_errors === 1);
});

chk('middleware classifies generic 500 as server error', () => {
    w43.reset();
    const mw = w43.makeErrorMiddleware();
    const fakeRes = { headersSent: false, statusCode: 500, status: function(s) { this.statusCode = s; return this; }, json: function(o) { this.body = o; return this; } };
    mw({ message: 'database connection lost' }, { originalUrl: '/api/x', ip: '127.0.0.1' }, fakeRes, () => {});
    const c = w43.getCounters();
    ok('  server_errors = 1', c.server_errors === 1);
});

chk('middleware does not throw on weird inputs', () => {
    w43.reset();
    const mw = w43.makeErrorMiddleware();
    const fakeRes = { headersSent: false, statusCode: 200, status: function(s) { this.statusCode = s; return this; }, json: function(o) { this.body = o; return this; } };
    let didThrow = false;
    try {
        mw(null, { originalUrl: '/api/x' }, fakeRes, () => {});
        mw(undefined, undefined, undefined, () => {});
        mw({}, {}, {}, () => {});
    } catch (e) {
        didThrow = true;
    }
    ok('  never throws', !didThrow);
});

chk('not_found middleware increments counter', () => {
    w43.reset();
    const mw = w43.makeNotFoundMiddleware();
    const fakeReq = { originalUrl: '/api/nonexistent' };
    let nextCalled = false;
    mw(fakeReq, {}, () => { nextCalled = true; });
    const c = w43.getCounters();
    ok('  not_found = 1', c.not_found === 1);
    ok('  next() called', nextCalled === true);
});

// ---------- 5. Prometheus format ----------

chk('toPrometheusMetrics emits 7 expected gauges', () => {
    const out = w43.toPrometheusMetrics();
    ok('  contains nama_errors_total', out.indexOf('nama_errors_total') >= 0);
    ok('  contains nama_errors_parse_errors', out.indexOf('nama_errors_parse_errors') >= 0);
    ok('  contains nama_errors_rls_errors', out.indexOf('nama_errors_rls_errors') >= 0);
    ok('  contains nama_errors_not_found', out.indexOf('nama_errors_not_found') >= 0);
    ok('  contains nama_errors_server_errors', out.indexOf('nama_errors_server_errors') >= 0);
    ok('  contains nama_errors_bad_request', out.indexOf('nama_errors_bad_request') >= 0);
});

chk('toPrometheusMetrics reflects counter values', () => {
    w43.reset();
    w43.inc('parse', 400);
    w43.inc('parse', 400);
    w43.inc('server', 500);
    const out = w43.toPrometheusMetrics();
    ok('  parse_errors = 2', /^nama_errors_parse_errors 2$/m.test(out));
    ok('  server_errors = 1', /^nama_errors_server_errors 1$/m.test(out));
    ok('  total = 3', /^nama_errors_total 3$/m.test(out));
});

// ---------- 6. Source-file safety ----------

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'wave43_error_handler.js'), 'utf8');

chk('source file never references DELETE or DROP on prod tables', () => {
    ok('  no DELETE', !/\bDELETE\b/.test(src));
    ok('  no DROP', !/\bDROP\b/.test(src));
});

chk('source file never prints secrets or PHI', () => {
    ok('  no console.log', !/console\.log\s*\(/.test(src));
    ok('  no console.error of req.body', !/console\.error\([^)]*req\.body/i.test(src));
    ok('  no console.error of headers', !/console\.error\([^)]*headers/i.test(src));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
