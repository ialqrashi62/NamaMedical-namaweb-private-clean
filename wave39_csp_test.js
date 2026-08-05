'use strict';
const fs = require('fs');
const path = require('path');
const w39 = require('./wave39_csp');
const SOURCE_FILE = path.join(__dirname, 'wave39_csp.js');

const tests = [];
let passed = 0;
let failed = 0;
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error('assertion failed' + (msg ? ': ' + msg : '')); }
function assertStrictEqual(a, b, msg) { if (a !== b) throw new Error('assertion failed' + (msg ? ': ' + msg : '') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

test('DEFAULT_WINDOW_HOURS is 24', () => {
    assertStrictEqual(w39.DEFAULT_WINDOW_HOURS, 24);
});

test('toPrometheusMetrics: emits 3 base gauges with 0 values when summary empty', () => {
    const out = w39.toPrometheusMetrics({});
    assert(out.includes('nama_csp_reports_total 0'));
    assert(out.includes('nama_csp_reports_last_24h 0'));
    assert(out.includes('nama_csp_reports_last_1h 0'));
});

test('toPrometheusMetrics: surfaces counts when summary populated', () => {
    const out = w39.toPrometheusMetrics({ total: 42, last24h: 5, last1h: 1 });
    assert(out.includes('nama_csp_reports_total 42'));
    assert(out.includes('nama_csp_reports_last_24h 5'));
    assert(out.includes('nama_csp_reports_last_1h 1'));
});

test('toPrometheusMetrics: tolerates null summary', () => {
    const out = w39.toPrometheusMetrics(null);
    assert(out.includes('nama_csp_reports_total 0'));
});

test('summarizeCspReports: returns zeros when pool is null', async () => {
    const out = await w39.summarizeCspReports(null);
    assertStrictEqual(out.total, 0);
    assertStrictEqual(out.last24h, 0);
    assertStrictEqual(out.last1h, 0);
});

test('summarizeCspReports: tolerates pool errors (returns zeros)', async () => {
    const fakePool = { query: async () => { throw new Error('RLS denied'); } };
    const out = await w39.summarizeCspReports(fakePool);
    assertStrictEqual(out.total, 0);
});

test('summarizeCspReports: aggregates pool results via SQL prefix matching', async () => {
    let calls = 0;
    const fakePool = {
        query: async (sql) => {
            calls++;
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s === 'SELECT COUNT(*)::int AS n FROM csp_reports') return { rows: [{ n: 100 }] };
            if (s.startsWith('SELECT COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - ($1')) return { rows: [{ n: 10 }] };
            if (s.startsWith('SELECT COUNT(*)::int AS n FROM csp_reports WHERE created_at > NOW() - INTERVAL')) return { rows: [{ n: 1 }] };
            if (s.startsWith('SELECT directive,')) return { rows: [{ directive: 'script-src-elem', n: 7 }, { directive: 'default-src', n: 3 }] };
            if (s.startsWith('SELECT tenant_id,')) return { rows: [{ tenant_id: 1, n: 6 }, { tenant_id: 2, n: 4 }] };
            return { rows: [] };
        }
    };
    const out = await w39.summarizeCspReports(fakePool);
    assertStrictEqual(out.total, 100);
    assertStrictEqual(out.last24h, 10);
    assertStrictEqual(out.last1h, 1);
    assertStrictEqual(out.byDirective['script-src-elem'], 7);
    assertStrictEqual(out.byDirective['default-src'], 3);
    assertStrictEqual(out.byTenant['1'], 6);
    assertStrictEqual(out.byTenant['2'], 4);
    assert(calls >= 5, 'should have called all 5 query paths, got ' + calls);
});

test('persistCspReport: inserts a row and returns id', async () => {
    const fakePool = {
        query: async (sql) => {
            if (/INSERT INTO csp_reports/i.test(sql)) {
                return { rows: [{ id: 42, created_at: '2026-08-05T15:00:00Z' }] };
            }
            return { rows: [] };
        }
    };
    const body = { 'document-uri': 'https://example.com/page', 'violated-directive': 'script-src', 'blocked-uri': 'inline' };
    const r = await w39.persistCspReport(fakePool, body, '127.0.0.1', 'Mozilla/5.0', 1);
    assert(!r.error, 'should not error');
    assertStrictEqual(r.row.id, 42);
});

test('persistCspReport: clips document_uri at 200 chars', async () => {
    let captured;
    const fakePool = {
        query: async (sql, params) => {
            if (/INSERT INTO csp_reports/i.test(sql)) {
                captured = params;
                return { rows: [{ id: 1, created_at: 'now' }] };
            }
            return { rows: [] };
        }
    };
    const longUri = 'https://example.com/' + 'a'.repeat(300);
    const body = { 'document-uri': longUri, 'violated-directive': 'script-src' };
    await w39.persistCspReport(fakePool, body, '127.0.0.1', 'ua', 1);
    assert(captured[1].length <= 200, 'document_uri length=' + captured[1].length + ', expected <=200');
});

test('persistCspReport: tolerates non-numeric tenantId by coercing to null', async () => {
    let captured;
    const fakePool = {
        query: async (sql, params) => {
            if (/INSERT INTO csp_reports/i.test(sql)) {
                captured = params;
                return { rows: [{ id: 1, created_at: 'now' }] };
            }
            return { rows: [] };
        }
    };
    await w39.persistCspReport(fakePool, { 'document-uri': 'x' }, '127.0.0.1', 'ua', 'not-a-number');
    assertStrictEqual(captured[0], null, 'non-numeric tenant should coerce to null');
});

test('persistCspReport: surfaces insert failures as error', async () => {
    const fakePool = { query: async () => { throw new Error('permission denied'); } };
    const r = await w39.persistCspReport(fakePool, { 'document-uri': 'x' }, '127.0.0.1', 'ua', 1);
    assert(r.error, 'should surface error');
});

test('source file: present and non-empty', () => {
    assert(fs.existsSync(SOURCE_FILE));
    assert(fs.readFileSync(SOURCE_FILE, 'utf8').length > 1000);
});

test('source file: never embeds a password or KEK phrase', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/(?<!PG)password\s*[:=]/i.test(stripped), 'no literal password');
    assert(!/KEK_PASSPHRASE/i.test(stripped), 'no KEK phrase literal');
});

test('source file: never references DELETE or DROP on prod tables', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/\bDELETE\s+FROM\b/i.test(stripped));
    assert(!/\bDROP\s+TABLE\b/i.test(stripped));
});

(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            console.log('[PASS] ' + t.name);
            passed++;
        } catch (e) {
            console.log('[FAIL] ' + t.name + ': ' + e.message);
            failed++;
        }
    }
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed > 0 ? 1 : 0);
})();