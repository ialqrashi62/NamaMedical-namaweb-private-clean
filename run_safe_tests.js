/**
 * run_safe_tests.js — runs ONLY the DB-free unit tests (no database/server/network), so it is safe to
 * run anywhere (local dev machine where the only DB is production, or CI with no DB). Complements
 * run_all_tests.js (which needs a provisioned DB for the cross-tenant/RLS/e2e integration tests).
 *
 * A test is treated as DB/server-dependent (and SKIPPED here) if it statically references the DB layer,
 * pg, the server, http, or a spawned process. Everything else is a pure unit test and is executed.
 *
 * Safety net: DB_NAME is pointed at a non-existent guard database and PGCONNECT_TIMEOUT is tiny, so if
 * a test were ever mis-classified it fails fast against a non-existent DB instead of touching production.
 *
 * Exit code 0 only if every executed test passes.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const DB_SIGNALS = /require\(['"]\.\/(db_postgres|database)['"]\)|require\(['"]pg['"]\)|require\(['"]\.\/server['"]\)|require\(['"]http['"]\)|require\(['"]supertest['"]\)|\bpool\b|withTenant|tenantStore|initDatabase|spawn|app\.listen|http:\/\/localhost|127\.0\.0\.1/;

const all = fs.readdirSync(dir).filter(f => f.endsWith('_test.js') && f !== 'run_safe_tests.js');
const safe = [], skipped = [];
for (const f of all) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    (DB_SIGNALS.test(src) ? skipped : safe).push(f);
}

// Shield: any accidental DB connection hits a non-existent DB, never production.
const env = { ...process.env, DB_NAME: 'nama_safe_guard_nonexistent', PGDATABASE: 'nama_safe_guard_nonexistent', PGCONNECT_TIMEOUT: '2', NODE_ENV: 'test' };

console.log(`run_safe_tests: ${safe.length} DB-free tests to run, ${skipped.length} skipped (need DB/server).`);
let passed = 0, failed = 0; const failures = [];
for (const f of safe) {
    try {
        execFileSync(process.execPath, [f], { cwd: dir, env, stdio: 'pipe', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
        passed++;
    } catch (e) {
        failed++; failures.push(f);
        const tail = String((e.stdout || '') + (e.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' | ');
        console.error(`FAIL  ${f}  [Err: ${e.message}]  ${tail}`);
    }
}
console.log(`\nrun_safe_tests: ${passed} passed, ${failed} failed (of ${safe.length}).`);
if (skipped.length) console.log(`skipped (need provisioned DB): ${skipped.length} — run via run_all_tests.js on an isolated DB.`);
process.exit(failed === 0 ? 0 : 1);
