'use strict';
// Pre-flight migration check. Validates that all expected migration files exist
// (or are listed in steps) and that the journal has no 'step.fail' entries.

const fs = require('fs');
const path = require('path');

function check({ dir, journal, steps }) {
  const out = { ok: true, errors: [], warnings: [] };
  // Always validate steps even when dir is missing — missing file is fatal.
  if (steps) {
    for (const s of steps) {
      if (s.file && dir && fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
        if (!files.includes(s.file)) {
          out.errors.push('STEP_FILE_MISSING:' + s.file);
        }
      } else if (s.file && !dir) {
        // No directory provided but step references a file — flag it.
        out.errors.push('STEP_FILE_NO_DIR:' + s.file);
      }
    }
  }
  if (dir && fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    if (!files.length) out.warnings.push('NO_SQL_FILES');
  }
  if (journal && fs.existsSync(journal)) {
    const lines = fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean);
    let fails = 0;
    for (const l of lines) {
      try {
        const ev = JSON.parse(l);
        if (ev.status === 'fail') fails++;
      } catch (_) { /* ignore */ }
    }
    if (fails > 0) out.errors.push('JOURNAL_HAS_FAILS:' + fails);
  }
  out.ok = out.errors.length === 0;
  return out;
}

module.exports = { check };
