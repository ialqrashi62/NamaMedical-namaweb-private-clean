/**
 * e3_migrations_guard_test.js  (DB-free static; run: node e3_migrations_guard_test.js)
 * ==========================================================================
 * Asserts the E3 migration trios are idempotent + canonical FORCE-RLS shape:
 *   - up: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, ENABLE+FORCE RLS,
 *         DROP POLICY IF EXISTS + CREATE POLICY (canonical tenant_id predicate),
 *         CREATE INDEX IF NOT EXISTS (incl. tenant_id index), wrapped in BEGIN/COMMIT.
 *   - down: drops its own policy + indexes + (table or added columns), IF EXISTS.
 *   - validate: read-only SELECT (no DDL/DML).
 * Exit non-zero on any failure.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'migrations');

let passed = 0, failed = 0;
const fails = [];
function chk(name, cond) {
    if (cond) { passed++; console.log('  PASS — ' + name); }
    else { failed++; fails.push(name); console.log('  FAIL — ' + name); }
}
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const CANON = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer";

console.log('\n=== E3 migrations idempotency + RLS guard (static) ===\n');

// ---------- e3_01 lab_samples (fresh CREATE TABLE) ----------
console.log('[1] e3_01 lab_samples');
{
    const up = read('e3_01_lab_samples_up.sql');
    const down = read('e3_01_lab_samples_down.sql');
    const val = read('e3_01_lab_samples_validate.sql');
    chk('up CREATE TABLE IF NOT EXISTS', up.includes('CREATE TABLE IF NOT EXISTS lab_samples'));
    chk('up tenant_id NOT NULL FK tenants', /tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up));
    chk('up ENABLE + FORCE RLS', up.includes('ENABLE ROW LEVEL SECURITY') && up.includes('FORCE ROW LEVEL SECURITY'));
    chk('up DROP POLICY IF EXISTS', up.includes('DROP POLICY IF EXISTS rls_lab_samples_tenant_isolation'));
    chk('up canonical RLS predicate', up.includes(CANON));
    chk('up tenant_id index', up.includes('idx_lab_samples_tenant_id'));
    chk('up per-tenant unique barcode', up.includes('uq_lab_samples_tenant_barcode'));
    chk('up state CHECK idempotent (DROP+ADD)', up.includes('DROP CONSTRAINT IF EXISTS chk_lab_samples_state') && up.includes('ADD CONSTRAINT chk_lab_samples_state'));
    // state set must list ONLY reachable states; the unreachable 'Verified' was removed (no transition reaches it).
    chk('up state CHECK lists reachable states', /state IN \('Collected','Received','InProcess','Reported','Rejected'\)/.test(up));
    // assert against the actual CHECK clauses (state IN (...)) only — comments may still mention the word.
    const stateCheckClauses = up.match(/state IN \([^)]*\)/g) || [];
    chk("up state CHECK clause(s) no longer list 'Verified'", stateCheckClauses.length > 0 && stateCheckClauses.every(c => !c.includes("'Verified'")));
    chk('up wrapped BEGIN/COMMIT', up.trim().startsWith('--') && up.includes('BEGIN;') && up.trim().endsWith('COMMIT;'));
    chk('down DROP POLICY IF EXISTS', down.includes('DROP POLICY IF EXISTS rls_lab_samples_tenant_isolation'));
    chk('down drops its indexes', down.includes('DROP INDEX IF EXISTS uq_lab_samples_tenant_barcode') && down.includes('DROP INDEX IF EXISTS idx_lab_samples_tenant_id'));
    chk('down DROP TABLE IF EXISTS', down.includes('DROP TABLE IF EXISTS lab_samples'));
    chk('validate read-only (no DDL/DML)', !/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(val.replace(/--.*$/gm, '')));
}

// ---------- e3_02 lab_results (ADDITIVE: existing table augmented) ----------
console.log('[2] e3_02 lab_results (+ lab_critical_callbacks)');
{
    const up = read('e3_02_lab_results_up.sql');
    const down = read('e3_02_lab_results_down.sql');
    const val = read('e3_02_lab_results_validate.sql');
    chk('up CREATE TABLE IF NOT EXISTS (base)', up.includes('CREATE TABLE IF NOT EXISTS lab_results'));
    chk('up additive ADD COLUMN IF NOT EXISTS', up.includes('ADD COLUMN IF NOT EXISTS tenant_id') && up.includes('ADD COLUMN IF NOT EXISTS loinc'));
    chk('up structured cols present', ['lab_sample_id','abnormal_flag','delta_pct','is_critical','verified_by','status'].every(c => up.includes('ADD COLUMN IF NOT EXISTS ' + c)));
    chk('up FK guarded by DO-block', up.includes('fk_lab_results_tenant') && up.includes('IF NOT EXISTS'));
    chk('up NOT NULL only when no NULL rows (fail-safe)', up.includes('IF NOT EXISTS (SELECT 1 FROM lab_results WHERE tenant_id IS NULL)'));
    chk('up ENABLE + FORCE RLS', up.includes('ENABLE ROW LEVEL SECURITY') && up.includes('FORCE ROW LEVEL SECURITY'));
    chk('up canonical RLS predicate', up.includes(CANON));
    chk('up tenant_id index', up.includes('idx_lab_results_tenant_id'));
    chk('up status CHECK idempotent', up.includes('DROP CONSTRAINT IF EXISTS chk_lab_results_status') && up.includes('ADD CONSTRAINT chk_lab_results_status'));
    // callbacks child table
    chk('up callbacks table', up.includes('CREATE TABLE IF NOT EXISTS lab_critical_callbacks'));
    chk('up callbacks tenant NOT NULL FK', /tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up));
    chk('up callbacks FORCE RLS + policy', up.includes('rls_lab_callbacks_tenant_isolation'));
    // down: must NOT drop the pre-existing lab_results table; only added cols + child table
    chk('down does NOT DROP TABLE lab_results', !down.includes('DROP TABLE IF EXISTS lab_results'));
    chk('down DROP child table callbacks', down.includes('DROP TABLE IF EXISTS lab_critical_callbacks'));
    chk('down drops added columns', down.includes('DROP COLUMN IF EXISTS loinc') && down.includes('DROP COLUMN IF EXISTS tenant_id'));
    chk('down drops policy + indexes', down.includes('DROP POLICY IF EXISTS rls_lab_results_tenant_isolation') && down.includes('DROP INDEX IF EXISTS idx_lab_results_tenant_id'));
    chk('validate read-only', !/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(val.replace(/--.*$/gm, '')));
}

// ---------- e3_03 lab_qc ----------
console.log('[3] e3_03 lab_qc');
{
    const up = read('e3_03_lab_qc_up.sql');
    const down = read('e3_03_lab_qc_down.sql');
    const val = read('e3_03_lab_qc_validate.sql');
    chk('up CREATE TABLE IF NOT EXISTS', up.includes('CREATE TABLE IF NOT EXISTS lab_qc'));
    chk('up tenant_id NOT NULL FK', /tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up));
    chk('up ENABLE + FORCE RLS', up.includes('ENABLE ROW LEVEL SECURITY') && up.includes('FORCE ROW LEVEL SECURITY'));
    chk('up canonical RLS predicate', up.includes(CANON));
    chk('up tenant_id index', up.includes('idx_lab_qc_tenant_id'));
    chk('down drops policy/indexes/table IF EXISTS', down.includes('DROP POLICY IF EXISTS rls_lab_qc_tenant_isolation') && down.includes('DROP INDEX IF EXISTS idx_lab_qc_tenant_id') && down.includes('DROP TABLE IF EXISTS lab_qc'));
    chk('validate read-only', !/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(val.replace(/--.*$/gm, '')));
}

// ---------- global: no production-destructive RLS weakening in up files ----------
console.log('[4] no RLS weakening in up migrations');
['e3_01_lab_samples_up.sql','e3_02_lab_results_up.sql','e3_03_lab_qc_up.sql'].forEach(f => {
    const up = read(f);
    chk(f + ' has no NO FORCE / DISABLE RLS', !up.includes('NO FORCE ROW LEVEL SECURITY') && !up.includes('DISABLE ROW LEVEL SECURITY'));
});

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) console.log('FAILURES:\n  - ' + fails.join('\n  - '));
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exit(failed ? 1 : 0);
