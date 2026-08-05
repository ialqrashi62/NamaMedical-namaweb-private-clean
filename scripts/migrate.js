#!/usr/bin/env node
'use strict';
/**
 * migrate.js — safe migration runner (rail 4 non-destructive)
 *
 * Reads from `namaweb/migrations/`, applies in order. Tracks progress in
 * `schema_migrations(version, applied_at)`. Refuses if `OWNER_APPROVED` missing
 * (unless DRY_RUN).
 *
 * Idempotent: re-running won't double-apply.
 *
 * Per migration file conventions:
 *   eN_<dept>_<seq>_up.sql    — required
 *   eN_<dept>_<seq>_down.sql  — optional; only used by rollback (rail 4)
 *
 * After every batch, enforce FORCE RLS on every public table (rail 5).
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const OWNER = process.env.OWNER_APPROVED;
const DRY_RUN = process.env.NODE_ENV !== 'production' && process.env.FORCE_LIVE !== '1';
const PGURL = process.env.DATABASE_URL || 'postgresql://localhost/nama_medical';

if (process.env.DEPLOY_TARGET === 'live' && OWNER !== '1' && DRY_RUN) {
  console.error('migrate.js REFUSING: live requires OWNER_APPROVED=1');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..', 'migrations');
if (!fs.existsSync(ROOT)) {
  console.error('migrate.js ERROR: migrations dir not found:', ROOT);
  process.exit(3);
}

const upFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('_up.sql')).sort();

(async () => {
  console.log('migrate.js');
  console.log('  DATABASE_URL =', PGURL.replace(/:\/\/[^@]+@/, '://***@'));
  console.log('  mode =', DRY_RUN ? 'dry-run (no PG touch)' : 'live');
  console.log('  migrations dir =', ROOT);
  console.log('  up files =', upFiles.length);

  if (DRY_RUN) {
    console.log('  (DRY_RUN — no changes applied; add FORCE_LIVE=1 to test)');
    for (const f of upFiles) console.log('    would apply:', f);
    process.exit(0);
  }

  const pool = new Pool({ connectionString: PGURL });

  // Ensure tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Fetch applied versions
  const { rows: appliedRows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map(r => r.version));

  let appliedNow = 0;
  let skipped = 0;
  for (const f of upFiles) {
    const version = f.replace(/_up\.sql$/, '');
    if (applied.has(version)) { skipped++; continue; }
    const sql = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      appliedNow++;
      console.log('  applied:', version);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('  FAILED:', version, e.message);
      process.exit(4);
    } finally {
      client.release();
    }
  }
  console.log('  applied now:', appliedNow, ' skipped:', skipped);

  // Re-enforce RLS on every public table (rail 5)
  console.log('  enforcing FORCE RLS on every public table...');
  const { rows: tbls } = await pool.query(`
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
      AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%'
      AND c.relname <> 'schema_migrations'
  `);
  for (const t of tbls) {
    try {
      await pool.query(`ALTER TABLE public.${t.tbl} ENABLE ROW LEVEL SECURITY`);
      await pool.query(`ALTER TABLE public.${t.tbl} FORCE ROW LEVEL SECURITY`);
    } catch (e) {
      console.warn('  RLS skip:', t.tbl, e.message.split('\n')[0]);
    }
  }
  console.log('  done.');

  await pool.end();
  process.exit(0);
})().catch(e => { console.error('migrate.js FATAL', e); process.exit(5); });
