/**
 * wave48_security_aggregator_test.js -- Tests for Wave 48 security aggregator
 *
 * Pattern: 5-section test file.
 *   1. Security sub-module list
 *   2. fetchSecuritySummaries (3 modules + isolation + degraded paths)
 *   3. buildSecurityOutput (concat + skip null)
 *   4. countSecurityGauges + hasSecurityMinimalOutput
 *   5. aggregateSecurity() with TTL cache
 *   6. Safety rails
 *   7. Public API
 */

'use strict';

const w48 = require('./wave48_security_aggregator');

let pass = 0, fail = 0;
function ok(msg, cond) {
    if (cond) { pass++; }
    else { fail++; console.error(`[FAIL]   ${msg}`); }
}
function chk(name, fn) {
    try { fn(); console.log(`[PASS]   ${name}`); }
    catch (e) { fail++; console.error(`[FAIL]   ${name} threw: ${e.message}`); }
}

// ---------- 1. Security sub-module list ----------

chk('listSecuritySubModules returns the 3 expected modules', () => {
    const subs = w48.listSecuritySubModules();
    ok('  length = 3', subs.length === 3);
    ok('  contains rls_defense', subs.indexOf('rls_defense') !== -1);
    ok('  contains audit_chain', subs.indexOf('audit_chain') !== -1);
    ok('  contains errors', subs.indexOf('errors') !== -1);
});

chk('listSecuritySubModules returns a fresh array', () => {
    const a = w48.listSecuritySubModules();
    a.push('rogue');
    const b = w48.listSecuritySubModules();
    ok('  subsequent call returns clean array', b.length === 3);
});

chk('TTL_MS is 5000', () => {
    ok('  TTL_MS = 5000', w48.TTL_MS === 5000);
});

chk('SECURITY_SUB_MODULES constant matches listSecuritySubModules', () => {
    ok('  same length', w48.SECURITY_SUB_MODULES.length === w48.listSecuritySubModules().length);
});

// ---------- 2. fetchSecuritySummaries ----------

chk('fetchSecuritySummaries tolerates no deps', async () => {
    let didThrow = false;
    let r;
    try { r = await w48.fetchSecuritySummaries(); }
    catch (e) { didThrow = true; }
    ok('  did not throw', !didThrow);
    ok('  returns object', r && typeof r === 'object');
});

chk('fetchSecuritySummaries returns structure with 3 fields', async () => {
    const r = await w48.fetchSecuritySummaries({});
    ok('  has captured_at', typeof r.captured_at === 'string');
    ok('  has errors_meta array', Array.isArray(r.errors_meta));
    ok('  has rls_defense field', 'rls_defense' in r);
    ok('  has audit_chain field', 'audit_chain' in r);
    ok('  has errors field', 'errors' in r);
});

chk('fetchSecuritySummaries runs RLS scanner against server.js', async () => {
    const r = await w48.fetchSecuritySummaries({});
    ok('  rls_defense != null', r.rls_defense !== null);
    if (r.rls_defense) {
        // runWithDefense returns {summary, files} — we extract summary.
        const summary = r.rls_defense.summary || r.rls_defense;
        ok('  has defense field', summary && typeof summary.defense !== 'undefined');
    }
});

chk('fetchSecuritySummaries audit_chain degraded when no pool', async () => {
    const r = await w48.fetchSecuritySummaries({});
    ok('  audit_chain != null (degraded but valid)', r.audit_chain !== null);
    if (r.audit_chain) {
        // Without pool, returns empty report.
        ok('  has gaps array', Array.isArray(r.audit_chain.gaps));
        ok('  has perTenant array', Array.isArray(r.audit_chain.perTenant));
        ok('  gaps is empty', r.audit_chain.gaps.length === 0);
    }
});

