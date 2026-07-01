/**
 * billing_adapter_test.js
 * ============================================================================
 * Unit tests for Jumanasoft Billing Adapter (Design-Only / Safe)
 * ============================================================================
 */
'use strict';

const assert = require('assert');
const { BillingAdapter, BillingError } = require('./billing_adapter');

console.log('Running Jumanasoft Billing Adapter Safety Unit Tests...');

async function runTests() {
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

    async function testAsync(name, fn) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name} failed:`, err.message);
            failed++;
        }
    }

    // 1. Validate Provider
    test('Should reject unsupported providers', () => {
        assert.throws(() => new BillingAdapter('unknown_gateway'), (err) => {
            return err instanceof BillingError && err.code === 'INVALID_PROVIDER';
        });
    });

    test('Should accept supported providers (mock)', () => {
        const adapter = new BillingAdapter('mock');
        assert.strictEqual(adapter.provider, 'mock');
    });

    test('Should accept supported providers case-insensitively (Stripe)', () => {
        const adapter = new BillingAdapter('STRIPE');
        assert.strictEqual(adapter.provider, 'stripe');
    });

    // 2. Customer validation
    await testAsync('Should reject customer creation without tenant_id', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCustomerCandidate({ email: 'test@example.com' }),
            (err) => err instanceof BillingError && err.code === 'MISSING_TENANT_ID'
        );
    });

    await testAsync('Should reject customer creation with invalid email', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCustomerCandidate({ tenantId: 101, email: 'invalid-email' }),
            (err) => err instanceof BillingError && err.code === 'INVALID_EMAIL'
        );
    });

    await testAsync('Should succeed customer creation in mock mode with correct parameters', async () => {
        const adapter = new BillingAdapter('mock');
        const res = await adapter.createCustomerCandidate({ tenantId: 101, email: 'tenant@example.com' });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.live, false);
        assert.strictEqual(res.provider_mode, 'mock');
        assert.strictEqual(res.activation_required, true);
    });

    // 3. Checkout Session Validation
    await testAsync('Should reject checkout session without tenant_id', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({ planKey: 'enterprise', amount: 500, currency: 'SAR', idempotencyKey: 'idemp-1' }),
            (err) => err instanceof BillingError && err.code === 'MISSING_TENANT_ID'
        );
    });

    await testAsync('Should reject checkout session without plan_key', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({ tenantId: 101, amount: 500, currency: 'SAR', idempotencyKey: 'idemp-2' }),
            (err) => err instanceof BillingError && err.code === 'MISSING_PLAN_KEY'
        );
    });

    await testAsync('Should reject checkout session without idempotency_key', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({ tenantId: 101, planKey: 'growth', amount: 200, currency: 'SAR' }),
            (err) => err instanceof BillingError && err.code === 'MISSING_IDEMPOTENCY_KEY'
        );
    });

    await testAsync('Should reject negative amount in checkout', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({ tenantId: 101, planKey: 'growth', amount: -50, currency: 'SAR', idempotencyKey: 'idemp-3' }),
            (err) => err instanceof BillingError && err.code === 'INVALID_AMOUNT'
        );
    });

    await testAsync('Should reject unsupported currency', async () => {
        const adapter = new BillingAdapter('mock');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({ tenantId: 101, planKey: 'growth', amount: 150, currency: 'EUR', idempotencyKey: 'idemp-4' }),
            (err) => err instanceof BillingError && err.code === 'INVALID_PROVIDER' || err.code === 'INVALID_CURRENCY'
        );
    });

    await testAsync('Should generate mock session with live=false and mock url', async () => {
        const adapter = new BillingAdapter('mock');
        const res = await adapter.createCheckoutSessionCandidate({
            tenantId: 101,
            planKey: 'enterprise',
            amount: 1000,
            currency: 'SAR',
            idempotencyKey: 'idemp-5'
        });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.live, false);
        assert.strictEqual(res.provider_mode, 'mock');
        assert.ok(res.checkout_url.includes('mock-checkout'));
    });

    // 4. Real provider blockage
    await testAsync('Should block real providers (Stripe) from checkout sessions', async () => {
        const adapter = new BillingAdapter('stripe');
        await assert.rejects(
            adapter.createCheckoutSessionCandidate({
                tenantId: 101,
                planKey: 'enterprise',
                amount: 1000,
                currency: 'SAR',
                idempotencyKey: 'idemp-6'
            }),
            (err) => err instanceof BillingError && err.code === 'PROVIDER_NOT_CONFIGURED'
        );
    });

    await testAsync('Should block real providers (Moyasar) from subscription sessions', async () => {
        const adapter = new BillingAdapter('moyasar');
        await assert.rejects(
            adapter.createSubscriptionCandidate({ tenantId: 101, planKey: 'starter' }),
            (err) => err instanceof BillingError && err.code === 'PROVIDER_NOT_CONFIGURED'
        );
    });

    // 5. Webhook Validation
    await testAsync('Should parse webhooks with live=false', async () => {
        const adapter = new BillingAdapter('mock');
        const res = await adapter.parseWebhookCandidate('{"id": "evt_123"}', {});
        assert.strictEqual(res.live, false);
        assert.strictEqual(res.type, 'payment.succeeded');
    });

    await testAsync('Should return signature verification failure for real providers', async () => {
        const adapter = new BillingAdapter('stripe');
        const res = await adapter.verifyWebhookSignatureCandidate('{"id": "evt_123"}', 'sig_123', 'sec_123');
        assert.strictEqual(res.verified, false);
        assert.strictEqual(res.live, false);
        assert.ok(res.reason.includes('disabled'));
    });

    console.log(`\nBilling Adapter Unit Tests Finished: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
