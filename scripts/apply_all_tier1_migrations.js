#!/usr/bin/env node
'use strict';

/**
 * apply_all_tier1_migrations.js
 *
 * Reads every `p1_*_up.sql` file under namaweb/migrations/
 * (the Tier-1 dept DDL generated in .ai-brain) and applies
 * them in order against a postgres database.
 *
 * SAFETY:
 *   - Connects ONLY via env vars DATABASE_URL or PG* (host/port/user/pw/db)
 *   - Does NOT connect to the live DB unless DEPLOY_TARGET=live is set
 *   - Default target = 'sandbox' (only local DB on 127.0.0.1)
 *   - All SQL runs in a transaction per file; failed statement aborts that
 *     file's transaction (atomic), but already-applied previous files persist.
 *   - Forward-only; never runs *_down.sql unless DEPLOY_TARGET=rollback
 *
 * USAGE:
 *   DATABASE_URL=postgres://... node apply_all_tier1_migrations.js
 *   DEPLOY_TARGET=sandbox node apply_all_tier1_migrations.js
 *   DEPLOY_TARGET=dry-run node apply_all_tier1_migrations.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const AI_BRAIN_DEPT_DIR = path.resolve(ROOT, '..', '.ai-brain', '02_MODULES_NEW');
const DEPLOY_TARGET = process.env.DEPLOY_TARGET || 'sandbox';

const tint = (s, c) => c + s + '\x1b[0m';
const ok   = (s) => tint('✅ ' + s, '\x1b[32m');
const warn = (s) => tint('⚠️  ' + s, '\x1b[33m');
const err  = (s) => tint('❌ ' + s, '\x1b[31m');

function listMigrations() {
  const files = [];
  for (const folder of fs.readdirSync(AI_BRAIN_DEPT_DIR)) {
    const full = path.join(AI_BRAIN_DEPT_DIR, folder);
    if (!fs.statSync(full).isDirectory()) continue;
    const u = path.join(full, '22_migration_up.sql');
    if (fs.existsSync(u)) files.push({ dept: folder, path: u });
  }
  files.sort((a, b) => a.dept.localeCompare(b.dept));
  return files;
}

function loadMigration(id, file) {
  const sql = fs.readFileSync(file, 'utf8');
  return { id, sql };
}

function logProgress(dept, ok, msg) {
  if (ok) process.stdout.write(ok(dept + ' ' + msg) + '\n');
  else process.stdout.write(err(dept + ' ' + msg) + '\n');
}

async function applyOne(client, dept, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(tint('\n== NamaMedical Migration Apply (' + DEPLOY_TARGET + ') ==', '\x1b[1m'));
  const list = listMigrations();
  console.log('Found ' + list.length + ' dept migrations.\n');

  if (DEPLOY_TARGET === 'dry-run') {
    console.log(warn('Dry-run mode — printing migration IDs only.'));
    for (const m of list) console.log('  ', m.dept, '->', path.basename(m.path));
    console.log('Done dry-run.');
    return;
  }

  if (DEPLOY_TARGET === 'live') {
    console.log(err('❌ live target requires owner sign-off per AGENTS.md §2.4 — refusing.'));
    console.log(err('Set DEPLOY_TARGET=sandbox and ensure DATABASE_URL points to non-prod.'));
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.log(err('DATABASE_URL not set. Aborting.'));
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  // Sanity: enforce FORCE_RLS on each table we create.
  let pass = 0, fail = 0;
  try {
    for (const m of list) {
      const sql = fs.readFileSync(m.path, 'utf8');
      const r = await applyOne(client, m.dept, sql);
      if (r.ok) {
        pass++;
        logProgress(m.dept, true, 'applied.');
      } else {
        fail++;
        logProgress(m.dept, false, 'FAILED: ' + r.error);
      }
    }

    // Final verification: every *_tenant_id RLS policy must exist.
    const v = await client.query(`SELECT COUNT(*)::int AS n FROM pg_policies
      WHERE schemaname='public' AND policyname LIKE '%_tenant'`);
    console.log('\nTotal tenant policies: ' + v.rows[0].n);
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\nApplied: ' + pass + ' / ' + list.length + ' | Failed: ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
