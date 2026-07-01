-- Candidate Down Migration: Rollback SaaS Billing Tables
-- ============================================================================
-- SAFE-BY-DESIGN: Design-Only candidate. DO NOT execute in database.
-- ============================================================================
BEGIN;

-- Drop Policies First
DROP POLICY IF EXISTS tenant_billing_audit_policy ON saas_billing_audit_events;
DROP POLICY IF EXISTS tenant_payment_transactions_policy ON saas_billing_payment_transactions;
DROP POLICY IF EXISTS tenant_checkout_sessions_policy ON saas_billing_checkout_sessions;
DROP POLICY IF EXISTS tenant_billing_subscriptions_policy ON saas_billing_subscriptions;
DROP POLICY IF EXISTS tenant_billing_customers_policy ON saas_billing_customers;

-- Drop Tables cleanly
DROP TABLE IF EXISTS saas_billing_audit_events;
DROP TABLE IF EXISTS saas_billing_provider_accounts;
DROP TABLE IF EXISTS saas_billing_webhook_events;
DROP TABLE IF EXISTS saas_billing_payment_transactions;
DROP TABLE IF EXISTS saas_billing_checkout_sessions;
DROP TABLE IF EXISTS saas_billing_subscriptions;
DROP TABLE IF EXISTS saas_billing_customers;

COMMIT;
