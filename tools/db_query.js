#!/usr/bin/env node
/**
 * db_query.js
 * NamaMedical ERP — Read-only ad-hoc PostgreSQL query CLI.
 *
 * USAGE:
 *   node db_query.js --query="SELECT 1" [--tenant=ID] [--format=json|csv|table]
 *                     [--limit=100] [--host=127.0.0.1] [--database=nama_medical]
 *                     [--user=nama_medical_app] [--env-file=/path/to/env]
 *   node db_query.js --help
 *
 * SAFETY RAILS (AGENTS.md §2.2):
 *   - Reads DB connection from /var/www/namaweb/ops/namaweb-backup.env
 *     (chmod 600). Real password is never read from .env.example, never
 *     embedded in this script, never printed to logs.
 *   - Hard-rejects any statement whose leading verb is not in the
 *     allowlist {SELECT, WITH, EXPLAIN, SHOW}. Hard-rejects DROP/TRUNCATE/
 *     DELETE/UPDATE/INSERT/ALTER/CREATE/GRANT/REVOKE/VACUUM/REINDEX/
 *     COPY/\\copy/\\!/CALL anywhere in the statement.
 *   - Mandatory LIMIT: appends "LIMIT N" if absent. Default 100, max 1000.
 *   - All read-only — no side effects, no transactions started, no writes.
 *
 * EXIT CODES:
 *   0  success
 *   1  input / argument error
 *   2  SQL safety rejection
 *   3  connection / query error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    query: null,
    tenant: null,
    format: 'json',
    limit: 100,
    host: null,
    port: null,
    database: null,
    user: null,
    envFile: '/var/www/namaweb/ops/namaweb-backup.env'
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a.startsWith('--query=')) {
      opts.query = a.slice('--query='.length);
    } else if (a.startsWith('--tenant=')) {
      opts.tenant = a.slice('--tenant='.length);
    } else if (a.startsWith('--format=')) {
      opts.format = a.slice('--format='.length);
    } else if (a.startsWith('--limit=')) {
      opts.limit = parseInt(a.slice('--limit='.length), 10);
    } else if (a.startsWith('--host=')) {
      opts.host = a.slice('--host='.length);
    } else if (a.startsWith('--port=')) {
      opts.port = parseInt(a.slice('--port='.length), 10);
    } else if (a.startsWith('--database=')) {
      opts.database = a.slice('--database='.length);
    } else if (a.startsWith('--user=')) {
      opts.user = a.slice('--user='.length);
    } else if (a.startsWith('--env-file=')) {
      opts.envFile = a.slice('--env-file='.length);
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }
  return opts;
}

function printHelp() {
  const help = [
    'db_query.js — NamaMedical read-only PostgreSQL query CLI',
    '',
    'USAGE:',
    '  node db_query.js --query="SELECT 1" [--tenant=ID]',
    '                     [--format=json|csv|table] [--limit=100]',
    '                     [--host=127.0.0.1] [--port=5432]',
    '                     [--database=nama_medical] [--user=nama_medical_app]',
    '                     [--env-file=PATH]',
    '',
    'OPTIONS:',
    '  --query=SQL       (required) the SQL statement to execute',
    '  --tenant=ID       set session tenant_id (RLS scoping hint)',
    '  --format=FORMAT   json (default) | csv | table',
    '  --limit=N         row limit, default 100, max 1000',
    '  --host=HOST       override PGHOST from env file',
    '  --port=PORT       override PGPORT from env file',
    '  --database=DB     override PGDATABASE from env file',
    '  --user=USER       override PGUSER from env file',
    '  --env-file=PATH   env file location (default:',
    '                    /var/www/namaweb/ops/namaweb-backup.env)',
    '  --help, -h        show this help',
    '',
    'SAFETY:',
    '  Only SELECT, WITH, EXPLAIN, SHOW are allowed. Any DROP, TRUNCATE,',
    '  DELETE, UPDATE, INSERT, ALTER, CREATE, GRANT, REVOKE, VACUUM,',
    '  REINDEX, COPY or CALL anywhere in the statement is rejected.',
    '  LIMIT is mandatory; if absent, LIMIT <default> is appended.',
    '',
    'EXIT CODES:',
    '  0  success',
    '  1  input / argument error',
    '  2  SQL safety rejection',
    '  3  connection / query error',
    '',
    'EXAMPLES:',
    '  node db_query.js --query="SELECT 1 AS one"',
    '  node db_query.js --query="SELECT * FROM pg_tables LIMIT 5"',
    '  node db_query.js --query="SELECT now()" --format=table',
    '  node db_query.js --query="SELECT * FROM patients" --tenant=acme --limit=50',
    ''
  ].join('\n');
  process.stdout.write(help + '\n');
}

// ---------------------------------------------------------------------------
// Env file loader (KEY=VALUE, no exports, # comments)
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('env file not found: ' + filePath +
      ' (run: sudo bash /var/www/namaweb/ops/cron_install.sh)');
  }
  const stat = fs.statSync(filePath);
  // Warn (not fail) if perms are too open. We never echo the contents.
  if ((stat.mode & 0o777) & ~0o600) {
    process.stderr.write('WARN: env file ' + filePath +
      ' has permissive mode ' + (stat.mode & 0o777).toString(8) +
      ' (recommend chmod 600)\n');
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SQL safety gate
// ---------------------------------------------------------------------------

const ALLOWED_VERBS = ['SELECT', 'WITH', 'EXPLAIN', 'SHOW'];
const FORBIDDEN_TOKENS = [
  'DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE',
  'GRANT', 'REVOKE', 'VACUUM', 'REINDEX', 'COPY', '\\COPY', '\\!',
  'CALL', 'DO', 'LOCK', 'SET\\s+ROLE', 'RESET\\s+ROLE', 'SECURITY',
  'NOTIFY', 'LISTEN', 'UNLISTEN', 'CLUSTER', 'REFRESH'
];

function stripComments(sql) {
  // Remove /* ... */ block comments
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove -- ... line comments
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

