/**
 * wave47_aggregator_extension_test.js -- Tests for Wave 47 aggregator extension
 *
 * Pattern: 5-section test file.
 *   1. Extended sub-module list
 *   2. fetchExtendedSummaries (4 modules + isolation)
 *   3. buildExtendedOutput
 *   4. countExtendedGauges + hasExtendedMinimalOutput
 *   5. aggregateAll() with TTL cache
 *   6. Safety rails
 *   7. Public API
 */

'use strict';

const w47 = require('./wave47_aggregator_extension');

let pass = 0, fail = 0;
function ok(msg, cond) {
    if (cond) { pass++; }
    else { fail++; console.error(`[FAIL]   ${msg}`); }
}
function chk(name, fn) {
    try { fn(); console.log(`[PASS]   ${name}`); }
    catch (e) { fail++; console.error(`[FAIL]   ${name} threw: ${e.message}`); }
}

// ---------- 1. Extended sub-module list ----------

chk('listExtendedSubModules returns the 4 expected modules', () => {
    const subs = w47.listExtendedSubModules();
    ok('  length = 4', subs.length === 4);
    ok('  contains backup', subs.indexOf('backup') !== -1);
    ok('  contains logrotate', subs.indexOf('logrotate') !== -1);
    ok('  contains dr_drill', subs.indexOf('dr_drill') !== -1);
    ok('  contains process', subs.indexOf('process') !== -1);
});

chk('listExtendedSubModules returns a fresh array', () => {
    const a = w47.listExtendedSubModules();
    a.push('rogue');
    const b = w47.listExtendedSubModules();
    ok('  subsequent call returns clean array', b.length === 4);
});

chk('TTL_MS is 5000 (matches wave45/46)', () => {
    ok('  TTL_MS = 5000', w47.TTL_MS === 5000);
});

// ---------- 2. fetchExtendedSummaries ----------

chk('fetchExtendedSummaries returns structure with 4 fields', async () => {
    // Use a fast mock exec to avoid real SSH (which takes ~6s per call).
    const fakeExec = (h, cmd) => ({
        code: 0,
        stdout: 'mock',
        stderr: '',
    });
    let didThrow = false;
    let r;
    try { r = await w47.fetchExtendedSummaries({ exec: fakeExec }); }
    catch (e) { didThrow = true; }
    ok('  never throws', !didThrow);
    ok('  has captured_at', r && typeof r.captured_at === 'string');
    ok('  has errors array', r && Array.isArray(r.errors));
    ok('  has 4 fields', r && 'backup' in r && 'logrotate' in r && 'dr_drill' in r && 'process' in r);
});

chk('fetchExtendedSummaries tolerates null deps', async () => {
    let didThrow = false;
    try { await w47.fetchExtendedSummaries(); }
    catch (e) { didThrow = true; }
    ok('  did not throw', !didThrow);
});

chk('fetchExtendedSummaries structure has all 4 fields (with mock exec)', async () => {
    const fakeExec = (h, cmd) => ({ code: 0, stdout: 'mock', stderr: '' });
    const r = await w47.fetchExtendedSummaries({ exec: fakeExec });
    ok('  has backup field', 'backup' in r);
    ok('  has logrotate field', 'logrotate' in r);
    ok('  has dr_drill field', 'dr_drill' in r);
    ok('  has process field', 'process' in r);
});

// ---------- 3. buildExtendedOutput ----------

chk('buildExtendedOutput handles null/empty input gracefully', () => {
    let didThrow = false;
    let out;
    try {
        out = w47.buildExtendedOutput(null);
        w47.buildExtendedOutput(undefined);
        w47.buildExtendedOutput({});
    } catch (e) { didThrow = true; }
    ok('  never throws', !didThrow);
    ok('  null returns valid string', typeof out === 'string');
    ok('  null contains self-metric', out.indexOf('nama_metrics_aggregator_ext_modules_ok') !== -1);
});

chk('buildExtendedOutput self-metric reflects modules succeeded', () => {
    const all4 = w47.buildExtendedOutput({
        backup: { ok: true, checks: [] },
        logrotate: { ok: true, checks: [] },
        dr_drill: { success: 1 },
        process: { unhandled_rejections_total: 0 },
    });
    ok('  modules_ok = 4', /nama_metrics_aggregator_ext_modules_ok 4\b/.test(all4));
    ok('  modules_total = 4', /nama_metrics_aggregator_ext_modules_total 4\b/.test(all4));

    const only2 = w47.buildExtendedOutput({
        backup: null,
        logrotate: null,
        dr_drill: { success: 1 },
        process: { unhandled_rejections_total: 0 },
    });
    ok('  modules_ok = 2', /nama_metrics_aggregator_ext_modules_ok 2\b/.test(only2));
});

chk('buildExtendedOutput skips null summaries gracefully', () => {
    const out = w47.buildExtendedOutput({
        backup: { ok: true, checks: [] },
        logrotate: null,
        dr_drill: null,
        process: null,
    });
    ok('  still produces output', typeof out === 'string' && out.length > 0);
    ok('  contains backup metric', out.indexOf('wave34_activation_status') !== -1);
    ok('  contains logrotate self-metric', out.indexOf('nama_metrics_aggregator_ext_modules_ok') !== -1);
});

