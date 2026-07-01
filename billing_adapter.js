/**
 * billing_adapter.js
 * ============================================================================
 * Jumanasoft SaaS Billing Adapter Candidate (Design-Only / Mock-Only)
 * ============================================================================
 * SAFE-BY-DESIGN:
 * - Absolutely ZERO external HTTP calls.
 * - Absolutely ZERO Database connections or queries.
 * - Absolutely ZERO live provider keys or secrets required.
 * - Restrained to MockProvider only. Real providers always throw "not_configured".
 * ============================================================================
 */
'use strict';

const SUPPORTED_CURRENCIES = ['SAR', 'USD'];
const SUPPORTED_PROVIDERS = ['mock', 'stripe', 'moyasar', 'hyperpay'];

class BillingError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'BillingError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Validate currency
 */
function validateCurrency(currency) {
    if (!currency || !SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
        throw new BillingError(
            'INVALID_CURRENCY',
            `Currency "${currency}" is not supported. Allowed: ${SUPPORTED_CURRENCIES.join(', ')}`
        );
    }
}

/**
 * Validate amount
 */
function validateAmount(amount) {
    if (amount === undefined || typeof amount !== 'number' || amount < 0) {
        throw new BillingError(
            'INVALID_AMOUNT',
            `Amount must be a non-negative number. Got: ${amount}`
        );
    }
}

/**
 * Validate provider
 */
function validateProvider(provider) {
    if (!provider || !SUPPORTED_PROVIDERS.includes(provider.toLowerCase())) {
        throw new BillingError(
            'INVALID_PROVIDER',
            `Provider "${provider}" is not supported. Allowed: ${SUPPORTED_PROVIDERS.join(', ')}`
        );
    }
}

/**
 * Core operations for the Billing Adapter (Mock Strategy)
 */
class BillingAdapter {
    constructor(provider = 'mock') {
        validateProvider(provider);
        this.provider = provider.toLowerCase();
    }

    /**
     * Creates a customer object candidate for the tenant
     */
    async createCustomerCandidate({ tenantId, email }) {
        if (!tenantId) {
            throw new BillingError('MISSING_TENANT_ID', 'tenant_id is required for billing operations.');
        }
        if (!email || !email.includes('@')) {
            throw new BillingError('INVALID_EMAIL', 'A valid email is required.');
        }

        // Mock simulation
        return {
            success: true,
            tenant_id: tenantId,
            email: email,
            provider_customer_id: `cus_mock_${tenantId}_${Date.now()}`,
            live: false,
            activation_required: true,
            provider_mode: 'mock'
        };
    }

    /**
     * Creates a checkout session candidate
     */
    async createCheckoutSessionCandidate({ tenantId, planKey, amount, currency, idempotencyKey }) {
        if (!tenantId) {
            throw new BillingError('MISSING_TENANT_ID', 'tenant_id is required for checkout.');
        }
        if (!planKey) {
            throw new BillingError('MISSING_PLAN_KEY', 'plan_key is required for subscription checkout.');
        }
        if (!idempotencyKey) {
            throw new BillingError('MISSING_IDEMPOTENCY_KEY', 'idempotency_key is required for billing checkout sessions.');
        }
        validateAmount(amount);
        validateCurrency(currency);

        if (this.provider !== 'mock') {
            throw new BillingError(
                'PROVIDER_NOT_CONFIGURED',
                `Real provider "${this.provider}" is disabled. Integration is candidate-only.`,
                { provider: this.provider }
            );
        }

        // Return Mock URL internally
        const mockSessionId = `sess_mock_${tenantId}_${Math.random().toString(36).substring(2, 10)}`;
        return {
            success: true,
            session_id: mockSessionId,
            checkout_url: `https://www.jumanasoft.com/api/billing/mock-checkout?session_id=${mockSessionId}&tenant_id=${tenantId}`,
            amount: amount,
            currency: currency,
            live: false,
            activation_required: true,
            provider_mode: 'mock'
        };
    }

    /**
     * Creates a subscription candidate
     */
    async createSubscriptionCandidate({ tenantId, planKey }) {
        if (!tenantId) {
            throw new BillingError('MISSING_TENANT_ID', 'tenant_id is required for subscription.');
        }
        if (!planKey) {
            throw new BillingError('MISSING_PLAN_KEY', 'plan_key is required.');
        }

        if (this.provider !== 'mock') {
            throw new BillingError(
                'PROVIDER_NOT_CONFIGURED',
                `Subscription logic for "${this.provider}" requires live keys and real staging.`
            );
        }

        return {
            success: true,
            subscription_id: `sub_mock_${tenantId}_${Date.now()}`,
            status: 'active',
            plan_key: planKey,
            live: false,
            activation_required: true,
            provider_mode: 'mock'
        };
    }

    /**
     * Webhook parsing candidate
     */
    async parseWebhookCandidate(rawBody, headers) {
        if (!rawBody) {
            throw new BillingError('MISSING_WEBHOOK_BODY', 'rawBody is required for webhook parsing.');
        }

        // Just returns structured mock wrapper
        return {
            event_id: `evt_mock_${Math.random().toString(36).substring(2, 10)}`,
            type: 'payment.succeeded',
            provider: this.provider,
            live: false,
            payload: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
        };
    }

    /**
     * Webhook verification candidate (Mock returns safe dummy check)
     */
    async verifyWebhookSignatureCandidate(rawBody, signature, secret) {
        if (this.provider !== 'mock') {
            return {
                verified: false,
                reason: `Verification for "${this.provider}" is disabled. Live provider keys are blocked.`,
                live: false
            };
        }

        // Mock verification is always true for tests if parameters are provided
        if (!rawBody || !signature) {
            return { verified: false, reason: 'Missing rawBody or signature', live: false };
        }

        return {
            verified: true,
            reason: 'Mock webhook verified successfully (safe sandbox mode)',
            live: false
        };
    }
}

module.exports = {
    BillingAdapter,
    BillingError,
    SUPPORTED_CURRENCIES,
    SUPPORTED_PROVIDERS
};
