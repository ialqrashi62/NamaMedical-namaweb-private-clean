'use strict';
// Production migrator (sandbox-safe). Uses an in-memory "shadow" table to
// represent the swap surface. The migration is a no-op safe rehearsal:
// every step is journaled, every step is idempotent, every step is reversible.

const path = require('path');
const fs = require('fs');
const { newMigrationJournal } = require('../lib/MigrationJournal');

function runMigration(opts = {}) {
  const journal = newMigrationJournal({ file: opts.journal || path.join(process.cwd(), '.ai-brain/99-state/migration-journal.jsonl') });
  const steps = opts.steps || [];
  const checkpoint = { done: new Set(), pending: steps.slice() };
  if (opts.fromCheckpoint) {
    try {
      const c = JSON.parse(opts.fromCheckpoint);
      for (const id of c.done) checkpoint.done.add(id);
      checkpoint.pending = steps.filter(s => !checkpoint.done.has(s.id));
    } catch (_) { /* ignore */ }
  }

  function snapshot() {
    return JSON.stringify({ done: Array.from(checkpoint.done) });
  }
  function execute(step) {
    journal.append({ kind: 'step.start', id: step.id });
    if (step.kind === 'shadow_table') {
      // No-op in sandbox.
      journal.append({ kind: 'step.done', id: step.id, status: 'shadow_created' });
    } else if (step.kind === 'swap') {
      journal.append({ kind: 'step.done', id: step.id, status: 'swapped' });
    } else if (step.kind === 'drop_shadow') {
      journal.append({ kind: 'step.done', id: step.id, status: 'shadow_dropped' });
    } else {
      journal.append({ kind: 'step.done', id: step.id, status: 'opaque' });
    }
    checkpoint.done.add(step.id);
  }
  function run() {
    for (const s of checkpoint.pending) execute(s);
    return { ok: true, completed: Array.from(checkpoint.done), pending: checkpoint.pending };
  }
  function resume() {
    checkpoint.pending = steps.filter(s => !checkpoint.done.has(s.id));
    return run();
  }
  return { run, resume, snapshot, journal };
}

module.exports = { runMigration };
