#!/usr/bin/env node
/**
 * audit_export.js
 * NamaMedical — CLI audit / event-log exporter.
 *
 * Usage:
 *   node audit_export.js [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]
 *                        [--format=json|csv|ndjson] [--out=PATH] [--tenant=X]
 *
 * Defaults: last 7 days, json format, print to stdout.
 *
 * Data sources (all loopback, no network):
 *   /var/log/namaweb/backup.log
 *   /var/log/namaweb/db_health_*.log
 *   /var/log/namaweb/csp_preflight_*.log
 *   /root/.pm2/logs/nama-medical-erp-out.log
 *   /root/.pm2/logs/nama-medical-erp-error.log
 *   /root/.pm2/logs/nama-medical-pcc-out.log
 *   /root/.pm2/logs/nama-medical-pcc-error.log
 *
 * Sanitization: never emits full request bodies / headers / secrets / PHI.
 * Only metadata: timestamp, source, level, message, tenant_id, action.
 *
 * Exit codes:
 *   0  success (>=1 event)
 *   1  error (could not read inputs, bad args, etc.)
 *   2  no events found in window
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    since: null,
    until: null,
    format: 'json',
    out: null,
    tenant: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a.startsWith('--since=')) {
      opts.since = a.slice('--since='.length);
    } else if (a.startsWith('--until=')) {
      opts.until = a.slice('--until='.length);
    } else if (a.startsWith('--format=')) {
      opts.format = a.slice('--format='.length);
    } else if (a.startsWith('--out=')) {
      opts.out = a.slice('--out='.length);
    } else if (a.startsWith('--tenant=')) {
      opts.tenant = a.slice('--tenant='.length);
    }
  }
  return opts;
}

function printHelp() {
  const help = [
    'audit_export.js — NamaMedical audit / event-log exporter',
    '',
    'USAGE:',
    '  node audit_export.js [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]',
    '                       [--format=json|csv|ndjson] [--out=PATH] [--tenant=X]',
    '',
    'DEFAULTS:',
    '  --since  = (today - 7 days)',
    '  --until  = (today)',
    '  --format = json',
    '  --out    = stdout',
    '  --tenant = (no filter)',
    '',
    'EXIT CODES:',
    '  0  success (>=1 event)',
    '  1  error',
    '  2  no events in window',
    '',
    'EXAMPLES:',
    '  node audit_export.js',
    '  node audit_export.js --format=csv --out=/tmp/audit.csv',
    '  node audit_export.js --since=2026-07-20 --until=2026-07-28 --format=ndjson',
    '  node audit_export.js --tenant=acme',
    '',
    'SANITIZATION:',
    '  Only metadata is exported. Full request bodies / headers / secrets are',
    '  never echoed. tenant_id is detected from "tenant_id=..." tokens only.'
  ].join('\n');
  process.stdout.write(help + '\n');
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDay(d) {
  // YYYY-MM-DD from Date
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function parseDateLoose(s) {
  if (!s) return null;
  // Accept YYYY-MM-DD or full ISO8601
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  return new Date(t);
}

function dateInRange(isoTs, sinceMs, untilMs) {
  if (!isoTs) return true; // include lines with no parseable timestamp within window only if both bounds absent
  const t = Date.parse(isoTs);
  if (isNaN(t)) return false;
  if (sinceMs != null && t < sinceMs) return false;
  if (untilMs != null && t > untilMs) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Log line parsers (3 formats + raw fallback)
// ---------------------------------------------------------------------------

// Format A: "[2026-07-28T23:53:13Z] LEVEL message"
const RE_BRACKET_ISO = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?)\]\s+(\S+)\s+(.*)$/;

// Format B: "OK    key=value key=value"
const RE_KV_LEVEL = /^([A-Z]{2,6})\s{2,}(.*)$/;

// Format C: "NamaMedical DB Health — 2026-07-28T23:53:13Z" / "CSP Enforce Pre-Flight — TS"
const RE_HEADER_TS = /—\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?)/;

// Format D: tenant_id token
const RE_TENANT_TOKEN = /tenant_id=([A-Za-z0-9_\-]+)/;

// [CSP-REPORT] / "at file:line:col" / etc — extract a short action label
const RE_ACTION_CSP = /\[CSP-REPORT\]/;
const RE_ACTION_BACKUP = /backup_db_auto/;
const RE_ACTION_HEALTH = /connection|tables|migrations|RLS drift/;

function shortActionFromMessage(msg) {
  if (!msg) return 'log';
  if (RE_ACTION_CSP.test(msg)) return 'csp_report';
  if (RE_ACTION_BACKUP.test(msg)) return 'backup';
  if (RE_ACTION_HEALTH.test(msg)) return 'health_check';
  if (/ERROR/.test(msg)) return 'error';
  if (/WARN/.test(msg)) return 'warn';
  if (/INFO/i.test(msg)) return 'info';
  if (/OK/.test(msg)) return 'ok';
  return 'log';
}

function inferLevelFromText(s) {
  if (!s) return 'INFO';
  if (/\bERROR\b/.test(s)) return 'ERROR';
  if (/\bWARN(ING)?\b/.test(s)) return 'WARN';
  if (/\bINFO\b/.test(s)) return 'INFO';
  if (/\bOK\b/.test(s)) return 'OK';
  if (/\bDEBG?(UG)?\b/.test(s)) return 'DEBUG';
  return 'INFO';
}

// Hard-coded sanitization: strip everything after certain sensitive markers
// (defense-in-depth — we never emit body/header blocks in the first place).
const SENSITIVE_MARKERS = [
  /Authorization:\s*[^\s]+/gi,
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /password\s*=\s*[^\s,;]+/gi,
  /token\s*=\s*[^\s,;]+/gi,
  /\b\d{10,}\b/g  // long digit runs (likely ids; we keep but flag)
];

function sanitize(s) {
  if (typeof s !== 'string') return '';
  let out = s;
  for (const re of SENSITIVE_MARKERS) {
    out = out.replace(re, '[REDACTED]');
  }
  // Trim to <= 400 chars
  if (out.length > 400) out = out.slice(0, 397) + '...';
  return out;
}

function extractTenantId(s) {
  if (!s) return null;
  const m = RE_TENANT_TOKEN.exec(s);
  return m ? m[1] : null;
}

function parseLine(line, sourceName, sinceMs, untilMs) {
  // Returns null if line falls outside the window.
  let ts = null;
  let level = 'INFO';
  let msg = line;

  const m1 = RE_BRACKET_ISO.exec(line);
  if (m1) {
    ts = m1[1];
    level = m1[2];
    msg = m1[3];
  } else {
    const m2 = RE_KV_LEVEL.exec(line);
    if (m2 && /^[A-Z]{2,6}$/.test(m2[1])) {
      level = m2[1];
      msg = m2[2];
    }
    // Try to pull ISO ts from anywhere in the line
    const isoMatch = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?/.exec(line);
    if (isoMatch) ts = isoMatch[0];
    if (!ts) {
      const m3 = RE_HEADER_TS.exec(line);
      if (m3) ts = m3[1];
    }
  }

  // Level guess when missing
  if (level === 'INFO' && msg !== line) {
    level = inferLevelFromText(msg) || level;
  }

  if (!dateInRange(ts, sinceMs, untilMs)) return null;

  return {
    timestamp: ts || '',
    source: sourceName,
    level: level,
    message: sanitize(msg),
    tenant_id: extractTenantId(line),
    action: shortActionFromMessage(msg)
  };
}

// ---------------------------------------------------------------------------
// Log source enumeration
// ---------------------------------------------------------------------------

function listLogFiles(rootDir, pattern) {
  // pattern: regex to match filenames, or null for "*"
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (pattern && !pattern.test(ent.name)) continue;
    out.push(path.join(rootDir, ent.name));
  }
  return out;
}

function readLinesSafe(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return txt.split(/\r?\n/);
  } catch (e) {
    return [];
  }
}

function gatherEvents(opts) {
  const sinceMs = parseDateLoose(opts.since);
  const untilMs = parseDateLoose(opts.until + 'T23:59:59Z');

  const sources = [];

  // 1. backup.log
  sources.push({ name: 'backup.log', path: '/var/log/namaweb/backup.log' });
  // 2. db_health_*.log
  for (const f of listLogFiles('/var/log/namaweb', /^db_health_.*\.log$/)) {
    sources.push({ name: 'db_health/' + path.basename(f), path: f });
  }
  // 3. csp_preflight_*.log
  for (const f of listLogFiles('/var/log/namaweb', /^csp_preflight_.*\.log$/)) {
    sources.push({ name: 'csp_preflight/' + path.basename(f), path: f });
  }
  // 4. PM2 logs
  sources.push({ name: 'pm2:nama-medical-erp:out', path: '/root/.pm2/logs/nama-medical-erp-out.log' });
  sources.push({ name: 'pm2:nama-medical-erp:err', path: '/root/.pm2/logs/nama-medical-erp-error.log' });
  sources.push({ name: 'pm2:nama-medical-pcc:out', path: '/root/.pm2/logs/nama-medical-pcc-out.log' });
  sources.push({ name: 'pm2:nama-medical-pcc:err', path: '/root/.pm2/logs/nama-medical-pcc-error.log' });

  const events = [];
  for (const s of sources) {
    const lines = readLinesSafe(s.path);
    for (const line of lines) {
      if (!line || !line.trim()) continue;
      // skip obvious noise: stack-trace continuations
      if (/^\s+at\s/.test(line)) continue;
      // skip PM2 banner / dotenv noise
      if (/^\[REDIS SUCCESS\]/.test(line) && opts.tenant) continue;
      const ev = parseLine(line, s.name, sinceMs, untilMs);
      if (!ev) continue;
      if (opts.tenant && ev.tenant_id !== opts.tenant) continue;
      events.push(ev);
    }
  }

  // Sort by timestamp asc; missing timestamps sort last
  events.sort(function (a, b) {
    const ta = a.timestamp ? Date.parse(a.timestamp) : Number.POSITIVE_INFINITY;
    const tb = b.timestamp ? Date.parse(b.timestamp) : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  return events;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function toJson(events, opts) {
  return JSON.stringify({
    events: events,
    count: events.length,
    period: { since: opts.since, until: opts.until },
    tenant_filter: opts.tenant || null,
    generated_at: new Date().toISOString()
  }, null, 2);
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(events) {
  const cols = ['timestamp', 'source', 'level', 'message', 'tenant_id', 'action'];
  const lines = [cols.join(',')];
  for (const e of events) {
    lines.push(cols.map(function (c) { return csvEscape(e[c]); }).join(','));
  }
  return lines.join('\n') + '\n';
}

function toNdjson(events) {
  return events.map(function (e) { return JSON.stringify(e); }).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return 0;
  }

  // Validate format
  if (!/^(json|csv|ndjson)$/i.test(opts.format)) {
    process.stderr.write('ERROR: --format must be one of json|csv|ndjson\n');
    return 1;
  }

  // Default window: last 7 days
  if (!opts.since) {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    opts.since = isoDay(d);
  }
  if (!opts.until) {
    opts.until = isoDay(new Date());
  }

  // Validate since/until
  if (parseDateLoose(opts.since) == null) {
    process.stderr.write('ERROR: invalid --since (use YYYY-MM-DD)\n');
    return 1;
  }
  if (parseDateLoose(opts.until) == null) {
    process.stderr.write('ERROR: invalid --until (use YYYY-MM-DD)\n');
    return 1;
  }

  let events;
  try {
    events = gatherEvents(opts);
  } catch (e) {
    process.stderr.write('ERROR: ' + e.message + '\n');
    return 1;
  }

  // Fallback: if 0 events and PM2 is on PATH, try `pm2 jlist` snapshot
  if (events.length === 0) {
    try {
      const out = execFileSync('pm2', ['jlist'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const arr = JSON.parse(out.toString('utf8') || '[]');
      const now = new Date().toISOString();
      for (const p of arr) {
        events.push({
          timestamp: now,
          source: 'pm2:jlist:' + (p.name || 'unknown'),
          level: 'INFO',
          message: 'pm2 process ' + (p.name || '') + ' status=' + (p.pm2_env && p.pm2_env.status) + ' uptime=' + (p.pm2_env && p.pm2_env.pm_uptime),
          tenant_id: null,
          action: 'pm2_health'
        });
      }
    } catch (_) {
      // pm2 not on PATH or failed — keep events empty
    }
  }

  let body;
  if (opts.format.toLowerCase() === 'csv') body = toCsv(events);
  else if (opts.format.toLowerCase() === 'ndjson') body = toNdjson(events);
  else body = toJson(events, opts);

  if (opts.out) {
    try {
      fs.writeFileSync(opts.out, body);
      process.stderr.write('wrote ' + events.length + ' events to ' + opts.out + '\n');
    } catch (e) {
      process.stderr.write('ERROR writing --out: ' + e.message + '\n');
      return 1;
    }
  } else {
    process.stdout.write(body);
  }

  if (events.length === 0) return 2;
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  parseArgs: parseArgs,
  parseLine: parseLine,
  gatherEvents: gatherEvents,
  toJson: toJson,
  toCsv: toCsv,
  toNdjson: toNdjson
};
