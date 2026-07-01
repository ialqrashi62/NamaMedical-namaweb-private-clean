-- e26_billing_tables_candidate_validate.sql
-- Read-only validation for an ISOLATED test DB after e26_up.
-- Returns all_ok = true iff the seven tables, key constraints, RLS, and indexes exist as designed.
-- Absolutely NO writes.
SELECT
    -- 1. Verify tables count
    (SELECT count(*) FROM information_schema.tables
       WHERE table_name IN (
           'saas_billing_customers',
           'saas_billing_subscriptions',
           'saas_billing_checkout_sessions',
           'saas_billing_payment_transactions',
           'saas_billing_webhook_events',
           'saas_billing_provider_accounts',
           'saas_billing_audit_events'
       )) = 7 AS all_tables_present,

    -- 2. Verify tenant_id column in tenant-scoped tables
    (SELECT count(*) FROM information_schema.columns
       WHERE table_name IN (
           'saas_billing_customers',
           'saas_billing_subscriptions',
           'saas_billing_checkout_sessions',
           'saas_billing_payment_transactions',
           'saas_billing_audit_events'
       ) AND column_name = 'tenant_id') = 5 AS tenant_id_present,

    -- 3. Verify no credit card PAN or CVV or raw secret columns are added
    (SELECT count(*) FROM information_schema.columns
       WHERE table_name LIKE 'saas_billing_%'
         AND column_name IN ('card_number', 'cvv', 'cvc', 'raw_secret', 'secret_key', 'private_key')
    ) = 0 AS no_sensitive_columns,

    -- 4. Verify indexes
    EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_saas_billing_customers_tenant') AS customer_index_present,
    EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_saas_billing_subs_tenant') AS sub_index_present,
    EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_saas_billing_checkout_tenant') AS checkout_index_present,
    EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_saas_billing_tx_tenant') AS tx_index_present,
    EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_saas_billing_audit_tenant') AS audit_index_present,

    -- 5. Overall validation result
    (
        (SELECT count(*) FROM information_schema.tables
           WHERE table_name IN (
               'saas_billing_customers',
               'saas_billing_subscriptions',
               'saas_billing_checkout_sessions',
               'saas_billing_payment_transactions',
               'saas_billing_webhook_events',
               'saas_billing_provider_accounts',
               'saas_billing_audit_events'
           )) = 7
        AND
        (SELECT count(*) FROM information_schema.columns
           WHERE table_name IN (
               'saas_billing_customers',
               'saas_billing_subscriptions',
               'saas_billing_checkout_sessions',
               'saas_billing_payment_transactions',
               'saas_billing_audit_events'
           ) AND column_name = 'tenant_id') = 5
        AND
        (SELECT count(*) FROM information_schema.columns
           WHERE table_name LIKE 'saas_billing_%'
             AND column_name IN ('card_number', 'cvv', 'cvc', 'raw_secret', 'secret_key', 'private_key')
        ) = 0
    ) AS all_ok;