function leadingVerb(sql) {
  const stripped = stripComments(sql).trim();
  if (!stripped) return null;
  // First run of word chars; if it starts with a backslash (psql \command),
  // also include the backslash.
  const m = stripped.match(/^\s*(\\?[A-Za-z]+)/);
  if (!m) return null;
  return m[1].replace(/^\\/, '').toUpperCase();
}

function checkSafety(sql, limit) {
  const stripped = stripComments(sql);
  const upper = stripped.toUpperCase();
  const verb = leadingVerb(sql);
  if (!verb || !ALLOWED_VERBS.includes(verb)) {
    return {
      ok: false,
      reason: 'rejected: leading verb "' + (verb || '(empty)') +
        '" is not in the allowlist ' + JSON.stringify(ALLOWED_VERBS)
    };
  }
  for (const tok of FORBIDDEN_TOKENS) {
    // Word-boundary match for normal tokens; \COPY has a backslash so we
    // don't anchor the left side. We accept either \COPY or \\COPY
    // (i.e. one-or-two backslashes followed by COPY) by normalizing first.
    let probe = upper;
    if (tok.startsWith('\\')) {
      // Normalize "\\COPY" / "\\\\COPY" down to "\COPY" so the regex sees
      // a single backslash.
      probe = probe.replace(/\\+/g, '\\');
    }
    const target = tok.replace(/\\/g, '\\\\'); // for regex: \ -> \\
    const re = tok.startsWith('\\')
      ? new RegExp('(^|[^A-Z])' + target + '(?![A-Z])', 'i')
      : new RegExp('(?<![A-Z])' + target + '(?![A-Z])', 'i');
    if (re.test(probe)) {
      return { ok: false, reason: 'rejected: forbidden token "' + tok + '" in query' };
    }
  }
  // LIMIT enforcement
  if (!/\bLIMIT\s+\d+/i.test(stripped)) {
    return {
      ok: true,
      sql: stripped.replace(/;\s*$/, '') + ' LIMIT ' + limit
    };
  }
  return { ok: true, sql: stripped };
}

// ---------------------------------------------------------------------------
// psql wrapper
// ---------------------------------------------------------------------------

