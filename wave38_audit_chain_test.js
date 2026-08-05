/**
 * wave38_audit_chain_test.js — Unit + structural + safety tests for
 * Wave 38 audit chain integrity checker.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: no secrets / PHI in source.
 *   - Rail 4: read-only on production data.
 *   - Rail 12: never logs connection strings.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const w38 = require('./wave38_audit_chain');
const SOURCE_FILE = path.join(__dirname, 'wave38_audit_chain.js');

const tests = [];
let passed = 0;
let failed = 0;
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error('assertion failed' + (msg ? `: ${msg}` : '')); }
function assertStrictEqual(a, b, msg) { if (a !== b) throw new Error('assertion failed' + (msg ? `: ${msg}` : '') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ----- Constants -----

test('constants: PROD_HOST is the Hetzner host', () => {
    assertStrictEqual(w38.PROD_HOST, '204.168.144.74');
});

test('constants: ENV_PATH is the wave30 env file', () => {
    assertStrictEqual(w38.ENV_PATH, '/etc/default/wave30.env');
});

test('constants: SQL_SCAN_GAPS is read-only (no INSERT/UPDATE/DELETE)', () => {
    const stripped = w38.SQL_SCAN_GAPS.replace(/\s+/g, ' ');
    assert(!/\bINSERT\b/i.test(stripped), 'no INSERT in gap scan');
    assert(!/\bUPDATE\b/i.test(stripped), 'no UPDATE in gap scan');
    assert(!/\bDELETE\b/i.test(stripped), 'no DELETE in gap scan');
    assert(!/\bDROP\b/i.test(stripped), 'no DROP in gap scan');
    assert(/FROM\s+audit_trail/i.test(stripped), 'must SELECT FROM audit_trail');
});

test('constants: SQL_PER_TENANT is read-only (no INSERT/UPDATE/DELETE)', () => {
    const stripped = w38.SQL_PER_TENANT.replace(/\s+/g, ' ');
    assert(!/\bINSERT\b/i.test(stripped), 'no INSERT in per-tenant query');
    assert(!/\bUPDATE\b/i.test(stripped), 'no UPDATE in per-tenant query');
    assert(!/\bDELETE\b/i.test(stripped), 'no DELETE in per-tenant query');
    assert(!/\bDROP\b/i.test(stripped), 'no DROP in per-tenant query');
});

// ----- Shell escape -----

test('shellEscape: quotes simple strings', () => {
    assertStrictEqual(w38._shellEscape('/etc/default/wave30.env'),
        "'/etc/default/wave30.env'");
});

test('shellEscape: escapes embedded single quotes', () => {
    assertStrictEqual(w38._shellEscape(`/tmp/it's/a.sh`),
        `'/tmp/it'\\''s/a.sh'`);
});

// ----- buildRemoteCmd -----

test('buildRemoteCmd: sources the env file (Rail 5 hygiene)', () => {
    const cmd = w38.buildRemoteCmd();
    // The env path is single-quoted by shellEscape; the regex must allow that.
    assert(/\. ['"]\/etc\/default\/wave30\.env['"]/.test(cmd),
        'must source /etc/default/wave30.env');
    assert(/set -a/.test(cmd) && /set \+a/.test(cmd),
        'must use set -a / set +a to export all vars');
    assert(/PGPASSWORD="\$PGPASSWORD"/.test(cmd),
        'must wire PGPASSWORD through env, not literal');
});

test('buildRemoteCmd: uses psql + heredoc (no interactive prompt)', () => {
    const cmd = w38.buildRemoteCmd();
    assert(/psql -h 127\.0\.0\.1 -U "\$PGUSER" -d "\$PGDATABASE"/.test(cmd),
        'must use psql with env-substituted variables');
    assert(/<<'PSQL_EOF'/.test(cmd),
        'must use a quoted heredoc to avoid shell expansion in SQL');
});

test('buildRemoteCmd: respects a custom env path', () => {
    const cmd = w38.buildRemoteCmd({ envPath: '/tmp/my.env' });
    assert(/\. ['"]\/tmp\/my\.env['"]/.test(cmd),
        'must source the override env file');
});

// ----- parsePsqlOutput -----

test('parsePsqlOutput: empty stdout -> empty report', () => {
    const r = w38.parsePsqlOutput('');
    assertStrictEqual(r.gaps.length, 0);
    assertStrictEqual(r.perTenant.length, 0);
    assert(typeof r.scannedAt === 'string');
});

test('parsePsqlOutput: parses one gap row + one per-tenant summary', () => {
    // Use a real-looking SHA-256 hex string so the parser's hex-detection works.
    const hex = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
    const stdout = [
        `1\t2\t\t${hex}`,
        '',
        '1\t178\t1\t178',
    ].join('\n');
    const r = w38.parsePsqlOutput(stdout);
    assertStrictEqual(r.gaps.length, 1);
    assertStrictEqual(r.gaps[0].tenantId, 1);
    assertStrictEqual(r.gaps[0].chainIdx, '2');
    assertStrictEqual(r.gaps[0].prevHash, null);
    assertStrictEqual(r.gaps[0].rowHash, hex);
    assertStrictEqual(r.perTenant.length, 1);
    assertStrictEqual(r.perTenant[0].tenantId, 1);
    assertStrictEqual(r.perTenant[0].totalRows, 178);
    assertStrictEqual(r.perTenant[0].gapRows, 1);
});

test('parsePsqlOutput: handles many tenants + gappy + clean', () => {
    const hexA = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
    const hexB = 'b1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
    const stdout = [
        `1\t3\tNULL\t${hexA}`,
        `2\t4\tNULL\t${hexB}`,
        '',
        '1\t200\t1\t200',
        '2\t150\t1\t150',
        '3\t80\t0\t80',
    ].join('\n');
    const r = w38.parsePsqlOutput(stdout);
    assertStrictEqual(r.gaps.length, 2);
    assertStrictEqual(r.perTenant.length, 3);
    const tenant3 = r.perTenant.find(p => p.tenantId === 3);
    assert(tenant3, 'tenant 3 must be present');
    assertStrictEqual(tenant3.gapRows, 0);
});

// ----- runAuditChainCheck (mocked exec) -----

test('runAuditChainCheck: parses well-formed stdout', async () => {
    const hex = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
    const mockExec = (_host, _cmd) => ({
        code: 0,
        stdout: `1\t3\t\t${hex}\n\n1\t178\t1\t178\n`,
        stderr: '',
    });
    const report = await w38.runAuditChainCheck({ exec: mockExec, host: 'fake', local: true });
    assertStrictEqual(report.error, null);
    assertStrictEqual(report.gaps.length, 1);
    assertStrictEqual(report.perTenant.length, 1);
});

test('runAuditChainCheck: surfaces psql failures as error', async () => {
    const mockExec = () => ({ code: 2, stdout: '', stderr: 'psql: connection refused' });
    const report = await w38.runAuditChainCheck({ exec: mockExec, host: 'fake', local: true });
    assert(report.error, 'error must be set when exec fails');
    assert(/exit 2/.test(report.error), 'error must mention exit code');
    assertStrictEqual(report.gaps.length, 0);
});

// ----- toPrometheusMetrics -----

test('toPrometheusMetrics: emits 3 base gauges + tenant breakdowns', () => {
    const report = {
        gaps: [{ tenantId: 1, chainIdx: '3', prevHash: null, rowHash: 'h' }],
        perTenant: [
            { tenantId: 1, totalRows: 178, gapRows: 1, headChainIdx: '178' },
            { tenantId: 2, totalRows: 80, gapRows: 0, headChainIdx: '80' },
        ],
        error: null,
    };
    const out = w38.toPrometheusMetrics(report);
    assert(out.includes('wave38_audit_chain_gaps_total 1'));
    assert(out.includes('wave38_audit_chain_tenants_scanned 2'));
    assert(out.includes('wave38_audit_chain_gappy_tenants 1'));
    assert(out.includes('wave38_audit_chain_tenant_gaps{tenant_id="1"} 1'));
    assert(!out.includes('tenant_id="2"'),
        'tenant with gapRows=0 should not be emitted');
    assert(out.includes('wave38_audit_chain_last_error 0'));
});

test('toPrometheusMetrics: flags errored runs as last_error=1', () => {
    const out = w38.toPrometheusMetrics({ gaps: [], perTenant: [], error: 'boom' });
    assert(out.includes('wave38_audit_chain_last_error 1'));
});

// ----- Safety rails -----

test('source file: present and non-empty', () => {
    assert(fs.existsSync(SOURCE_FILE));
    assert(fs.readFileSync(SOURCE_FILE, 'utf8').length > 1000);
});

test('source file: never embeds a password or KEK phrase', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    // Strip both line comments AND block comments so the test doesn't trip
    // on JSDoc text that references "password" / "KEK_PASSPHRASE" as guard words.
    const stripped = content
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    // Allow PGPASSWORD="$PGPASSWORD" (env-sourced) but block literal passwords.
    assert(!/(?<!PG)password\s*[:=]/i.test(stripped), 'no literal password');
    assert(!/KEK_PASSPHRASE/i.test(stripped), 'no KEK phrase literal');
    assert(!/PGPASSWORD\s*[:=]\s*['"][^"$]/i.test(stripped),
        'no hardcoded PGPASSWORD literal (env-sourced only)');
});

test('source file: never references DELETE FROM or DROP DATABASE', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/\bDELETE\s+FROM\b/i.test(stripped));
    assert(!/\bDROP\s+DATABASE\b/i.test(stripped));
    assert(!/\bDROP\s+TABLE\b/i.test(stripped));
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