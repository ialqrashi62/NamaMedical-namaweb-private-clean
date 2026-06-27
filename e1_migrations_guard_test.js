/**
 * e1_migrations_guard_test.js — E1 migrations: RLS / tenant_id / idempotency static assertions.
 * No DB. Run: node e1_migrations_guard_test.js
 *
 * Asserts the e1_01_problems_* and e1_02_clinical_notes_* trios follow the EXACT canonical FORCE-RLS
 * template (matches the existing 150 policies + ex_01_orders): tenant_id NOT NULL REFERENCES tenants(id),
 * ENABLE + FORCE ROW LEVEL SECURITY, the standard isolation policy
 *   USING/WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer),
 * idx_*_tenant_id, idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), wrapped in BEGIN/COMMIT,
 * down drops policy + table, validate checks FORCE RLS + policy + FK + NOT NULL.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const read = (f) => fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8');

const CANON_POLICY = /USING \(tenant_id = NULLIF\(current_setting\('app\.tenant_id', true\), ''\)::integer\)/;
const CANON_CHECK = /WITH CHECK \(tenant_id = NULLIF\(current_setting\('app\.tenant_id', true\), ''\)::integer\)/;

function assertUp(file, table, policy, idx) {
    const s = read(file);
    ok(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`).test(s), `${file}: CREATE TABLE IF NOT EXISTS ${table} (idempotent)`);
    ok(/tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(s), `${file}: tenant_id INTEGER NOT NULL REFERENCES tenants(id)`);
    ok(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`).test(s), `${file}: ENABLE ROW LEVEL SECURITY`);
    ok(new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`).test(s), `${file}: FORCE ROW LEVEL SECURITY`);
    ok(new RegExp(`DROP POLICY IF EXISTS ${policy} ON ${table}`).test(s), `${file}: DROP POLICY IF EXISTS (idempotent)`);
    ok(new RegExp(`CREATE POLICY ${policy} ON ${table}`).test(s), `${file}: CREATE POLICY ${policy}`);
    ok(CANON_POLICY.test(s), `${file}: canonical USING isolation predicate`);
    ok(CANON_CHECK.test(s), `${file}: canonical WITH CHECK isolation predicate`);
    ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx} ON ${table} \\(tenant_id\\)`).test(s), `${file}: idx_*_tenant_id (idempotent)`);
    ok(/^BEGIN;/m.test(s) && /COMMIT;/m.test(s), `${file}: wrapped in BEGIN/COMMIT`);
    ok(/CANDIDATE ONLY/.test(s), `${file}: marked CANDIDATE ONLY (no auto-exec)`);
}

function assertDown(file, table, policy) {
    const s = read(file);
    ok(new RegExp(`DROP POLICY IF EXISTS ${policy} ON ${table}`).test(s), `${file}: DROP POLICY IF EXISTS`);
    ok(new RegExp(`DROP TABLE IF EXISTS ${table}`).test(s), `${file}: DROP TABLE IF EXISTS (idempotent)`);
    ok(/^BEGIN;/m.test(s) && /COMMIT;/m.test(s), `${file}: wrapped in BEGIN/COMMIT`);
}

function assertValidate(file, table, policy) {
    const s = read(file);
    ok(new RegExp(`relforcerowsecurity FROM pg_class WHERE relname='${table}'`).test(s), `${file}: validates FORCE RLS`);
    ok(new RegExp(`policyname='${policy}'`).test(s), `${file}: validates isolation policy present`);
    ok(/confrelid='tenants'::regclass AND contype='f'/.test(s), `${file}: validates FK to tenants`);
    ok(new RegExp(`table_name='${table}' AND column_name='tenant_id' AND is_nullable='NO'`).test(s), `${file}: validates tenant_id NOT NULL`);
}

// ----- problems trio -----
assertUp('e1_01_problems_up.sql', 'problems', 'rls_problems_tenant_isolation', 'idx_problems_tenant_id');
assertDown('e1_01_problems_down.sql', 'problems', 'rls_problems_tenant_isolation');
assertValidate('e1_01_problems_validate.sql', 'problems', 'rls_problems_tenant_isolation');
// problems-specific: status CHECK + idempotent DROP/ADD
(() => {
    const s = read('e1_01_problems_up.sql');
    ok(/CHECK \(status IN \('active', 'resolved'\)\)/.test(s), 'e1_01: status CHECK (active/resolved)');
    ok(/ALTER TABLE problems DROP CONSTRAINT IF EXISTS chk_problems_status/.test(s), 'e1_01: idempotent DROP/ADD status CHECK');
})();

// ----- clinical_notes trio -----
assertUp('e1_02_clinical_notes_up.sql', 'clinical_notes', 'rls_clinical_notes_tenant_isolation', 'idx_clinical_notes_tenant_id');
assertDown('e1_02_clinical_notes_down.sql', 'clinical_notes', 'rls_clinical_notes_tenant_isolation');
assertValidate('e1_02_clinical_notes_validate.sql', 'clinical_notes', 'rls_clinical_notes_tenant_isolation');
// notes-specific: SOAP cols + sign/lock cols + CHECKs
(() => {
    const s = read('e1_02_clinical_notes_up.sql');
    ok(/subjective TEXT/.test(s) && /objective TEXT/.test(s) && /assessment TEXT/.test(s) && /plan TEXT/.test(s), 'e1_02: SOAP columns present');
    ok(/emr_status TEXT NOT NULL DEFAULT 'draft'/.test(s) && /integrity_hash TEXT/.test(s) && /signed_at TIMESTAMP/.test(s), 'e1_02: sign/lock columns (mirror medical_records)');
    ok(/CHECK \(type IN \('SOAP'\)\)/.test(s), 'e1_02: type CHECK (SOAP)');
    ok(/CHECK \(emr_status IN \('draft', 'locked'\)\)/.test(s), 'e1_02: emr_status CHECK (draft/locked)');
})();

// ----- encounter_ref nullable on both (no encounters table; mirrors orders.encounter_id) -----
(() => {
    const p = read('e1_01_problems_up.sql'), n = read('e1_02_clinical_notes_up.sql');
    ok(/encounter_ref INTEGER,/.test(p) && !/encounter_ref INTEGER NOT NULL/.test(p), 'e1_01: encounter_ref nullable');
    ok(/encounter_ref INTEGER,/.test(n) && !/encounter_ref INTEGER NOT NULL/.test(n), 'e1_02: encounter_ref nullable');
})();

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
