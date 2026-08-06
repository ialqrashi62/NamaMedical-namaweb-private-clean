/**
 * wave46_metrics_aggregator_test.js -- Tests for Wave 46 aggregator
 *
 * Pattern: 5-section test file (mini-framework inside the project).
 *   1. Sub-module list
 *   2. fetchAllSummaries (parallel + degraded)
 *   3. buildPrometheusOutput (concat + per-module isolation)
 *   4. countGauges + hasMinimalOutput (diagnostics)
 *   5. aggregate() with 5s TTL cache
 *   6. Safety rails (no secrets, no SQL, no console errors)
 *   7. Structural / public API
 */

'use strict';

const w46 = require('./wave46_metrics_aggregator');

let pass = 0, fail = 0;
function ok(msg, cond) {
    if (cond) { pass++; }
    else { fail++; console.error(`[FAIL]   ${msg}`); }
}
function chk(name, fn) {
    try { fn(); console.log(`[PASS]   ${name}`); }
    catch (e) { fail++; console.error(`[FAIL]   ${name} threw: ${e.message}`); }
}

// ---------- 1. Sub-module list ----------

chk('listSubModules returns the 4 expected modules', () => {
    const subs = w46.listSubModules();
    ok('  length = 4', subs.length === 4);
    ok('  contains csp', subs.indexOf('csp') !== -1);
    ok('  contains audit', subs.indexOf('audit') !== -1);
    ok('  contains http', subs.indexOf('http') !== -1);
    ok('  contains db_pool', subs.indexOf('db_pool') !== -1);
});

chk('listSubModules returns a fresh array (not a reference to internals)', () => {
    const a = w46.listSubModules();
    a.push('rogue');
    const b = w46.listSubModules();
    ok('  subsequent call returns clean array', b.length === 4);
});

chk('SUB_MODULES exported constant matches listSubModules', () => {
    ok('  same length', w46.SUB_MODULES.length === w46.listSubModules().length);
});

chk('TTL_MS is 5000 (matches wave45)', () => {
    ok('  TTL_MS = 5000', w46.TTL_MS === 5000);
});

// ---------- 2. fetchAllSummaries ----------

chk('fetchAllSummaries works without a pool (csp + db_pool are null)', async () => {
    const r = await w46.fetchAllSummaries({});
    ok('  captured_at set', typeof r.captured_at === 'string');
    ok('  csp = null (no pool)', r.csp === null);
    ok('  dbPool = null (no pool)', r.dbPool === null);
    ok('  audit returned (sync module)', r.audit !== null);
    ok('  http returned (sync module)', r.http !== null);
});

chk('fetchAllSummaries tolerates a fake pool for csp + db_pool', async () => {
    const fakePool = {
        query: async () => ({ rows: [{ cnt: 0 }] }),
        totalCount: 4, idleCount: 2, waitingCount: 0,
        options: { max: 20 }
    };
    const r = await w46.fetchAllSummaries({ pool: fakePool });
    ok('  csp != null with fake pool', r.csp !== null);
    ok('  dbPool != null with fake pool', r.dbPool !== null);
    ok('  dbPool.total = 4', r.dbPool && r.dbPool.total === 4);
    ok('  errors empty', Array.isArray(r.errors) && r.errors.length === 0);
});

chk('fetchAllSummaries isolates failures (one bad module does not block others)', async () => {
    // Inject a broken pool that throws on query — wave39 will swallow internally
    // and return an empty summary. The aggregator should still return all four
    // sub-modules, and never throw.
    const brokenPool = {
        query: async () => { throw new Error('synthetic pool failure'); },
        totalCount: 5, idleCount: 5, waitingCount: 0,
        options: { max: 20 }
    };
    let didThrow = false;
    let r;
    try { r = await w46.fetchAllSummaries({ pool: brokenPool }); }
    catch (e) { didThrow = true; }
    ok('  never throws', !didThrow);
    ok('  audit + http + dbPool all returned', r.audit !== null && r.http !== null && r.dbPool !== null);
    ok('  csp returns empty summary (wave39 swallows)', r.csp && r.csp.total === 0);
});

chk('fetchAllSummaries never throws (returns object even with no deps)', async () => {
    let didThrow = false;
    let result;
    try { result = await w46.fetchAllSummaries(); }
    catch (e) { didThrow = true; }
    ok('  did not throw', !didThrow);
    ok('  result is object', result && typeof result === 'object');
});

// ---------- 3. buildPrometheusOutput ----------

