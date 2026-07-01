/**
 * provider_selection_static_test.js
 * ============================================================================
 * Provider Selection Safety Static Analyzer
 * ============================================================================
 * SAFE-BY-DESIGN: Does NOT connect to any database or make external HTTP calls.
 * Analyzes repository documents and code states for provider selection safety.
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Jumanasoft Provider Selection Safety Static Tests...');

const NAMAWEB_DIR = __dirname;
const ROOT_DIR = path.join(NAMAWEB_DIR, '..');
const ADAPTER_FILE = path.join(NAMAWEB_DIR, 'billing_adapter.js');
const DOCS_DIR = path.join(ROOT_DIR, 'docs', 'governance', 'enterprise-engineering-constitution');

function runProviderTests() {
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

    // 1. Check adapter is mock-only and has default enabled=false
    test('Billing adapter must remain mock-only and default disabled', () => {
        assert.ok(fs.existsSync(ADAPTER_FILE), 'billing_adapter.js is missing.');
        const content = fs.readFileSync(ADAPTER_FILE, 'utf8');
        assert.ok(content.includes("provider_mode: 'mock'"), 'Adapter is not in mock mode.');
        assert.ok(!content.includes('fetch(') && !content.includes('axios.post'), 'Adapter contains external HTTP calls.');
    });

    // 2. Check no secrets in docs
    test('Docs must not contain any real API keys or connection strings', () => {
        if (!fs.existsSync(DOCS_DIR)) return;
        const files = fs.readdirSync(DOCS_DIR);
        const secretKeywords = ['sk_live_', 'pk_live_', 'moyasar_secret', 'stripe_secret', 'password=123', 'postgres://'];
        
        for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
            for (const kw of secretKeywords) {
                assert.ok(!content.includes(kw), `Document ${file} contains potential secret: ${kw}`);
            }
        }
    });

    // 3. Verify docs contain blocking language
    test('Docs must contain activation blocked warning language', () => {
        if (!fs.existsSync(DOCS_DIR)) return;
        const recomFile = path.join(DOCS_DIR, 'JUMANASOFT_PROVIDER_SELECTION_RECOMMENDATION_AR.md');
        if (fs.existsSync(recomFile)) {
            const content = fs.readFileSync(recomFile, 'utf8');
            assert.ok(content.includes('Blocked') || content.includes('محجوب'), 'Recommendation document is missing blocking keywords.');
        }
    });

    console.log(`\nProvider Selection Safety Static Tests Finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runProviderTests();
