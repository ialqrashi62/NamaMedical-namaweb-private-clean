-- e0_04_integration_settings_rls_validate.sql  (run AFTER up.sql; read-only)
-- PASS = integration_settings has tenant_id column + FORCE RLS + isolation policy.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='integration_settings' AND column_name='tenant_id') AS has_tenant_col,        -- expect 1
  (SELECT relrowsecurity FROM pg_class WHERE relname='integration_settings') AS rls_enabled,        -- expect t
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='integration_settings') AS force_rls,     -- expect t
  (SELECT count(*) FROM pg_policies
     WHERE tablename='integration_settings'
       AND policyname='rls_integration_settings_tenant_isolation') AS has_policy;                   -- expect 1