function runPsql(args, opts) {
  return new Promise(function (resolve, reject) {
    const env = Object.assign({}, process.env, {
      PGHOST: opts.host,
      PGPORT: String(opts.port),
      PGDATABASE: opts.database,
      PGUSER: opts.user,
      PGPASSWORD: opts.password
    });
    // psql: -A = unaligned, -t = tuples only, -F sep for csv
    // We use the JSON column mode (--json, psql 16+) when available;
    // for PG14 we use -A -t with a custom separator and parse.
    const child = spawn('psql', args, {
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', function (d) { stdout += d.toString('utf8'); });
    child.stderr.on('data', function (d) { stderr += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', function (code) {
      if (code === 0) {
        resolve({ stdout: stdout, stderr: stderr });
      } else {
        reject(new Error('psql exited ' + code + ': ' + stderr.trim()));
      }
    });
  });
}

// Parse psql unaligned output: header on first line, then rows.
// Strip psql footer lines like "(10 rows)" or "Time: 1.2 ms" if they
// bleed through. With -q and -P footer=off, footers are usually gone
// already; this is defense in depth.
function parseUnaligned(text, sep) {
  const lines = text.split(/\r?\n/);
  // Filter footer-ish lines
  const filtered = lines.filter(function (l) {
    const t = l.trim();
    if (!t) return false;
    if (/^\(\d+ rows?\)$/.test(t)) return false;       // (N rows)
    if (/^Time:/.test(t)) return false;                // Time: ...
    if (/^SELECT\s+\d+/.test(t) && /Time:/.test(t)) return false; // combined
    if (/^COPY \d+/.test(t)) return false;             // COPY N
    if (/^ERROR:/.test(t)) return false;               // psql error
    return true;
  });
  if (filtered.length === 0) return { columns: [], rows: [] };
  const split = function (l) { return l.split(sep); };
  const columns = split(filtered[0]);
  const rows = filtered.slice(1).map(split);
  return { columns: columns, rows: rows };
}

// CSV output
function toCsv(columns, rows) {
  const esc = function (v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const out = [columns.map(esc).join(',')];
  for (const r of rows) out.push(r.map(esc).join(','));
  return out.join('\n') + '\n';
}

// Pretty table output
function toTable(columns, rows) {
  if (rows.length === 0) {
    return '(0 rows)\n' + columns.join(' | ') + '\n';
  }
  const widths = columns.map(function (c, i) {
    let w = c.length;
    for (const r of rows) {
      const cell = r[i] === null || r[i] === undefined ? '' : String(r[i]);
      if (cell.length > w) w = cell.length;
    }
    return w;
  });
  const fmt = function (cells) {
    return cells.map(function (c, i) {
      const s = c === null || c === undefined ? '' : String(c);
      return s + ' '.repeat(Math.max(0, widths[i] - s.length));
    }).join(' | ');
  };
  const sep = widths.map(function (w) { return '-'.repeat(w); }).join('-+-');
  const out = [fmt(columns), sep];
  for (const r of rows) out.push(fmt(r));
  return out.join('\n') + '\n(' + rows.length + ' row' +
    (rows.length === 1 ? '' : 's') + ')\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    process.stderr.write('ARG ERROR: ' + e.message + '\n');
    printHelp();
    process.exit(1);
  }

  if (opts.help || !opts.query) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  if (!Number.isFinite(opts.limit) || opts.limit < 1) {
    process.stderr.write('ARG ERROR: --limit must be a positive integer\n');
    process.exit(1);
  }
  if (opts.limit > 1000) {
    process.stderr.write('ARG ERROR: --limit cannot exceed 1000 (got ' + opts.limit + ')\n');
    process.exit(1);
  }
  if (!['json', 'csv', 'table'].includes(opts.format)) {
    process.stderr.write('ARG ERROR: --format must be json, csv, or table\n');
    process.exit(1);
  }

  // Safety gate first — before reading the env file
  const safety = checkSafety(opts.query, opts.limit);
  if (!safety.ok) {
    process.stderr.write('SQL SAFETY: ' + safety.reason + '\n');
    process.exit(2);
  }

  // Load env file
  let env;
  try {
    env = loadEnvFile(opts.envFile);
  } catch (e) {
    process.stderr.write('ENV ERROR: ' + e.message + '\n');
    process.exit(3);
  }
  const cfg = {
    host: opts.host || env.PGHOST || '127.0.0.1',
    port: opts.port || parseInt(env.PGPORT || '5432', 10),
    database: opts.database || env.PGDATABASE || 'nama_medical',
    user: opts.user || env.PGUSER || 'nama_medical_app',
    password: env.PGPASSWORD
  };
  if (!cfg.password) {
    process.stderr.write('ENV ERROR: PGPASSWORD missing in ' + opts.envFile + '\n');
    process.exit(3);
  }

  // Optional tenant scoping — set BEFORE the query
  const preSql = opts.tenant
    ? "SET LOCAL app.tenant_id = '" + opts.tenant.replace(/'/g, "''") + "'; "
    : '';

  // psql args: -A (unaligned), -F tab, -P pager=off, -X (no .psqlrc),
  // -q (quiet — no info messages), -P footer=off (suppress row count)
  const args = ['-A', '-F', '\t', '-P', 'pager=off', '-P', 'footer=off',
    '-q', '-X'];
  args.push('-c', preSql + safety.sql);

  const t0 = Date.now();
  let result;
  try {
    result = await runPsql(args, cfg);
  } catch (e) {
    process.stderr.write('QUERY ERROR: ' + e.message + '\n');
    process.exit(3);
  }
  const elapsedMs = Date.now() - t0;

  const sep = '\t';
  const { columns, rows } = parseUnaligned(result.stdout, sep);

  if (opts.format === 'json') {
    const out = {
      query_time_ms: elapsedMs,
      row_count: rows.length,
      column_count: columns.length,
      columns: columns,
      rows: rows,
      tenant: opts.tenant || null,
      limit_applied: /\bLIMIT\s+\d+/i.test(opts.query) ? 'user' : 'enforced'
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else if (opts.format === 'csv') {
    process.stdout.write(toCsv(columns, rows));
    process.stderr.write('# query_time_ms=' + elapsedMs +
      ' row_count=' + rows.length + '\n');
  } else {
    process.stdout.write(toTable(columns, rows));
    process.stderr.write('# query_time_ms=' + elapsedMs + '\n');
  }
  process.exit(0);
}

main().catch(function (e) {
  process.stderr.write('FATAL: ' + e.message + '\n');
  process.exit(3);
});
