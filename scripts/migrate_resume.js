'use strict';
// Resume a migration from a checkpoint. Re-uses runMigration with fromCheckpoint.

const path = require('path');
const fs = require('fs');
const { runMigration } = require('./migrate_prod');

function resume(opts = {}) {
  const cpPath = opts.checkpoint || path.join(process.cwd(), '.ai-brain/99-state/migration-checkpoint.json');
  if (!fs.existsSync(cpPath)) throw new Error('CHECKPOINT_MISSING');
  const cp = fs.readFileSync(cpPath, 'utf8');
  const m = runMigration({ steps: opts.steps, fromCheckpoint: cp });
  const result = m.run();
  fs.writeFileSync(cpPath, m.snapshot(), 'utf8');
  return result;
}

module.exports = { resume };
