/**
 * billing_tables_candidate_static_test.js
 * ============================================================================
 * Static SQL Safety Analyzer for e26 Billing Table Migrations
 * ============================================================================
 * SAFE-BY-DESIGN: Does NOT connect to any database.
 * Analyzes SQL contents using static string and regex audits.
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Jumanasoft Billing Tables Static SQL Safety Tests...');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const UP_FILE = path.join(MIGRATIONS_DIR, 'e26_billing_tables_candidate_up.sql');
const DOWN_FILE = path.join(MIGRATIONS_DIR, 'e26_billing_tables_candidate_down.sql');
const VALIDATE_FILE = path.join(MIGRATIONS_DIR, 'e26_billing_tables_candidate_validate.sql');

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

    // 1. Files existence
    test('Should verify migration files exist', () => {
        assert.ok(fs.existsSync(UP_FILE), 'Up migration file is missing.');
        assert.ok(fs.existsSync(DOWN_FILE), 'Down migration file is missing.');
        assert.ok(fs.existsSync(VALIDATE_FILE), 'Validate file is missing.');
    });

    const upContent = fs.readFileSync(UP_FILE, 'utf8');
    const downContent = fs.readFileSync(DOWN_FILE, 'utf8');
    const validateContent = fs.readFileSync(VALIDATE_FILE, 'utf8');

    // 2. Up migration restrictions
    test('Up migration should not contain DROP, TRUNCATE, or DELETE statements', () => {
        const lower = upContent.toLowerCase();
        assert.ok(!lower.includes('drop '), 'Up SQL contains DROP statement.');
        assert.ok(!lower.includes('truncate '), 'Up SQL contains TRUNCATE statement.');
        assert.ok(!lower.includes('delete '), 'Up SQL contains DELETE statement.');
    });

    // 3. Sensitive columns ban
    test('Up migration should not contain sensitive fields (card_number, cvv, cvc, raw_secret)', () => {
        const lower = upContent.toLowerCase();
        const sensitiveTokens = ['card_number', 'cvv', 'cvc', 'raw_secret', 'secret_key', 'private_key'];
        for (const token of sensitiveTokens) {
            assert.ok(!lower.includes(token), `Up SQL contains sensitive token: ${token}`);
        }
    });

    // 4. Presence of tenant_id in tables
    test('Up migration must define tenant_id for tenant-scoped tables', () => {
        // Find tables defined and verify tenant_id presence
        const tables = [
            'saas_billing_customers',
            'saas_billing_subscriptions',
            'saas_billing_checkout_sessions',
            'saas_billing_payment_transactions',
            'saas_billing_audit_events'
        ];
        
        // Split content by CREATE TABLE
        const blocks = upContent.split(/CREATE TABLE IF NOT EXISTS/i);
        
        for (const tableName of tables) {
            // Find block for this table
            const block = blocks.find(b => b.trim().toLowerCase().startsWith(tableName.toLowerCase()));
            assert.ok(block, `Table ${tableName} definition not found in up migration.`);
            assert.ok(block.toLowerCase().includes('tenant_id'), `Table ${tableName} is missing tenant_id column.`);
        }
    });

    // 5. RLS checks
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

    // 6. Validation query check
    test('Validation query should verify all_ok', () => {
        assert.ok(validateContent.toLowerCase().includes('all_ok'), 'Validation query is missing all_ok select alias.');
    });

    // 7. No hardcoded credentials
    test('Should verify no hardcoded passwords or connection strings are present', () => {
        const allContent = upContent + downContent + validateContent;
        const secretKeywords = ['password=', 'passwd=', 'mongodb://', 'postgres://', 'mysql://', 'bearer '];
        for (const kw of secretKeywords) {
            assert.ok(!allContent.toLowerCase().includes(kw), `SQL contains potential credential pattern: ${kw}`);
        }
    });

    console.log(`\nStatic SQL Safety Tests Finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runStaticTests();
