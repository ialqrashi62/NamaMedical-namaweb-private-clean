// wave40_audit_resilience_test.js — 14 tests
//
// Tests are split into:
//   1. Counter behavior (6 tests)
//   2. RLS error detection (3 tests)
//   3. Prometheus output format (3 tests)
//   4. Safety rails / source-file checks (2 tests)

'use strict';

const w40 = require('./wave40_audit_resilience');

let passed = 0, failed = 0;

function ok(label, cond, extra) {
    if (cond) {
        passed += 1;
        console.log('[PASS]', label);
    } else {
        failed += 1;
        console.log('[FAIL]', label, extra || '');
    }
}

function chk(label, fn) {
    try { fn(); } catch (e) { ok(label, false, e.message); }
}

// ---------- 1. Counter behavior ----------

chk('inc() branch_tenant increments correctly', () => {
    w40.reset();
    w40.inc('audit_call_branch_tenant');
    w40.inc('audit_call_branch_tenant');
    w40.inc('audit_call_branch_tenant');
    const c = w40.getCounters();
    ok('  branch_tenant === 3', c.branch_tenant === 3);
    ok('  calls_total === 3', c.calls_total === 3);
});

chk('inc() branch_anon increments correctly', () => {
    w40.reset();
    w40.inc('audit_call_branch_anon');
    w40.inc('audit_call_branch_anon');
    const c = w40.getCounters();
    ok('  branch_anon === 2', c.branch_anon === 2);
    ok('  calls_total === 2', c.calls_total === 2);
});

chk('inc() branch_nocontext increments correctly', () => {
    w40.reset();
    w40.inc('audit_call_branch_nocontext');
    const c = w40.getCounters();
    ok('  branch_nocontext === 1', c.branch_nocontext === 1);
});

chk('inc() error_rls increments correctly', () => {
    w40.reset();
    w40.inc('audit_error_rls');
    w40.inc('audit_error_rls');
    const c = w40.getCounters();
    ok('  error_rls === 2', c.error_rls === 2);
});

chk('inc() unknown key is silent (fail-safe)', () => {
    w40.reset();
    w40.inc('unknown_key_xyz'); // must not throw
    const c = w40.getCounters();
    ok('  calls_total === 0 (no spurious increment)', c.calls_total === 0);
    ok('  branch_tenant === 0', c.branch_tenant === 0);
});

chk('reset() clears all counters', () => {
    w40.inc('audit_call_branch_tenant');
    w40.inc('audit_error_rls');
    w40.reset();
    const c = w40.getCounters();
    ok('  calls_total === 0', c.calls_total === 0);
    ok('  branch_tenant === 0', c.branch_tenant === 0);
    ok('  error_rls === 0', c.error_rls === 0);
    ok('  started_at is set', typeof c.since === 'string' && c.since.length > 0);
});

// ---------- 2. RLS error detection ----------

chk('isRlsError() matches row-level security (with dash)', () => {
    ok('  true', w40.isRlsError('new row violates row-level security policy for table "audit_trail"'));
});

chk('isRlsError() matches row level security (no dash)', () => {
    ok('  true', w40.isRlsError('RLS: row level security violation'));
});

chk('isRlsError() rejects unrelated errors', () => {
    ok('  false for connection refused', !w40.isRlsError('Connection refused'));
    ok('  false for syntax error', !w40.isRlsError('syntax error at or near INSERT'));
    ok('  false for empty', !w40.isRlsError(''));
    ok('  false for null', !w40.isRlsError(null));
});

chk('recordError() classifies RLS correctly', () => {
    w40.reset();
    w40.recordError('Audit log error: new row violates row-level security policy for table "audit_trail"');
    const c = w40.getCounters();
    ok('  error_rls === 1', c.error_rls === 1);
    ok('  last_error_message contains "row-level"', /row-level/.test(c.last_error_message));
    ok('  last_error_at is set', typeof c.last_error_at === 'string');
});

chk('recordError() classifies non-RLS as error_other', () => {
    w40.reset();
    w40.recordError('connection terminated unexpectedly');
    const c = w40.getCounters();
    ok('  error_other === 1', c.error_other === 1);
    ok('  error_rls === 0', c.error_rls === 0);
});

chk('recordError() truncates message to 200 chars', () => {
    w40.reset();
    const longMsg = 'x'.repeat(500);
    w40.recordError(longMsg);
    const c = w40.getCounters();
    ok('  last_error_message length <= 200', c.last_error_message.length <= 200);
});

// ---------- 3. Prometheus output ----------

chk('toPrometheusMetrics() emits 7 expected gauges', () => {
    w40.reset();
    w40.inc('audit_call_branch_tenant');
    w40.inc('audit_call_branch_anon');
    w40.inc('audit_call_branch_nocontext');
    w40.inc('audit_error_rls');
    const out = w40.toPrometheusMetrics();
    ok('  contains nama_audit_log_calls_total', out.indexOf('nama_audit_log_calls_total') >= 0);
    ok('  contains nama_audit_log_branch_tenant', out.indexOf('nama_audit_log_branch_tenant') >= 0);
    ok('  contains nama_audit_log_branch_anon', out.indexOf('nama_audit_log_branch_anon') >= 0);
    ok('  contains nama_audit_log_branch_nocontext', out.indexOf('nama_audit_log_branch_nocontext') >= 0);
    ok('  contains nama_audit_log_error_rls', out.indexOf('nama_audit_log_error_rls') >= 0);
    ok('  contains nama_audit_log_error_other', out.indexOf('nama_audit_log_error_other') >= 0);
});

chk('toPrometheusMetrics() reflects counter values', () => {
    w40.reset();
    w40.inc('audit_call_branch_tenant');
    w40.inc('audit_call_branch_tenant');
    const out = w40.toPrometheusMetrics();
    ok('  nama_audit_log_calls_total 2', /^nama_audit_log_calls_total 2$/m.test(out));
    ok('  nama_audit_log_branch_tenant 2', /^nama_audit_log_branch_tenant 2$/m.test(out));
});

chk('toPrometheusMetrics() includes HELP + TYPE comments', () => {
    w40.reset();
    const out = w40.toPrometheusMetrics();
    ok('  has HELP for calls_total', /# HELP nama_audit_log_calls_total/.test(out));
    ok('  has TYPE for calls_total', /# TYPE nama_audit_log_calls_total gauge/.test(out));
});

// ---------- 4. Safety rails / source-file checks ----------

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'wave40_audit_resilience.js'), 'utf8');

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
