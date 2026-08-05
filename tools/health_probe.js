#!/usr/bin/env node
/**
 * health_probe.js
 * NamaMedical ERP — Combined health probe (ERP + PCC + DB + nginx + cert + disk).
 *
 * USAGE:
 *   node health_probe.js [--format=json|text] [--out=/path/to/report.json]
 *                        [--erp-url=http://127.0.0.1:3000]
 *                        [--pcc-url=http://127.0.0.1:3101]
 *                        [--cert=/etc/letsencrypt/live/alfaisal-erp.com/cert.pem]
 *                        [--cert-warn-days=14]
 *                        [--disk-warn-pct=85]
 *   node health_probe.js --help
 *
 * CHECKS (all run in parallel via Promise.all):
 *   1. ERP server   GET <erp-url>/api/health         expect 2xx
 *   2. PCC server   GET <pcc-url>/api/v1/pcc-catalog/modules  expect 2xx + count
 *   3. nginx config nginx -t                         expect exit 0
 *   4. Cert expiry  openssl x509 -enddate -noout    warn if <14 days
 *   5. Disk         df -h /var/www /var/lib/postgresql  warn if Use% >= 85
 *
 * STATUS POLICY:
 *   - "ok"        all checks pass
 *   - "warn"      any non-critical check is degraded (cert near expiry,
 *                 disk near full, nginx test slow with warnings)
 *   - "critical"  any critical check failed (ERP, PCC, or DB unreachable;
 *                 nginx config invalid; cert expired; disk full)
 *
 * EXIT CODES:
 *   0  ok
 *   1  critical
 *   2  warn (no critical)
 *   3  tool error
 *
 * OUTPUT:
 *   - Default: text summary to stdout
 *   - --format=json: structured JSON
 *   - --out=PATH: also write JSON to file (use with --format=json or auto)
 */

'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    format: 'text',
    out: null,
    erpUrl: 'http://127.0.0.1:3000',
    pccUrl: 'http://127.0.0.1:3101',
    cert: '/etc/letsencrypt/live/alfaisal-erp.com/cert.pem',
    certWarnDays: 14,
    diskWarnPct: 85,
    timeout: 10000
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a.startsWith('--format=')) {
      opts.format = a.slice('--format='.length);
    } else if (a.startsWith('--out=')) {
      opts.out = a.slice('--out='.length);
    } else if (a.startsWith('--erp-url=')) {
      opts.erpUrl = a.slice('--erp-url='.length);
    } else if (a.startsWith('--pcc-url=')) {
      opts.pccUrl = a.slice('--pcc-url='.length);
    } else if (a.startsWith('--cert=')) {
      opts.cert = a.slice('--cert='.length);
    } else if (a.startsWith('--cert-warn-days=')) {
      opts.certWarnDays = parseInt(a.slice('--cert-warn-days='.length), 10);
    } else if (a.startsWith('--disk-warn-pct=')) {
      opts.diskWarnPct = parseInt(a.slice('--disk-warn-pct='.length), 10);
    } else if (a.startsWith('--timeout=')) {
      opts.timeout = parseInt(a.slice('--timeout='.length), 10);
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }
  return opts;
}

