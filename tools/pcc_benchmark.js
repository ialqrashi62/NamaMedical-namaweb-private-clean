#!/usr/bin/env node
/**
 * pcc_benchmark.js
 * NamaMedical ERP — PCC function-call latency benchmark.
 *
 * USAGE:
 *   node pcc_benchmark.js [--modules=20] [--iterations=5]
 *                         [--base-url=https://jumanasoft.com]
 *                         [--timeout=10000] [--format=json|text]
 *                         [--seed=12345]
 *   node pcc_benchmark.js --help
 *
 * BEHAVIOR:
 *   1. GET {base-url}/api/v1/pcc-catalog/modules  (auto-discover 789 modules)
 *   2. Pick N modules at random (seedable for reproducibility)
 *   3. For each module, GET {base-url}/api/v1/pcc-{dash-name}/list
 *      "iterations" times SEQUENTIALLY (no concurrency; avoid prod load)
 *   4. Compute p50 / p95 / p99 latency in ms; rank modules slowest-first
 *   5. Output as a single report (json or text)
 *
 * SAFETY RAILS:
 *   - Read-only: only GETs
 *   - No concurrency: sequential iterations
 *   - Default per-call timeout 10s; configurable
 *   - Default N=20 modules × 5 iter = 100 calls (small, safe)
 *   - The chosen base URL must resolve to either 127.0.0.1 (loopback)
 *     or jumanasoft.com (production) to discourage accidental targeting
 *     of arbitrary hosts. Override with --allow-remote-host (use with care).
 *
 * EXIT CODES:
 *   0  success
 *   1  argument / discovery error
 *   2  no modules benchmarked
 */

'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    modules: 20,
    iterations: 5,
    baseUrl: 'https://jumanasoft.com',
    timeout: 10000,
    format: 'text',
    seed: null,
    allowRemoteHost: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a.startsWith('--modules=')) {
      opts.modules = parseInt(a.slice('--modules='.length), 10);
    } else if (a.startsWith('--iterations=')) {
      opts.iterations = parseInt(a.slice('--iterations='.length), 10);
    } else if (a.startsWith('--base-url=')) {
      opts.baseUrl = a.slice('--base-url='.length);
    } else if (a.startsWith('--timeout=')) {
      opts.timeout = parseInt(a.slice('--timeout='.length), 10);
    } else if (a.startsWith('--format=')) {
      opts.format = a.slice('--format='.length);
    } else if (a.startsWith('--seed=')) {
      opts.seed = a.slice('--seed='.length);
    } else if (a === '--allow-remote-host') {
      opts.allowRemoteHost = true;
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }
  return opts;
}

function printHelp() {
  const help = [
    'pcc_benchmark.js — NamaMedical PCC latency benchmark',
    '',
    'USAGE:',
    '  node pcc_benchmark.js [--modules=20] [--iterations=5]',
    '                        [--base-url=https://jumanasoft.com]',
    '                        [--timeout=10000] [--format=json|text]',
    '                        [--seed=12345]',
    '',
    'OPTIONS:',
    '  --modules=N         number of modules to sample (default 20, max 789)',
    '  --iterations=N      calls per module (default 5)',
    '  --base-url=URL      catalog base URL (default https://jumanasoft.com)',
    '  --timeout=MS        per-call timeout in ms (default 10000)',
    '  --format=FORMAT     text (default) | json',
    '  --seed=STR          RNG seed for reproducible sampling',
    '  --allow-remote-host permit any base URL host (use with care)',
    '  --help, -h          show this help',
    '',
    'BEHAVIOR:',
    '  Discovers modules from /api/v1/pcc-catalog/modules, picks N at',
    '  random, then sequentially GETs each module\'s /list endpoint',
    '  "iterations" times. Reports p50 / p95 / p99 latency in ms and a',
    '  per-module table sorted slowest-first.',
    '',
    'EXIT CODES:',
    '  0  success',
    '  1  argument / discovery error',
    '  2  no modules benchmarked',
    '',
    'EXAMPLES:',
    '  node pcc_benchmark.js --modules=3 --iterations=2',
    '  node pcc_benchmark.js --modules=50 --format=json --seed=abc',
    '  node pcc_benchmark.js --base-url=http://127.0.0.1:3101',
    ''
  ].join('\n');
  process.stdout.write(help + '\n');
}

