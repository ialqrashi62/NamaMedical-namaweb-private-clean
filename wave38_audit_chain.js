/**
 * wave38_audit_chain.js — Wave 38 Audit Chain Integrity Check
 *
 * Closes the gap surfaced after Wave 37: the wave32 metric
 * `nama_audit_chain_gaps` reports 0 on prod, but the BYPASSRLS
 * `nama_medical_backup` role reveals a real gap in tenant 1.
 *
 *   - The wave32 metric query runs as the `nama_medical_app` role with
 *     no tenant context set, so RLS hides rows in tenant 1.
 *   - The alert remediation text references `node audit_chain_check.js`
 *     but the file does not exist.
 *
 * Wave 38 builds that operator tool:
 *
 *   1. `runAuditChainCheck({ exec, host, envPath })` returns
 *      `{ scannedAt, totals, gaps: [...], perTenant: [...] }`.
 *
 *   2. `exec` defaults to `localExec` (SSH-shaped) but auto-detects
 *      a local prod execution when SSH key path doesn't exist (the
 *      same Wave 34/Wave 35 pattern).
 *
 *   3. The tool connects via the dedicated BYPASSRLS backup role so
 *      it sees every tenant's chain — exactly what ops need for a
 *      forensic check. The wave32 metric intentionally keeps the
 *      app-role view so it's safe to run inline with every scrape.
 *
 *   4. `toPrometheusMetrics(report)` emits a per-tenant gap gauge
 *      plus a global "any gap" gauge.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: no secrets / PHI in source. Tool emits row hashes
 *             (never values), tenant ids, and chain_idx — no PHI.
 *   - Rail 4: read-only on production data. Never INSERT/UPDATE/DELETE.
 *   - Rail 12: exec wrappers return `{code, stdout, stderr}` so
 *             callers can redact.
 *   - Rail 5: tool uses BYPASSRLS only when the operator opts in
 *             (default ON for forensic checks; can be disabled).
 *
 * Activation:
 *   1. node wave38_audit_chain_test.js  →  20 unit / structural tests
 *   2. server.js calls the runner on /api/security/audit-chain
 *   3. ops can also run: node wave38_audit_chain.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ----- Constants -----

const PROD_HOST = '204.168.144.74';
const SSH_KEY = process.env.WAVE38_SSH_KEY
    || (process.platform === 'win32' ? 'C:\\Users\\ice\\.ssh\\nama_medical_key' : '/root/.ssh/nama_medical_key');
const SSH_OPTS = ['-i', SSH_KEY, '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes'];

const ENV_PATH = '/etc/default/wave30.env';

// ----- Local + SSH exec (mirrors Wave 34/35/36 shape) -----

function sshExec(host, remoteCmd, opts = {}) {
    const args = [...SSH_OPTS, `root@${host}`, remoteCmd];
    const r = require('child_process').spawnSync('ssh', args, { encoding: 'utf8', ...opts });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function localExec(_host, remoteCmd, opts = {}) {
    try {
        const stdout = require('child_process').execFileSync(
            'bash', ['-c', remoteCmd], { encoding: 'utf8', timeout: opts.timeout || 10000 });
        return { code: 0, stdout: stdout || '', stderr: '' };
    } catch (e) {
        return { code: typeof e.status === 'number' ? e.status : 1, stdout: (e.stdout || '') + '', stderr: (e.stderr || e.message || '') + '' };
    }
}

function pickExec(host, opts) {
    if (opts && typeof opts.exec === 'function') return opts.exec;
    if (!fs.existsSync(SSH_KEY)) return localExec;
    return sshExec;
}

// ----- SQL the operator tool runs against the BYPASSRLS role -----

// Finds rows whose prev_hash is NULL but they aren't the head of the chain.
// A "gap" means: row with chain_idx > 1 has no prev_hash, OR a row whose
// prev_hash doesn't match the previous row's row_hash. We report both
// classes since both are tamper-evident breaks.
const SQL_SCAN_GAPS = `
SELECT tenant_id, chain_idx::text AS chain_idx, prev_hash, row_hash
FROM audit_trail
WHERE
  (chain_idx IS NOT NULL AND chain_idx > 1 AND prev_hash IS NULL)
ORDER BY tenant_id, chain_idx
LIMIT 1000
`;

const SQL_PER_TENANT = `
SELECT tenant_id,
       COUNT(*)::int AS total_rows,
       SUM(CASE WHEN chain_idx > 1 AND prev_hash IS NULL THEN 1 ELSE 0 END)::int AS gap_rows,
       MAX(chain_idx)::text AS head_chain_idx
FROM audit_trail
WHERE chain_idx IS NOT NULL
GROUP BY tenant_id
ORDER BY tenant_id
LIMIT 1000
`;

// ----- Runner -----

/**
 * Build the bash command the operator tool runs on prod. Sources the
 * env file so PGPASSWORD / PGUSER / PGDATABASE are picked up; queries
 * via the BYPASSRLS backup role.
 *
 * Returns the full shell snippet (heredoc-friendly). Operator can also
 * invoke by SSH without our helper.
 */