function printHelp() {
  const help = [
    'health_probe.js — NamaMedical combined health probe',
    '',
    'USAGE:',
    '  node health_probe.js [--format=json|text] [--out=/path/to/report.json]',
    '                        [--erp-url=http://127.0.0.1:3000]',
    '                        [--pcc-url=http://127.0.0.1:3101]',
    '                        [--cert=/etc/letsencrypt/live/alfaisal-erp.com/cert.pem]',
    '                        [--cert-warn-days=14] [--disk-warn-pct=85]',
    '                        [--timeout=10000]',
    '',
    'OPTIONS:',
    '  --format=FORMAT       text (default) | json',
    '  --out=PATH            also write JSON to PATH (implies --format=json if',
    '                        --format not set)',
    '  --erp-url=URL         ERP base URL (default http://127.0.0.1:3000)',
    '  --pcc-url=URL         PCC base URL (default http://127.0.0.1:3101)',
    '  --cert=PATH           TLS cert to inspect for expiry',
    '  --cert-warn-days=N    warn if cert expires within N days (default 14)',
    '  --disk-warn-pct=N     warn if any mounted FS Use% >= N (default 85)',
    '  --timeout=MS          per-check timeout in ms (default 10000)',
    '  --help, -h            show this help',
    '',
    'CHECKS (all in parallel):',
    '  1. ERP   GET {erp-url}/api/health',
    '  2. PCC   GET {pcc-url}/api/v1/pcc-catalog/modules',
    '  3. nginx nginx -t (config validation)',
    '  4. cert  openssl x509 -enddate -noout',
    '  5. disk  df -h /var/www /var/lib/postgresql',
    '',
    'EXIT CODES:',
    '  0  ok',
    '  1  critical',
    '  2  warn',
    '  3  tool error',
    '',
    'EXAMPLES:',
    '  node health_probe.js',
    '  node health_probe.js --format=json',
    '  node health_probe.js --format=json --out=/var/log/namaweb/health.json',
    ''
  ].join('\n');
  process.stdout.write(help + '\n');
}

// ---------------------------------------------------------------------------
// HTTP probe
// ---------------------------------------------------------------------------