// ---------------------------------------------------------------------------
// HTTP helper (http or https, depending on URL)
// ---------------------------------------------------------------------------

function get(u, timeoutMs) {
  return new Promise(function (resolve) {
    const parsed = url.parse(u);
    const lib = parsed.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    const req = lib.request({
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.path,
      headers: {
        'User-Agent': 'namaweb-pcc-benchmark/1.0',
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const elapsed = Date.now() - t0;
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          elapsedMs: elapsed,
          size: chunks.reduce(function (s, c) { return s + c.length; }, 0),
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('timeout', function () {
      req.destroy(new Error('timeout after ' + timeoutMs + 'ms'));
    });
    req.on('error', function (err) {
      resolve({
        ok: false,
        status: 0,
        elapsedMs: Date.now() - t0,
        size: 0,
        body: '',
        error: err.message
      });
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Sampling — deterministic, seedable
// ---------------------------------------------------------------------------

function makeRng(seedStr) {
  // Use crypto.createHash for a small but uniform hash
  const seedBuf = crypto.createHash('sha256')
    .update(String(seedStr || Date.now()))
    .digest();
  let state = seedBuf.readUInt32LE(0) || 1;
  return function () {
    // mulberry32
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSample(arr, n, rng) {
  if (n >= arr.length) return arr.slice();
  // Partial Fisher-Yates
  const a = arr.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, n);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function pct(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.floor((p / 100) * sortedArr.length)
  );
  return sortedArr[idx];
}

function summarize(latencies) {
  const sorted = latencies.slice().sort(function (a, b) { return a - b; });
  return {
    count: sorted.length,
    min: sorted[0] || 0,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1] || 0,
    mean: sorted.length
      ? Math.round(sorted.reduce(function (s, v) { return s + v; }, 0) / sorted.length)
      : 0
  };
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

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!Number.isFinite(opts.modules) || opts.modules < 1) {
    process.stderr.write('ARG ERROR: --modules must be a positive integer\n');
    process.exit(1);
  }
  if (opts.modules > 789) {
    process.stderr.write('ARG ERROR: --modules cannot exceed 789 (catalog size)\n');
    process.exit(1);
  }
  if (!Number.isFinite(opts.iterations) || opts.iterations < 1) {
    process.stderr.write('ARG ERROR: --iterations must be a positive integer\n');
    process.exit(1);
  }
  if (!['json', 'text'].includes(opts.format)) {
    process.stderr.write('ARG ERROR: --format must be json or text\n');
    process.exit(1);
  }

  // Host safety: only allow jumanasoft.com or loopback unless explicitly allowed
  let base;
  try {
    base = url.parse(opts.baseUrl);
  } catch (e) {
    process.stderr.write('ARG ERROR: --base-url is not a valid URL\n');
    process.exit(1);
  }
  const host = (base.hostname || '').toLowerCase();
  const allowed = ['127.0.0.1', 'localhost', '::1', 'jumanasoft.com',
    'www.jumanasoft.com', 'alfaisal-erp.com', 'www.alfaisal-erp.com'];
  if (!opts.allowRemoteHost && !allowed.includes(host)) {
    process.stderr.write('SAFETY: base-url host "' + host +
      '" is not in the loopback/known-prod list. Re-run with --allow-remote-host' +
      ' to override.\n');
    process.exit(1);
  }

  // 1. Discover
  const catalogUrl = opts.baseUrl.replace(/\/+$/, '') +
    '/api/v1/pcc-catalog/modules';
  const t0 = Date.now();
  const catalogRes = await get(catalogUrl, opts.timeout);
  if (!catalogRes.ok) {
    process.stderr.write('DISCOVERY ERROR: ' + catalogUrl + ' returned ' +
      catalogRes.status + (catalogRes.error ? ' (' + catalogRes.error + ')' : '') + '\n');
    process.exit(1);
  }
  let catalog;
  try {
    catalog = JSON.parse(catalogRes.body);
  } catch (e) {
    process.stderr.write('DISCOVERY ERROR: invalid JSON from ' + catalogUrl + '\n');
    process.exit(1);
  }
  const allModules = catalog.modules || [];
  const discoverMs = Date.now() - t0;

  if (allModules.length === 0) {
    process.stderr.write('DISCOVERY ERROR: no modules in catalog\n');
    process.exit(1);
  }

  // 2. Sample
  const rng = makeRng(opts.seed);
  const sample = pickSample(allModules, opts.modules, rng);

  // 3. Benchmark sequentially
  const perModule = [];
  const allLatencies = [];
  for (const mod of sample) {
    // Module names like "pcc_billing" -> dash form: "pcc-billing"
    const dashName = mod.replace(/_/g, '-');
    const url = opts.baseUrl.replace(/\/+$/, '') +
      '/api/v1/' + dashName + '/list';
    const latencies = [];
    let firstErr = null;
    for (let i = 0; i < opts.iterations; i++) {
      const r = await get(url, opts.timeout);
      latencies.push(r.elapsedMs);
      if (!r.ok && !firstErr) {
        firstErr = 'HTTP ' + r.status + (r.error ? ' (' + r.error + ')' : '');
      }
      allLatencies.push(r.elapsedMs);
    }
    const stats = summarize(latencies);
    perModule.push({
      module: mod,
      url: url,
      ok_count: latencies.length - (firstErr ? 1 : 0),
      // Mark failures by inflating error flag; stats still computed
      error: firstErr,
      stats: stats
    });
  }

  // 4. Overall stats + slowest-first sort
  perModule.sort(function (a, b) { return b.stats.p95 - a.stats.p95; });
  const overall = summarize(allLatencies);
  const okModules = perModule.filter(function (m) { return !m.error; });

  const report = {
    base_url: opts.baseUrl,
    catalog_count: allModules.length,
    catalog_version: catalog.version || null,
    sampled: perModule.length,
    iterations: opts.iterations,
    total_calls: allLatencies.length,
    discovery_ms: discoverMs,
    timeout_ms: opts.timeout,
    seed: opts.seed || null,
    overall: overall,
    slowest_first: perModule
  };

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const lines = [];
    lines.push('=== PCC BENCHMARK ===');
    lines.push('base_url:        ' + report.base_url);
    lines.push('catalog:         ' + report.catalog_count + ' modules (' +
      (report.catalog_version || 'unknown') + ')');
    lines.push('sampled:         ' + report.sampled + ' × ' + report.iterations +
      ' iter = ' + report.total_calls + ' calls');
    lines.push('discovery_ms:    ' + report.discovery_ms);
    lines.push('timeout_ms:      ' + report.timeout_ms);
    lines.push('seed:            ' + (report.seed || '(auto)'));
    lines.push('---');
    lines.push('OVERALL  p50=' + overall.p50 + 'ms  p95=' + overall.p95 +
      'ms  p99=' + overall.p99 + 'ms  min=' + overall.min +
      'ms  max=' + overall.max + 'ms  mean=' + overall.mean + 'ms');
    lines.push('---');
    lines.push('PER MODULE (sorted slowest p95 first, error rows marked with *)');
    lines.push(
      padR('module', 32) +
      padL('p50(ms)', 8) +
      padL('p95(ms)', 8) +
      padL('p99(ms)', 8) +
      padL('max(ms)', 8) +
      padL('ok', 8) +
      '  status'
    );
    for (const m of perModule) {
      const tag = m.error ? '*' : ' ';
      lines.push(
        padR(m.module, 32) +
        padL(m.stats.p50, 8) +
        padL(m.stats.p95, 8) +
        padL(m.stats.p99, 8) +
        padL(m.stats.max, 8) +
        padL(m.ok_count + '/' + opts.iterations, 8) +
        '  ' + tag + (m.error || 'ok')
      );
    }
    lines.push('---');
    lines.push(okModules.length + '/' + perModule.length + ' modules returned HTTP <400');
    process.stdout.write(lines.join('\n') + '\n');
  }

  if (perModule.length === 0) {
    process.exit(2);
  }
  process.exit(0);
}

function padR(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}
function padL(s, n) {
  s = String(s);
  if (s.length >= n) return s; // already wide enough, no padding needed
  return ' '.repeat(n - s.length) + s;
}

main().catch(function (e) {
  process.stderr.write('FATAL: ' + e.message + '\n');
  process.exit(1);
});
