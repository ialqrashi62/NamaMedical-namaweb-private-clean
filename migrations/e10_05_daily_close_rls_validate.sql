-- e10_05_daily_close_rls_validate.sql  (run AFTER e10_05_daily_close_rls_up.sql; read-only)
-- PASS = daily_close tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK).

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='daily_close')                                     AS dc_force_rls,       -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='daily_close'
       AND policyname='rls_daily_close_tenant_isolation')                                                    AS dc_policy,          -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='daily_close'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS dc_tenant_not_null, -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='daily_close'::regclass AND confrelid='tenants'::regclass AND contype='f')             AS dc_tenant_fk;       -- expect 1