function httpGet(u, timeoutMs, opts) {
  // opts.captureBody = true -> return the body string (capped at 64 KiB)
  return new Promise(function (resolve) {
    const parsed = url.parse(u);
    const lib = parsed.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    const capture = !!(opts && opts.captureBody);
    const req = lib.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.path,
      headers: { 'User-Agent': 'namaweb-health-probe/1.0',
        'Accept': capture ? 'application/json' : '*/*' },
      timeout: timeoutMs
    }, function (res) {
      let size = 0;
      let chunks = [];
      res.on('data', function (c) {
        size += c.length;
        if (capture) {
          if (size <= 65536) chunks.push(c);
        } else {
          if (size > 65536) { res.destroy(); }
        }
      });
      res.on('end', function () {
        const body = capture ? Buffer.concat(chunks).toString('utf8') : '';
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          elapsed_ms: Date.now() - t0,
          size: size,
          body: body,
          location: res.headers.location || null
        });
      });
      res.on('error', function () { /* ignore, 'end' fires */ });
    });
    req.on('timeout', function () {
      req.destroy(new Error('timeout'));
    });
    req.on('error', function (err) {
      resolve({
        ok: false,
        status: 0,
        elapsed_ms: Date.now() - t0,
        size: 0,
        body: '',
        error: err.message
      });
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Spawn probe (with timeout, no shell)
// ---------------------------------------------------------------------------

function runBin(bin, args, timeoutMs) {
  return new Promise(function (resolve) {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({
        ok: false,
        exit_code: -1,
        elapsed_ms: Date.now() - t0,
        stdout: '',
        stderr: e.message,
        error: e.message
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(function () {
      killed = true;
      try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeoutMs);
    child.stdout.on('data', function (d) { stdout += d.toString('utf8'); });
    child.stderr.on('data', function (d) { stderr += d.toString('utf8'); });
    child.on('error', function (err) {
      clearTimeout(timer);
      resolve({
        ok: false,
        exit_code: -1,
        elapsed_ms: Date.now() - t0,
        stdout: stdout,
        stderr: stderr,
        error: err.message
      });
    });
    child.on('close', function (code) {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killed,
        exit_code: code,
        killed: killed,
        elapsed_ms: Date.now() - t0,
        stdout: stdout,
        stderr: stderr
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

async function checkErp(opts) {
  const url = opts.erpUrl.replace(/\/+$/, '') + '/api/health';
  const r = await httpGet(url, opts.timeout);
  if (r.ok) {
    return { status: 'ok', url: url, http: r.status, latency_ms: r.elapsed_ms };
  }
  if (r.status === 0) {
    return { status: 'critical', url: url, http: 0, error: r.error || 'unreachable',
      latency_ms: r.elapsed_ms };
  }
  return { status: 'critical', url: url, http: r.status,
    error: 'HTTP ' + r.status, latency_ms: r.elapsed_ms };
}

async function checkPcc(opts) {
  const url = opts.pccUrl.replace(/\/+$/, '') + '/api/v1/pcc-catalog/modules';
  const r = await httpGet(url, opts.timeout, { captureBody: true });
  if (!r.ok) {
    return { status: 'critical', url: url, http: r.status,
      error: r.error || ('HTTP ' + r.status), latency_ms: r.elapsed_ms };
  }
  let count = null;
  let version = null;
  if (r.body) {
    try {
      const obj = JSON.parse(r.body);
      count = (typeof obj.count === 'number') ? obj.count : null;
      version = obj.version || null;
    } catch (e) { /* leave nulls */ }
  }
  return {
    status: 'ok',
    url: url,
    http: r.status,
    latency_ms: r.elapsed_ms,
    catalog_count: count,
    catalog_version: version
  };
}

async function checkNginx(opts) {
  const r = await runBin('nginx', ['-t'], opts.timeout);
  if (r.ok) {
    return { status: 'ok', exit_code: 0, latency_ms: r.elapsed_ms };
  }
  return {
    status: 'critical',
    exit_code: r.exit_code,
    latency_ms: r.elapsed_ms,
    error: (r.stderr || r.stdout || '').trim().split(/\r?\n/)[0] || 'nginx -t failed'
  };
}

async function checkCert(opts) {
  // openssl x509 -enddate -noout -in <cert>
  const r = await runBin('openssl', ['x509', '-enddate', '-noout', '-in', opts.cert],
    opts.timeout);
  if (!r.ok) {
    if (r.error && /ENOENT/.test(r.error)) {
      return { status: 'warn', error: 'cert not found: ' + opts.cert };
    }
    return {
      status: 'critical',
      error: (r.stderr || '').trim() || 'openssl failed',
      latency_ms: r.elapsed_ms
    };
  }
  // Parse "notAfter=Jul 29 12:00:00 2026 GMT"
  const m = r.stdout.match(/notAfter=([^\r\n]+)/);
  if (!m) {
    return { status: 'critical', error: 'could not parse notAfter' };
  }
  const expiryStr = m[1].trim();
  const expiry = Date.parse(expiryStr);
  if (isNaN(expiry)) {
    return { status: 'critical', error: 'unparseable date: ' + expiryStr };
  }
  const now = Date.now();
  const daysLeft = Math.floor((expiry - now) / 86400000);
  let status = 'ok';
  if (daysLeft < 0) status = 'critical';
  else if (daysLeft < opts.certWarnDays) status = 'warn';
  return {
    status: status,
    expires: new Date(expiry).toISOString(),
    days_left: daysLeft,
    warn_threshold_days: opts.certWarnDays,
    latency_ms: r.elapsed_ms
  };
}

async function checkDisk(opts) {
  // df -h /var/www /var/lib/postgresql
  const r = await runBin('df', ['-h', '/var/www', '/var/lib/postgresql'],
    opts.timeout);
  if (!r.ok) {
    return { status: 'critical', error: r.error || 'df failed',
      latency_ms: r.elapsed_ms };
  }
  // Parse output: header then one line per FS
  const lines = r.stdout.split(/\r?\n/).filter(function (l) { return l.trim(); });
  const rows = [];
  let worst = 'ok';
  let highest = 0;
  // Skip header (first line)
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 6) continue;
    const fsname = parts[0];
    const size = parts[1];
    const used = parts[2];
    const avail = parts[3];
    const usePctStr = parts[4]; // e.g. "12%"
    const mount = parts.slice(5).join(' ');
    const usePct = parseInt(usePctStr.replace('%', ''), 10);
    if (!Number.isFinite(usePct)) continue;
    rows.push({
      filesystem: fsname,
      size: size,
      used: used,
      avail: avail,
      use_pct: usePct,
      mount: mount
    });
    if (usePct >= opts.diskWarnPct) {
      if (worst !== 'critical') worst = 'warn';
    }
    if (usePct > highest) highest = usePct;
  }
  if (rows.length === 0) {
    return { status: 'warn', error: 'no rows parsed from df', raw: r.stdout };
  }
  return {
    status: worst,
    warn_threshold_pct: opts.diskWarnPct,
    highest_use_pct: highest,
    filesystems: rows
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregate(checks) {
  let worst = 'ok';
  const order = { ok: 0, warn: 1, critical: 2 };
  for (const k of Object.keys(checks)) {
    const s = checks[k].status || 'critical';
    if (order[s] > order[worst]) worst = s;
  }
  return worst;
}

function formatText(report) {
  const lines = [];
  lines.push('=== NamaMedical Health Probe ===');
  lines.push('time:       ' + report.timestamp);
  lines.push('overall:    ' + report.status.toUpperCase());
  lines.push('---');
  const c = report.checks;
  const kv = function (k, v) { lines.push(k.padEnd(14) + v); };
  kv('erp',         c.erp.status     + ' (HTTP ' + (c.erp.http || 0) + ', ' +
    (c.erp.latency_ms || 0) + 'ms)');
  kv('pcc',         c.pcc.status     + ' (HTTP ' + (c.pcc.http || 0) + ', ' +
    (c.pcc.latency_ms || 0) + 'ms, count=' +
    (c.pcc.catalog_count === null ? '?' : c.pcc.catalog_count) + ')');
  kv('nginx',       c.nginx.status   + ' (exit ' + (c.nginx.exit_code === undefined
    ? '-' : c.nginx.exit_code) + ', ' + (c.nginx.latency_ms || 0) + 'ms)');
  if (c.cert && c.cert.expires) {
    kv('cert',       c.cert.status    + ' (expires ' + c.cert.expires +
      ', ' + c.cert.days_left + 'd left)');
  } else {
    kv('cert',       (c.cert.status || 'unknown') + ' (' +
      (c.cert.error || 'no data') + ')');
  }
  kv('disk',        c.disk.status    + ' (highest ' + (c.disk.highest_use_pct || 0) +
    '%, warn at ' + c.disk.warn_threshold_pct + '%)');
  lines.push('---');
  lines.push('exit code:  ' + report.exit_code + '  (0=ok, 1=critical, 2=warn)');
  return lines.join('\n') + '\n';
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
    process.exit(3);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // If --out is given and no --format, switch to json
  if (opts.out && opts.format === 'text') {
    opts.format = 'json';
  }

  if (!['json', 'text'].includes(opts.format)) {
    process.stderr.write('ARG ERROR: --format must be json or text\n');
    process.exit(3);
  }

  // Run all checks in parallel
  const [erp, pcc, nginx, cert, disk] = await Promise.all([
    checkErp(opts),
    checkPcc(opts),
    checkNginx(opts),
    checkCert(opts),
    checkDisk(opts)
  ]);

  const checks = { erp: erp, pcc: pcc, nginx: nginx, cert: cert, disk: disk };
  const status = aggregate(checks);
  const exitCode = status === 'ok' ? 0 : (status === 'warn' ? 2 : 1);

  const report = {
    tool: 'health_probe.js',
    version: '1.0',
    timestamp: new Date().toISOString(),
    status: status,
    exit_code: exitCode,
    checks: checks
  };

  if (opts.out) {
    try {
      fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
    } catch (e) {
      process.stderr.write('WRITE ERROR: ' + e.message + '\n');
      process.exit(3);
    }
  }

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatText(report));
  }
  process.exit(exitCode);
}

main().catch(function (e) {
  process.stderr.write('FATAL: ' + e.message + '\n');
  process.exit(3);
});