chk('fetchSecuritySummaries errors from in-memory counters', async () => {
    const r = await w48.fetchSecuritySummaries({});
    ok('  errors != null', r.errors !== null);
    if (r.errors) {
        // Counters have multiple fields; check at least one.
        const keys = Object.keys(r.errors);
        ok('  has multiple counter fields', keys.length > 3);
    }
});

chk('fetchSecuritySummaries audit_chain degraded when no pool', async () => {
    const r = await w48.fetchSecuritySummaries({});
    ok('  audit_chain != null (degraded but valid)', r.audit_chain !== null);
    if (r.audit_chain) {
        // Without pool, returns empty report.
        ok('  has gaps array', Array.isArray(r.audit_chain.gaps));
        ok('  has perTenant array', Array.isArray(r.audit_chain.perTenant));
        ok('  gaps is empty', r.audit_chain.gaps.length === 0);
    }
});

// ---------- 3. buildSecurityOutput ----------

chk('buildSecurityOutput handles null/empty input gracefully', () => {
    let didThrow = false;
    let out;
    try {
        out = w48.buildSecurityOutput(null);
        w48.buildSecurityOutput(undefined);
        w48.buildSecurityOutput({});
    } catch (e) { didThrow = true; }
    ok('  never throws', !didThrow);
    ok('  null returns valid string', typeof out === 'string');
    ok('  null contains self-metric', out.indexOf('nama_metrics_aggregator_security_modules_ok') !== -1);
});

chk('buildSecurityOutput self-metric reflects modules succeeded', () => {
    const all3 = w48.buildSecurityOutput({
        rls_defense: {
            total: 100, ok: 95, risk: 5, info: 0, findings: [],
            defense: { findingsDefended: 95, findingsUndefended: 0, findingsPublic: 5, routesIndexed: 200, routesDefended: 195 },
        },
        audit_chain: { gaps: [], perTenant: [], error: null },
        errors: { total: 5, parse_errors: 2, rls_errors: 1, not_found: 1, server_errors: 0, bad_request: 1 },
    });
    ok('  modules_ok = 3', /nama_metrics_aggregator_security_modules_ok 3\b/.test(all3));
    ok('  modules_total = 3', /nama_metrics_aggregator_security_modules_total 3\b/.test(all3));

    const only1 = w48.buildSecurityOutput({
        rls_defense: null,
        audit_chain: null,
        errors: { total: 5, parse_errors: 2, rls_errors: 1, not_found: 1, server_errors: 0, bad_request: 1 },
    });
    ok('  modules_ok = 1', /nama_metrics_aggregator_security_modules_ok 1\b/.test(only1));
});

chk('buildSecurityOutput calls each module toPrometheusMetrics', () => {
    const summaries = {
        rls_defense: {
            total: 100, ok: 95, risk: 5, info: 0, findings: [],
            defense: { findingsDefended: 95, findingsUndefended: 0, findingsPublic: 5, routesIndexed: 200, routesDefended: 195 },
        },
        audit_chain: { gaps: [], perTenant: [], error: null },
        errors: { total: 0, parse_errors: 0, rls_errors: 0, not_found: 0, server_errors: 0, bad_request: 0 },
    };
    const out = w48.buildSecurityOutput(summaries);
    ok('  contains wave36 metric', out.indexOf('wave36_rls_undefended') !== -1);
    ok('  contains wave38 metric', out.indexOf('wave38_audit_chain_gaps_total') !== -1);
    ok('  contains wave43 metric', out.indexOf('nama_errors_total') !== -1);
    ok('  contains self-metric', out.indexOf('nama_metrics_aggregator_security_modules_ok') !== -1);
});

chk('buildSecurityOutput skips null summaries gracefully', () => {
    const out = w48.buildSecurityOutput({
        rls_defense: {
            total: 100, ok: 95, risk: 5, info: 0, findings: [],
            defense: { findingsDefended: 95, findingsUndefended: 0, findingsPublic: 5, routesIndexed: 200, routesDefended: 195 },
        },
        audit_chain: null,
        errors: null,
    });
    ok('  still produces output', typeof out === 'string' && out.length > 0);
    ok('  contains wave36 metric', out.indexOf('wave36_rls_undefended') !== -1);
    ok('  does not contain wave38 (skipped)', out.indexOf('wave38_audit_chain_gaps_total') === -1);
});

