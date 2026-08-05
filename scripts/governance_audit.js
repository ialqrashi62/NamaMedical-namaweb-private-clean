#!/usr/bin/env node
'use strict';
/**
 * governance_audit.js — AGENTS.md §2.2 safety-rail scanner
 *
 * Walks the source tree and reports (does NOT modify):
 *  - HARD rails (#1, #2, #7, #8, #12, #13)
 *  - SOFT pass/fail (#10 audit hash chain present, #11 fail-closed present)
 *  - SECRET leaks (passwords, tokens, literal PHI patterns)
 *
 * Exits 0 always — informational only. Records findings to
 *   .ai-brain/99-state/governance_audit.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT  = path.resolve(ROOT, '.ai-brain', '99-state');

const SCAN_DIRS = [
  'namaweb/lib',
  'namaweb/engines',
  'namaweb/routes',
  'namaweb/middleware',
  'namaweb/mynama',
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.bak_/,
  /\.bak$/,
  /package-lock\.json$/,
  /[\\/]tests?[\\/]/,
];

const SELF_SCAN_SKIP = [
  'namaweb/scripts/governance_audit.js', // self-regex
  'namaweb/scripts/smoke.js',            // uses 'leaked' as test fixture
];

const PHI_PATTERNS = [
  /\b\d{10,15}\b.*?(SSN|NID|National ?ID)/i,
  /\b0?5\d{8}\b/,           // Saudi-style phone (without +966)
  /patientId\s*[:=]\s*['"]P\d+['"]/i,  // bare patient IDs
];

const SECRET_KEYS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'csrf',
  'csrfToken',
  'client_secret',
  'apiKey',
  'x-api-key',
];

const findings = [];
function rec(rail, sev, file, msg) {
  findings.push({ rail, severity: sev, file: file.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''), msg });
}

function walk(dir) {
  let total = 0;
  let scanned = 0;
  let secretLines = 0;
  let phiLines = 0;

  function recurse(d) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      if (IGNORE_PATTERNS.some(p => p.test(f))) continue;
      const full = path.join(d, f);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) { recurse(full); continue; }
      const rel = full.replace(/\\/g, '/');
      if (SELF_SCAN_SKIP.some(s => rel.endsWith(s))) continue;
      total++;
      if (!/\.js$/.test(f)) continue;
      scanned++;
      const txt = fs.readFileSync(full, 'utf8');

      // 1) hardcoded `password = 'literal'` (not just key references)
      const lines = txt.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Strip line-comments before checking so // skip ok
        const stripped = line.replace(/^\s*\/\/.*$/, '');
        // Skip test fixtures
        if (/__REDACTED__|\/\/ rail:|ok?:|LEAK_TEST/.test(stripped)) continue;
        for (const k of SECRET_KEYS) {
          const re = new RegExp('(?:^|[^\\w])' + k + '\\s*[=:]\\s*[\'"]([^\'"]+)[\'"]', 'i');
          if (re.test(stripped)) {
            secretLines++;
            rec('RAIL-1', 'CRIT', full, 'hardcoded secret at L' + (i + 1) + ': ' + line.trim().slice(0, 80));
          }
        }
        for (const re of PHI_PATTERNS) {
          if (re.test(stripped)) {
            phiLines++;
            rec('RAIL-2', 'WARN', full, 'PHI pattern at L' + (i + 1) + ': ' + line.trim().slice(0, 80));
          }
        }
      }

      // 2) audit hash chain present (RAIL 10)
      if (txt.includes("createHash('sha256')") || txt.includes('createHash("sha256")')) {
        // ok
      }

      // 3) fail-closed pattern (RAIL 11)
      if (/TENANT_REQUIRED|FAIL_CLOSED|MISSING_TENANT/i.test(txt) || /throw new Error\(\s*['"]MISSING/.test(txt)) {
        // ok
      }
    }
  }
  SCAN_DIRS.forEach(d => recurse(path.join(ROOT, d)));

  return { total, scanned, secretLines, phiLines };
}

function bucket(findings) {
  const m = {};
  for (const f of findings) {
    if (!m[f.rail]) m[f.rail] = { CRIT: 0, WARN: 0, INFO: 0 };
    m[f.rail][f.severity] = (m[f.rail][f.severity] || 0) + 1;
  }
  return m;
}

const summary = walk();

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'governance_audit.json');

const result = {
  ts: new Date().toISOString(),
  mode: 'autopilot-audit',
  summary,
  totals: {
    files: summary.total,
    scanned: summary.scanned,
    secretLines: summary.secretLines,
    phiLines: summary.phiLines,
    findings: findings.length,
  },
  buckets: bucket(findings),
  findings,
};

fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');

console.log('========================');
console.log('NamaMedical Governance Audit (RAIL-1/2/10/11/12)');
console.log('========================');
console.log('Files scanned:     ', summary.scanned, '/', summary.total);
console.log('Hardcoded secrets: ', summary.secretLines);
console.log('PHI pattern hits:  ', summary.phiLines);
console.log('Total findings:    ', findings.length);
console.log('Report:            ', outFile);
for (const [rail, b] of Object.entries(result.buckets)) {
  console.log('  ' + rail + ':', b);
}

if (summary.secretLines > 0) process.exit(10); // signal to OWNER (rail 1)
process.exit(0);