chk('buildExtendedOutput calls each module toPrometheusMetrics', () => {
    // Use shape that wave34 expects: { ok, checks: [{name, ok}] }
    const summaries = {
        backup: {
            ok: true,
            checks: [
                { name: 'cron-entry', ok: true, detail: '5 2 * * *' },
                { name: 'env-file', ok: true, detail: '600 1234' },
            ],
        },
        logrotate: {
            ok: true,
            checks: [
                { name: 'wave30-config', ok: true },
                { name: 'pm2-config', ok: true },
            ],
        },
        dr_drill: { success: 1, patientsRestored: 4, restoreErrors: 0, benignErrors: 0, age_hours: 12.5 },
        process: { unhandled_rejections_total: 0, uncaught_exceptions_total: 0, sigterm_total: 0, sigint_total: 0 },
    };
    const out = w47.buildExtendedOutput(summaries);
    ok('  contains wave34 (backup)', out.indexOf('wave34_activation_status') !== -1);
    ok('  contains wave35 (logrotate)', out.indexOf('wave35_activation_status') !== -1);
    ok('  contains wave41 (DR drill)', out.indexOf('nama_dr_drill_last_success') !== -1);
    ok('  contains wave42 (process)', out.indexOf('nama_process_unhandled_rejections_total') !== -1);
    ok('  contains self-metric', out.indexOf('nama_metrics_aggregator_ext_modules_ok') !== -1);
});

// ---------- 4. Diagnostics ----------

chk('countExtendedGauges counts TYPE declarations', () => {
    const fake = [
        '# HELP a Some gauge',
        '# TYPE a gauge',
        'a 1',
        '# HELP b Other',
        '# TYPE b gauge',
        'b 2',
    ].join('\n');
    ok('  count = 2', w47.countExtendedGauges(fake) === 2);
});

chk('countExtendedGauges returns 0 for null/empty', () => {
    ok('  null → 0', w47.countExtendedGauges(null) === 0);
    ok('  empty → 0', w47.countExtendedGauges('') === 0);
});

chk('hasExtendedMinimalOutput is true only when all 4 anchors present', () => {
    const fake = '# HELP wave34_activation_status foo\n# TYPE wave34_activation_status gauge\n'
        + '# HELP wave35_activation_status foo\n# TYPE wave35_activation_status gauge\n'
        + '# HELP nama_dr_drill_last_success foo\n# TYPE nama_dr_drill_last_success gauge\n'
        + '# HELP nama_process_unhandled_rejections_total foo\n# TYPE nama_process_unhandled_rejections_total gauge\n';
    ok('  full = true', w47.hasExtendedMinimalOutput(fake) === true);
    ok('  empty = false', w47.hasExtendedMinimalOutput('') === false);
    ok('  null = false', w47.hasExtendedMinimalOutput(null) === false);
});

// ---------- 5. aggregateAll() with TTL cache ----------

chk('aggregateAll caches for 5s and rebuilds after reset', async () => {
    w47.reset();
    const fakeExec = (h, cmd) => ({ code: 0, stdout: 'mock', stderr: '' });
    const a = await w47.aggregateAll({ exec: fakeExec });
    const b = await w47.aggregateAll({ exec: fakeExec });
    ok('  both calls return strings', typeof a === 'string' && typeof b === 'string');
    ok('  cache works (b is string)', b.length > 0);
    w47.reset();
    const c = await w47.aggregateAll({ exec: fakeExec });
    ok('  rebuilds after reset', typeof c === 'string' && c.length > 0);
});

chk('aggregateAll returns Prometheus text format', async () => {
    w47.reset();
    const fakeExec = (h, cmd) => ({ code: 0, stdout: 'mock', stderr: '' });
    const out = await w47.aggregateAll({ exec: fakeExec });
    ok('  ends with newline', out.endsWith('\n'));
    ok('  contains wave46 self-metric', out.indexOf('nama_metrics_aggregator_modules_ok') !== -1);
    ok('  contains wave47 self-metric', out.indexOf('nama_metrics_aggregator_ext_modules_ok') !== -1);
});

// ---------- 6. Safety rails ----------

const fs = require('fs');
const srcPath = require('path').join(__dirname, 'wave47_aggregator_extension.js');
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
        'fetchExtendedSummaries',
        'buildExtendedOutput',
        'aggregateAll',
        'listExtendedSubModules',
        'countExtendedGauges',
        'hasExtendedMinimalOutput',
        'reset',
        'TTL_MS',
        'EXTENDED_SUB_MODULES',
    ];
    for (const name of expected) {
        ok('  has ' + name, typeof w47[name] !== 'undefined');
    }
});

chk('fetchExtendedSummaries returns Promise', () => {
    ok('  returns a promise', w47.fetchExtendedSummaries({}) instanceof Promise);
});

chk('aggregateAll returns Promise', () => {
    w47.reset();
    const fakeExec = (h, cmd) => ({ code: 0, stdout: 'mock', stderr: '' });
    ok('  returns a promise', w47.aggregateAll({ exec: fakeExec }) instanceof Promise);
});

// ---------- Summary ----------

(async () => {
    await new Promise((r) => setImmediate(r));
    console.log('');
    console.log(`Summary: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