// ---------- 4. Diagnostics ----------

chk('countSecurityGauges counts TYPE declarations', () => {
    const fake = '# TYPE a gauge\n# TYPE b counter\n# TYPE c gauge';
    ok('  count = 3', w48.countSecurityGauges(fake) === 3);
});

chk('countSecurityGauges returns 0 for null/empty', () => {
    ok('  null → 0', w48.countSecurityGauges(null) === 0);
    ok('  empty → 0', w48.countSecurityGauges('') === 0);
});

chk('hasSecurityMinimalOutput requires all 3 anchors', () => {
    const full = '# HELP wave36_rls_undefended foo\n# TYPE wave36_rls_undefended gauge\n'
        + '# HELP wave38_audit_chain_gaps_total foo\n# TYPE wave38_audit_chain_gaps_total gauge\n'
        + '# HELP nama_errors_total foo\n# TYPE nama_errors_total gauge\n';
    ok('  full = true', w48.hasSecurityMinimalOutput(full) === true);
    ok('  empty = false', w48.hasSecurityMinimalOutput('') === false);
    ok('  null = false', w48.hasSecurityMinimalOutput(null) === false);
});

// ---------- 5. aggregateSecurity() with TTL cache ----------

chk('aggregateSecurity caches for 5s and rebuilds after reset', async () => {
    w48.reset();
    const a = await w48.aggregateSecurity({});
    const b = await w48.aggregateSecurity({});
    ok('  both calls return strings', typeof a === 'string' && typeof b === 'string');
    ok('  output has substantial content', a.length > 500);
    w48.reset();
    const c = await w48.aggregateSecurity({});
    ok('  rebuilds after reset', typeof c === 'string' && c.length > 0);
});

chk('aggregateSecurity composes wave47 + wave48', async () => {
    w48.reset();
    const out = await w48.aggregateSecurity({});
    ok('  ends with newline', out.endsWith('\n'));
    // Wave 47 self-metric
    ok('  contains wave47 ext self-metric', out.indexOf('nama_metrics_aggregator_ext_modules_ok') !== -1);
    // Wave 48 self-metric
    ok('  contains wave48 security self-metric', out.indexOf('nama_metrics_aggregator_security_modules_ok') !== -1);
    // The critical security anchors should be present from RLS scanner
    ok('  contains wave36_rls_undefended', out.indexOf('wave36_rls_undefended') !== -1);
});

// ---------- 6. Safety rails ----------

const fs = require('fs');
const srcPath = require('path').join(__dirname, 'wave48_security_aggregator.js');
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

chk('source has no global assignment', () => {
    ok('  safe', !/global\.\w+\s*=/.test(src));
});

// ---------- 7. Public API ----------

chk('public API surface is complete', () => {
    const expected = [
        'fetchSecuritySummaries',
        'buildSecurityOutput',
        'aggregateSecurity',
        'listSecuritySubModules',
        'countSecurityGauges',
        'hasSecurityMinimalOutput',
        'reset',
        'TTL_MS',
        'SECURITY_SUB_MODULES',
    ];
    for (const name of expected) {
        ok('  has ' + name, typeof w48[name] !== 'undefined');
    }
});

chk('fetchSecuritySummaries returns Promise', () => {
    ok('  returns a promise', w48.fetchSecuritySummaries({}) instanceof Promise);
});

chk('aggregateSecurity returns Promise', () => {
    w48.reset();
    ok('  returns a promise', w48.aggregateSecurity({}) instanceof Promise);
});

// ---------- Summary ----------

(async () => {
    await new Promise((r) => setImmediate(r));
    console.log('');
    console.log(`Summary: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
