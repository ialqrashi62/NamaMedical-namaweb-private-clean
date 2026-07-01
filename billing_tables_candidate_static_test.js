/**
 * billing_tables_candidate_static_test.js
 * ============================================================================
 * Hardened Static SQL Safety Analyzer for e47 Billing Table Migrations
 * ============================================================================
 * SAFE-BY-DESIGN: Does NOT connect to any database or execute any SQL.
 * Analyzes SQL contents using static string, regex, and file audits.
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Hardened Jumanasoft Billing Tables Static SQL Safety Tests...');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const TARGET_PREFIX = 'e47';
const UP_FILE = path.join(MIGRATIONS_DIR, `${TARGET_PREFIX}_billing_tables_candidate_up.sql`);
const DOWN_FILE = path.join(MIGRATIONS_DIR, `${TARGET_PREFIX}_billing_tables_candidate_down.sql`);
const VALIDATE_FILE = path.join(MIGRATIONS_DIR, `${TARGET_PREFIX}_billing_tables_candidate_validate.sql`);

function runStaticTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name} failed:`, err.message);
            failed++;
        }
    }

    // 1. Files existence & Naming Alignment
    test('Should verify migration files exist and use aligned e47 prefix', () => {
        assert.ok(fs.existsSync(UP_FILE), 'Up migration file is missing.');
        assert.ok(fs.existsSync(DOWN_FILE), 'Down migration file is missing.');
        assert.ok(fs.existsSync(VALIDATE_FILE), 'Validate file is missing.');
        assert.ok(path.basename(UP_FILE).startsWith(TARGET_PREFIX), 'Filename does not start with target prefix.');
    });

    const upContent = fs.readFileSync(UP_FILE, 'utf8');
    const downContent = fs.readFileSync(DOWN_FILE, 'utf8');
    const validateContent = fs.readFileSync(VALIDATE_FILE, 'utf8');

    // 2. Migration prefix collision detection
    test('Should detect and prevent migration prefix collisions', () => {
        const files = fs.readdirSync(MIGRATIONS_DIR);
        // Find other files starting with the target prefix
        const duplicatePrefixFiles = files.filter(f => f.startsWith(`${TARGET_PREFIX}_`) && !f.includes('billing_tables_candidate'));
        assert.strictEqual(duplicatePrefixFiles.length, 0, `Prefix collision detected! Files with duplicate prefix: ${duplicatePrefixFiles.join(', ')}`);
    });

    // 3. Up migration restrictions (no DROP, TRUNCATE, DELETE)
    test('Up migration should not contain DROP, TRUNCATE, or DELETE statements', () => {
        const lower = upContent.toLowerCase();
        assert.ok(!lower.includes('drop '), 'Up SQL contains DROP statement.');
        assert.ok(!lower.includes('truncate '), 'Up SQL contains TRUNCATE statement.');
        assert.ok(!lower.includes('delete '), 'Up SQL contains DELETE statement.');
    });

    // 4. Sensitive columns ban (card number, cvv, secrets)
    test('Up migration should not contain sensitive fields (card_number, cvv, cvc, secrets)', () => {
        const lower = upContent.toLowerCase();
        const sensitiveTokens = ['card_number', 'cvv', 'cvc', 'raw_secret', 'secret_key', 'private_key'];
        for (const token of sensitiveTokens) {
            assert.ok(!lower.includes(token), `Up SQL contains sensitive token: ${token}`);
        }
    });

    // 5. Presence of tenant_id in tables
    test('Up migration must define tenant_id for tenant-scoped tables', () => {
        const tables = [
            'saas_billing_customers',
            'saas_billing_subscriptions',
            'saas_billing_checkout_sessions',
            'saas_billing_payment_transactions',
            'saas_billing_audit_events'
        ];
        
        const blocks = upContent.split(/CREATE TABLE IF NOT EXISTS/i);
        
        for (const tableName of tables) {
            const block = blocks.find(b => b.trim().toLowerCase().startsWith(tableName.toLowerCase()));
            assert.ok(block, `Table ${tableName} definition not found in up migration.`);
            assert.ok(block.toLowerCase().includes('tenant_id'), `Table ${tableName} is missing tenant_id column.`);
        }
    });

    // 6. RLS checks
    test('Up migration must enable and force Row Level Security (RLS) on tenant-scoped tables', () => {
        const tables = [
            'saas_billing_customers',
            'saas_billing_subscriptions',
            'saas_billing_checkout_sessions',
            'saas_billing_payment_transactions',
            'saas_billing_audit_events'
        ];
        
        for (const tableName of tables) {
            const enableRegex = new RegExp(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`, 'i');
            const forceRegex = new RegExp(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`, 'i');
            assert.ok(enableRegex.test(upContent), `ENABLE ROW LEVEL SECURITY statement not found for ${tableName}`);
            assert.ok(forceRegex.test(upContent), `FORCE ROW LEVEL SECURITY statement not found for ${tableName}`);
        }
    });

    // 7. Idempotency unique constraints
    test('Up migration must enforce unique constraints for idempotency keys', () => {
        // saas_billing_checkout_sessions and saas_billing_payment_transactions should have unique idempotency_key
        const lower = upContent.toLowerCase();
        assert.ok(lower.includes('idempotency_key varchar(255) unique not null'), 'idempotency_key unique constraint missing.');
    });

    // 8. Validation query check (all_ok)
    test('Validation query should verify all_ok', () => {
        assert.ok(validateContent.toLowerCase().includes('all_ok'), 'Validation query is missing all_ok select alias.');
    });

    // 9. Down migration rollback cascade safety
    test('Down migration must drop policies before tables and avoid unsafe cascades', () => {
        const lower = downContent.toLowerCase();
        // drop policy index should be before drop table index
        const policyIdx = lower.indexOf('drop policy');
        const tableIdx = lower.indexOf('drop table');
        assert.ok(policyIdx !== -1, 'DROP POLICY statement not found.');
        assert.ok(tableIdx !== -1, 'DROP TABLE statement not found.');
        assert.ok(policyIdx < tableIdx, 'Policies must be dropped before dropping tables.');
        assert.ok(!lower.includes('cascade'), 'Down SQL contains unsafe CASCADE keyword.');
    });

    // 10. No hardcoded credentials or external sandbox provider keys
    test('Should verify no hardcoded passwords, connection strings, or external API URLs are present', () => {
        const allContent = upContent + downContent + validateContent;
        const secretKeywords = ['password=', 'passwd=', 'mongodb://', 'postgres://', 'mysql://', 'bearer ', 'api.moyasar.com', 'api.stripe.com'];
        for (const kw of secretKeywords) {
            assert.ok(!allContent.toLowerCase().includes(kw), `SQL contains potential credential or external API pattern: ${kw}`);
        }
    });

    console.log(`\nHardened Static SQL Safety Tests Finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runStaticTests();