chk('buildPrometheusOutput concatenates all 4 sub-modules', () => {
    const summaries = {
        csp: { total: 5, last24h: 5, last1h: 1, byDirective: {}, byTenant: {} },
        audit: { calls_total: 100, branch_tenant: 95, branch_anon: 3, branch_nocontext: 2, error_rls: 0, error_other: 0 },
        http: { total: 200, in_flight: 0, by_method: {}, by_class: { '1xx': 0, '2xx': 200, '3xx': 0, '4xx': 0, '5xx': 0 }, by_status: {}, by_path: {}, avg_duration_ms: 0 },
        dbPool: { total: 4, idle: 3, waiting: 0, max: 20, utilization: 0.05 },
    };
    const out = w46.buildPrometheusOutput(summaries);
    ok('  output is a string', typeof out === 'string');
    ok('  contains CSP metric', out.indexOf('nama_csp_reports_total') !== -1);
    ok('  contains audit metric', out.indexOf('nama_audit_log_calls_total') !== -1);
    ok('  contains HTTP metric', out.indexOf('nama_http_requests_total') !== -1);
    ok('  contains db_pool metric', out.indexOf('nama_db_pool_total') !== -1);
    ok('  contains self-metric', out.indexOf('nama_metrics_aggregator_modules_ok') !== -1);
});

chk('buildPrometheusOutput skips missing summaries gracefully', () => {
    const out = w46.buildPrometheusOutput({ audit: { calls_total: 50, branch_tenant: 45, branch_anon: 0, branch_nocontext: 0, error_rls: 0, error_other: 0 } });
    ok('  still produces output', typeof out === 'string' && out.length > 0);
    ok('  contains audit metric', out.indexOf('nama_audit_log_calls_total') !== -1);
    ok('  does not contain CSP (skipped)', out.indexOf('nama_csp_reports_total') === -1);
});

chk('buildPrometheusOutput never throws on weird input', () => {
    let didThrow = false;
    try {
        w46.buildPrometheusOutput(null);
        w46.buildPrometheusOutput(undefined);
        w46.buildPrometheusOutput({});
        w46.buildPrometheusOutput({ csp: null, audit: null, http: null, dbPool: null });
    } catch (e) { didThrow = true; }
    ok('  never throws', !didThrow);
});

