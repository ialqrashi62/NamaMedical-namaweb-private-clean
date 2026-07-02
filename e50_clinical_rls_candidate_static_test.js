/**
 * e50_clinical_rls_candidate_static_test.js
 * Static SQL safety analyzer for the e50 clinical-metadata RLS candidate migrations.
 * SAFE-BY-DESIGN: does NOT connect to any DB or execute any SQL — string/regex audits only.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function test(name, fn) {
    try { fn(); console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
    catch (e) { console.log(`  ${RED}FAIL${RESET} ${name} | ${e.message}`); failed++; fails.push(name); }
}

console.log(`${BOLD}e50 clinical RLS candidate — static SQL safety test${RESET}\n`);

const DIR = path.join(__dirname, 'migrations');
const UP = path.join(DIR, 'e50_clinical_rls_candidate_up.sql');
const DOWN = path.join(DIR, 'e50_clinical_rls_candidate_down.sql');
const VAL = path.join(DIR, 'e50_clinical_rls_candidate_validate.sql');

test('all three migration files exist', () => {
    assert.ok(fs.existsSync(UP), 'up missing');
    assert.ok(fs.existsSync(DOWN), 'down missing');
    assert.ok(fs.existsSync(VAL), 'validate missing');
});

const up = fs.readFileSync(UP, 'utf8');
const down = fs.readFileSync(DOWN, 'utf8');
const val = fs.readFileSync(VAL, 'utf8');

test('e50 prefix does not collide with another migration family', () => {
    const others = fs.readdirSync(DIR).filter(f => f.startsWith('e50_') && !f.includes('clinical_rls_candidate'));
    assert.strictEqual(others.length, 0, `prefix collision: ${others.join(', ')}`);
});

test('UP contains NO destructive DROP TABLE / TRUNCATE / DELETE', () => {
    assert.ok(!/\bDROP\s+TABLE\b/i.test(up), 'UP must not DROP TABLE');
    assert.ok(!/\bTRUNCATE\b/i.test(up), 'UP must not TRUNCATE');
    assert.ok(!/\bDELETE\s+FROM\b/i.test(up), 'UP must not DELETE');
});

test('UP wraps work in a transaction', () => {
    assert.ok(/^\s*BEGIN;/im.test(up) && /COMMIT;/i.test(up), 'UP must BEGIN/COMMIT');
});

test('UP enables FORCE RLS on patient_clinical_records (PHI) with a tenant policy', () => {
    assert.ok(/patient_clinical_records\s+FORCE ROW LEVEL SECURITY/i.test(up), 'FORCE RLS missing on PHI table');
    assert.ok(/CREATE POLICY rls_patient_clinical_records/i.test(up), 'policy missing');
    assert.ok(/rls_patient_clinical_records[\s\S]*current_setting\('app\.tenant_id'/i.test(up), 'policy must bind app.tenant_id');
});

test('UP enables FORCE RLS on clinical_templates and makes tenant_id NOT NULL', () => {
    assert.ok(/clinical_templates\s+FORCE ROW LEVEL SECURITY/i.test(up));
    assert.ok(/clinical_templates ALTER COLUMN tenant_id SET NOT NULL/i.test(up));
    assert.ok(/CREATE POLICY rls_clinical_templates/i.test(up));
});

test('UP backfills tenant_id from parent department (no blind DEFAULT 1)', () => {
    assert.ok(/UPDATE clinical_templates[\s\S]*SET tenant_id = d\.tenant_id/i.test(up), 'templates backfill from dept');
    assert.ok(!/DEFAULT\s+1\b/i.test(up), 'must not silently default tenant to 1');
});

test('UP fails loudly on unresolved tenant_id rather than mis-assigning', () => {
    assert.ok(/RAISE EXCEPTION[\s\S]*unresolved tenant_id/i.test(up), 'must RAISE on orphan tenant');
});

test('UP replaces global UNIQUE(code) with per-tenant UNIQUE(tenant_id, code)', () => {
    assert.ok(/UNIQUE \(tenant_id, code\)/i.test(up), 'per-tenant unique missing');
    assert.ok(/uq_clinical_dept_tenant_code/i.test(up));
});

test('all RLS policies use both USING and WITH CHECK (write-path protected)', () => {
    const policyBlocks = up.match(/CREATE POLICY[\s\S]*?;/gi) || [];
    assert.ok(policyBlocks.length >= 3, 'expected >=3 policies');
    for (const b of policyBlocks) {
        assert.ok(/USING \(/i.test(b) && /WITH CHECK \(/i.test(b), `policy missing USING/WITH CHECK: ${b.slice(0, 60)}`);
    }
});

test('DOWN reverses every policy/constraint the UP adds', () => {
    assert.ok(/DROP POLICY IF EXISTS rls_patient_clinical_records/i.test(down));
    assert.ok(/DROP POLICY IF EXISTS rls_clinical_templates/i.test(down));
    assert.ok(/DROP CONSTRAINT IF EXISTS fk_pcr_tenant/i.test(down));
    assert.ok(/uq_clinical_dept_tenant_code/i.test(down));
});

test('VALIDATE asserts FORCE RLS on the PHI table and per-tenant unique', () => {
    assert.ok(/relforcerowsecurity[\s\S]*patient_clinical_records/i.test(val));
    assert.ok(/uq_clinical_dept_tenant_code/i.test(val));
});

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
