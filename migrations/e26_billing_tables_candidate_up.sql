-- Candidate Up Migration: Create SaaS Billing Tables
-- ============================================================================
-- SAFE-BY-DESIGN: Design-Only candidate. DO NOT execute in database.
-- ============================================================================
BEGIN;

-- 1. saas_billing_customers
CREATE TABLE IF NOT EXISTS saas_billing_customers (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_customer_id_hash VARCHAR(255) NOT NULL,
    billing_email_masked VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_provider UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_customers_tenant ON saas_billing_customers (tenant_id);

-- Enable RLS
ALTER TABLE saas_billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_billing_customers_policy ON saas_billing_customers
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);


-- 2. saas_billing_subscriptions
CREATE TABLE IF NOT EXISTS saas_billing_subscriptions (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    plan_key VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_subscription_id_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_subs_tenant ON saas_billing_subscriptions (tenant_id);

-- Enable RLS
ALTER TABLE saas_billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_billing_subscriptions_policy ON saas_billing_subscriptions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);


-- 3. saas_billing_checkout_sessions
CREATE TABLE IF NOT EXISTS saas_billing_checkout_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    plan_key VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    provider_session_id_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    amount_minor INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    expires_at TIMESTAMP NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_checkout_tenant ON saas_billing_checkout_sessions (tenant_id);

-- Enable RLS
ALTER TABLE saas_billing_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_checkout_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_checkout_sessions_policy ON saas_billing_checkout_sessions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);


-- 4. saas_billing_payment_transactions
CREATE TABLE IF NOT EXISTS saas_billing_payment_transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    provider_transaction_id_hash VARCHAR(255),
    amount_minor INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
    status VARCHAR(50) NOT NULL,
    payment_method_type VARCHAR(50),
    failure_code VARCHAR(100),
    failure_message_safe VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_tx_tenant ON saas_billing_payment_transactions (tenant_id);

-- Enable RLS
ALTER TABLE saas_billing_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_payment_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_payment_transactions_policy ON saas_billing_payment_transactions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);


-- 5. saas_billing_webhook_events
CREATE TABLE IF NOT EXISTS saas_billing_webhook_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_event_id_hash VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    processing_status VARCHAR(50) DEFAULT 'pending',
    signature_verified BOOLEAN DEFAULT FALSE,
    payload_hash VARCHAR(64) NOT NULL,
    payload_safe_jsonb JSONB,
    error_message_safe VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_webhook_prov_evt ON saas_billing_webhook_events (provider, provider_event_id_hash);

-- Webhook events do not have tenant_id column; protected at server-side access


-- 6. saas_billing_provider_accounts
CREATE TABLE IF NOT EXISTS saas_billing_provider_accounts (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) UNIQUE NOT NULL,
    mode VARCHAR(20) DEFAULT 'sandbox',
    enabled BOOLEAN DEFAULT FALSE,
    public_label VARCHAR(100),
    capabilities_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- General settings, no RLS, protected by Super Admin Server-Side guards


-- 7. saas_billing_audit_events
CREATE TABLE IF NOT EXISTS saas_billing_audit_events (
    id SERIAL PRIMARY KEY,
    tenant_id INT,
    actor_user_id INT NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id INT,
    safe_metadata_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_audit_tenant ON saas_billing_audit_events (tenant_id);

-- Enable RLS
ALTER TABLE saas_billing_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_billing_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_billing_audit_policy ON saas_billing_audit_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
