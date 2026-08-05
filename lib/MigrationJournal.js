'use strict';
// MigrationJournal — JSONL audit log of every migration step.
// Pure append-only. Each line is one event with timestamp + sha256 of the
// migration file + action + status.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function newMigrationJournal(opts = {}) {
  const file = opts.file || path.join(process.cwd(), '.ai-brain/99-state/migration-journal.jsonl');
  function _now() { return new Date().toISOString(); }
  function _sha256(p) {
    if (!fs.existsSync(p)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  function append(event) {
    const line = JSON.stringify({ t: _now(), ...event }) + '\n';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line, 'utf8');
    return line;
  }
  function read() {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  return { append, read, file, _sha256 };
}

module.exports = { newMigrationJournal };