chk('buildPrometheusOutput self-metric reflects which modules succeeded', () => {
    const all4 = w46.buildPrometheusOutput({
        csp: { total: 1, last24h: 1, last1h: 0, byDirective: {}, byTenant: {} },
        audit: { calls_total: 1, branch_tenant: 1, branch_anon: 0, branch_nocontext: 0, error_rls: 0, error_other: 0 },
        http: { total: 1, in_flight: 0, by_method: {}, by_class: { '1xx': 0, '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 0 }, by_status: {}, by_path: {}, avg_duration_ms: 0 },
        dbPool: { total: 1, idle: 1, waiting: 0, max: 10, utilization: 0 },
    });
    ok('  modules_ok = 4', /nama_metrics_aggregator_modules_ok 4\b/.test(all4));
    ok('  modules_total = 4', /nama_metrics_aggregator_modules_total 4\b/.test(all4));

    const only2 = w46.buildPrometheusOutput({
        csp: null,
        audit: { calls_total: 1, branch_tenant: 1, branch_anon: 0, branch_nocontext: 0, error_rls: 0, error_other: 0 },
        http: { total: 1, in_flight: 0, by_method: {}, by_status: {}, by_path: {}, avg_duration_ms: 0 },
        dbPool: null,
    });
    ok('  modules_ok = 2', /nama_metrics_aggregator_modules_ok 2\b/.test(only2));
});

// ---------- 4. Diagnostics ----------

chk('countGauges counts TYPE declarations', () => {
    const fake = [
        '# HELP a Some gauge',
        '# TYPE a gauge',
        'a 1',
        '# HELP b Other',
        '# TYPE b gauge',
        'b 2',
    ].join('\n');
    ok('  countGauges = 2', w46.countGauges(fake) === 2);
});

chk('countGauges only counts gauge + counter (not summary/histogram)', () => {
    const fake = '# TYPE foo gauge\n# TYPE bar counter\n# TYPE baz summary\n# TYPE qux histogram';
    ok('  count = 2 (only gauge + counter)', w46.countGauges(fake) === 2);
});

chk('countGauges returns 0 for null/empty', () => {
    ok('  null → 0', w46.countGauges(null) === 0);
    ok('  empty → 0', w46.countGauges('') === 0);
});

chk('hasMinimalOutput is true only when all 4 anchor metrics are present', () => {
    const full = w46.buildPrometheusOutput({
        csp: { total: 1, last24h: 1, last1h: 0, byDirective: {}, byTenant: {} },
        audit: { calls_total: 1, branch_tenant: 1, branch_anon: 0, branch_nocontext: 0, error_rls: 0, error_other: 0 },
        http: { total: 1, in_flight: 0, by_method: {}, by_class: { '1xx': 0, '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 0 }, by_status: {}, by_path: {}, avg_duration_ms: 0 },
        dbPool: { total: 1, idle: 1, waiting: 0, max: 10, utilization: 0 },
    });
    ok('  full output is minimal', w46.hasMinimalOutput(full) === true);
    ok('  empty is not minimal', w46.hasMinimalOutput('') === false);
    ok('  null is not minimal', w46.hasMinimalOutput(null) === false);
});

// ---------- 5. aggregate() with TTL cache ----------

chk('aggregate caches for 5s and rebuilds after reset', async () => {
    w46.reset();
    // Use a fake pool that DOES get hit so we can verify the cache.
    // wave39's query WILL run against this fake pool (returning empty rows).
    let calls = 0;
    const fakePool = {
        query: async () => { calls++; return { rows: [{ n: 0, directive: null, tenant_id: null }] }; },
        totalCount: 5, idleCount: 5, waitingCount: 0,
        options: { max: 20 }
    };
    const a = await w46.aggregate({ pool: fakePool });
    const callsAfterFirst = calls;
    const b = await w46.aggregate({ pool: fakePool });
    const c = await w46.aggregate({ pool: fakePool });
    ok('  same string returned (cached)', a === b && b === c);
    ok('  pool only queried once (cached)', calls === callsAfterFirst && calls >= 1);
    w46.reset();
    const d = await w46.aggregate({ pool: fakePool });
    ok('  rebuilds after reset', typeof d === 'string' && d.length > 0);
    ok('  pool queried again after reset', calls > callsAfterFirst);
});

chk('aggregate returns the full Prometheus text format', async () => {
    w46.reset();
    const fakePool = {
        query: async () => ({ rows: [{ n: 0, directive: null, tenant_id: null }] }),
        totalCount: 5, idleCount: 5, waitingCount: 0,
        options: { max: 20 }
    };
    const out = await w46.aggregate({ pool: fakePool });
    ok('  starts with # comment or metric line', /^#|^\w/.test(out));
    ok('  ends with newline', out.endsWith('\n'));
    ok('  contains CSP header', out.indexOf('nama_csp_reports_total') !== -1);
    ok('  contains audit header', out.indexOf('nama_audit_log_calls_total') !== -1);
    ok('  contains HTTP header', out.indexOf('nama_http_requests_total') !== -1);
    ok('  contains db_pool header', out.indexOf('nama_db_pool_total') !== -1);
});

// ---------- 6. Safety rails ----------

const srcPath = require('path').join(__dirname, 'wave46_metrics_aggregator.js');
const fs = require('fs');
const src = fs.readFileSync(srcPath, 'utf8');

chk('source has no SQL DELETE FROM', () => {
    ok('  safe', !/\bDELETE\s+FROM\b/i.test(src));
});

chk('source has no SQL DROP', () => {
    ok('  safe', !/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(src));
});

chk('source has no console.error of req.body', () => {
    ok('  safe', !/console\.error\([^)]*req\.body/.test(src));
});

chk('source has no console.log of secrets/tokens', () => {
    ok('  safe', !/console\.log\([^)]*(password|token|secret|api[_-]?key)/i.test(src));
});

chk('source never assigns to global pool or process', () => {
    ok('  no global. assignment', !/global\.\w+\s*=/.test(src));
    ok('  no process.env assignment', !/process\.env\.\w+\s*=/.test(src));
});

// ---------- 7. Structural / public API ----------

chk('public API surface is complete', () => {
    const expected = [
        'fetchAllSummaries',
        'buildPrometheusOutput',
        'aggregate',
        'listSubModules',
        'countGauges',
        'hasMinimalOutput',
        'reset',
        'TTL_MS',
        'SUB_MODULES',
    ];
    for (const name of expected) {
        ok('  has ' + name, typeof w46[name] !== 'undefined');
    }
});

chk('fetchAllSummaries returns Promise', () => {
    ok('  returns a promise', w46.fetchAllSummaries({}) instanceof Promise);
});

chk('aggregate returns Promise', () => {
    w46.reset();
    ok('  returns a promise', w46.aggregate({}) instanceof Promise);
});

// ---------- Summary ----------

(async () => {
    // Allow any pending microtasks (some chk()'s above are async but not awaited).
    await new Promise((r) => setImmediate(r));
    console.log('');
    console.log(`Summary: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
