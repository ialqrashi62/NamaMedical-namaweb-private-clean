#!/usr/bin/env node
'use strict';
// migrate_audit.js — produce a SHA-256 checksum manifest for every migration
// file in namaweb/migrations/. Optionally compare against a previous
// checksum file to detect drift.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', 'migrations');
const OUT = path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'migration_audit.json');

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8')).digest('hex');
}

function auditDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...auditDir(full));
    } else if (f.endsWith('_up.sql') || f.endsWith('_down.sql')) {
      out.push({ file: f, full, sha256: hashFile(full), size: st.size, mtime: st.mtime.toISOString() });
    }
  }
  return out;
}

const entries = auditDir(ROOT).sort((a, b) => a.file.localeCompare(b.file));

const report = {
  ts: new Date().toISOString(),
  count: entries.length,
  upCount: entries.filter(e => e.file.endsWith('_up.sql')).length,
  downCount: entries.filter(e => e.file.endsWith('_down.sql')).length,
  rootDir: ROOT,
  entries,
};

// Optional comparison with previous report
const PREV = path.resolve(__dirname, '..', '..', '.ai-brain', '99-state', 'migration_audit.prev.json');
if (process.argv[2] === '--compare' && fs.existsSync(PREV)) {
  const prev = JSON.parse(fs.readFileSync(PREV, 'utf8'));
  const drift = [];
  const prevMap = new Map(prev.entries.map(e => [e.file, e.sha256]));
  for (const e of entries) {
    if (prevMap.has(e.file) && prevMap.get(e.file) !== e.sha256) drift.push({ file: e.file, prevSha: prevMap.get(e.file), newSha: e.sha256 });
    prevMap.delete(e.file);
  }
  for (const leftover of prevMap.keys()) drift.push({ file: leftover, removed: true });
  report.drift = drift;
  console.log('Drift count:', drift.length);
  for (const d of drift) console.log('  ', d);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log('Migration audit written:', OUT);
console.log('  count:', report.count, ' (up=' + report.upCount + ' down=' + report.downCount + ')');
process.exit(0);