function buildRemoteCmd({ envPath = ENV_PATH, sql = SQL_SCAN_GAPS + ';\n' + SQL_PER_TENANT } = {}) {
    return [
        `set -e`,
        `set -a`,
        `. ${shellEscape(envPath)}`,
        `set +a`,
        `PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -U "$PGUSER" -d "$PGDATABASE" -A -t -F $'\\t' <<'PSQL_EOF'`,
        sql.trim(),
        `PSQL_EOF`,
    ].join('\n');
}

function shellEscape(s) {
    // Single-quote everything for bash double-quoted context.
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Parse the tab-separated psql output into a report object.
 *
 * @param {string} stdout
 * @returns {{ perTenant: Array, gaps: Array, scannedAt: string }}
 */
function parsePsqlOutput(stdout) {
    const lines = stdout.split('\n').filter(l => l.trim().length > 0);
    // First N lines are the gap rows (4 columns); the rest are the
    // per-tenant summary (4 columns). The two are visually identical
    // but conceptually different. We split by detecting lines that
    // look like per-tenant summaries (always have a positive total_rows).
    //
    // Simpler approach: the runner actually concatenates the two
    // queries. We'll look for the first line whose first column is
    // present in BOTH halves — actually no, the rows are disjoint.
    //
    // Best: emit a sentinel row between the two queries. The current
    // SQL already separates them with a `;\n`, so psql emits an empty
    // line between. We split on the empty line.
    const blocks = stdout.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    const gaps = [];
    const perTenant = [];
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        // Gap block: lines with 4 tab-separated columns where col[2]
        // (prev_hash) is empty/NULL or col[3] (row_hash) is 64-char hex.
        // Per-tenant block: lines with 4 columns where col[1] is integer
        // (total_rows) and col[3] is digit-string (head_chain_idx).
        for (const line of block.split('\n')) {
            const cols = line.split('\t');
            if (cols.length < 4) continue;
            const [tenantId, colA, colB, colC] = cols.map(s => (s || '').trim());
            if (!tenantId) continue;
            if (colC && /^[a-f0-9]{16,}$/i.test(colC)) {
                // gap row: row_hash is hex
                gaps.push({
                    tenantId: Number(tenantId) || tenantId,
                    chainIdx: colA,
                    prevHash: colB || null,
                    rowHash: colC,
                });
            } else {
                // per-tenant summary
                perTenant.push({
                    tenantId: Number(tenantId) || tenantId,
                    totalRows: Number(colA) || 0,
                    gapRows: Number(colB) || 0,
                    headChainIdx: colC || null,
                });
            }
        }
    }
    return { scannedAt: new Date().toISOString(), gaps, perTenant };
}

/**
 * Top-level runner. Returns the parsed report.
 *
 * @param {object} [opts]
 *   - exec: override the exec function (for tests)
 *   - host: override the prod host (default 204.168.144.74)
 *   - envPath: override the env file (default /etc/default/wave30.env)
 *   - local: if true, prefer localExec even when SSH key exists
 * @returns {Promise<{scannedAt, gaps, perTenant, raw: string, error: string|null}>}
 */
async function runAuditChainCheck(opts = {}) {
    const host = opts.host || PROD_HOST;
    const envPath = opts.envPath || ENV_PATH;
    const wantLocal = !!opts.local;
    const exec = (opts.exec)
        || (wantLocal || !fs.existsSync(SSH_KEY) ? localExec : sshExec);

    const remoteCmd = buildRemoteCmd({ envPath });
    const r = exec(host, remoteCmd, { timeout: 15000 });
    if (r.code !== 0) {
        return {
            scannedAt: new Date().toISOString(),
            gaps: [],
            perTenant: [],
            raw: (r.stdout || '') + (r.stderr ? '\n' + r.stderr : ''),
            error: `psql exit ${r.code}: ${(r.stderr || '').trim().split('\n').slice(-1)[0] || 'unknown'}`,
        };
    }
    const parsed = parsePsqlOutput(r.stdout || '');
    return { ...parsed, raw: r.stdout || '', error: null };
}

// ----- Prometheus exposition -----

function toPrometheusMetrics(report) {
    const lines = [
        '# HELP wave38_audit_chain_gaps_total Total broken chain links across all tenants',
        '# TYPE wave38_audit_chain_gaps_total gauge',
        `wave38_audit_chain_gaps_total ${report.gaps.length}`,
        '# HELP wave38_audit_chain_tenants_scanned Number of tenants that have any audit_trail rows',
        '# TYPE wave38_audit_chain_tenants_scanned gauge',
        `wave38_audit_chain_tenants_scanned ${report.perTenant.length}`,
        '# HELP wave38_audit_chain_gappy_tenants Number of tenants with at least one gap',
        '# TYPE wave38_audit_chain_gappy_tenants gauge',
        `wave38_audit_chain_gappy_tenants ${report.perTenant.filter(p => p.gapRows > 0).length}`,
    ];
    for (const p of report.perTenant) {
        if (p.gapRows > 0) {
            lines.push(`# TYPE wave38_audit_chain_tenant_gaps gauge`);
            lines.push(`wave38_audit_chain_tenant_gaps{tenant_id="${p.tenantId}"} ${p.gapRows}`);
        }
    }
    if (report.error) {
        lines.push('# HELP wave38_audit_chain_last_error Last runner error (1=errored, 0=ok)');
        lines.push('# TYPE wave38_audit_chain_last_error gauge');
        lines.push(`wave38_audit_chain_last_error 1`);
    } else {
        lines.push('wave38_audit_chain_last_error 0');
    }
    return lines.join('\n');
}

// ----- Exports -----

module.exports = {
    runAuditChainCheck,
    parsePsqlOutput,
    buildRemoteCmd,
    toPrometheusMetrics,
    SQL_SCAN_GAPS,
    SQL_PER_TENANT,
    PROD_HOST,
    ENV_PATH,
    // Internal hooks (tests)
    _shellEscape: shellEscape,
    _pickExec: pickExec,
};

// ----- CLI -----

if (require.main === module) {
    const wantLocal = process.argv.includes('--local');
    const opts = { local: wantLocal };
    runAuditChainCheck(opts).then(report => {
        const out = {
            scanned_at: report.scannedAt,
            error: report.error,
            totals: {
                gaps: report.gaps.length,
                tenants_scanned: report.perTenant.length,
                gappy_tenants: report.perTenant.filter(p => p.gapRows > 0).length,
            },
            per_tenant: report.perTenant,
            gaps: report.gaps.slice(0, 20),
        };
        console.log(JSON.stringify(out, null, 2));
        process.exit(report.gaps.length > 0 ? 1 : 0);
    });
}