-- e0_03_facility_modules_validate.sql  (run AFTER up.sql; read-only)
-- PASS = facility_modules exists with tenant_id FK + FORCE RLS + isolation policy + unique + index + check.
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name='facility_modules') AS table_exists,                                   -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='facility_modules'
       AND column_name IN ('tenant_id','module_index','enabled')) AS cols,                   -- expect 3
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='facility_modules') AS force_rls,  -- expect t
  (SELECT count(*) FROM pg_policies
     WHERE tablename='facility_modules'
       AND policyname='rls_facility_modules_tenant_isolation') AS has_policy,                -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='uq_facility_module') AS has_unique,      -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_facility_module_index') AS has_check,-- expect 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename='facility_modules' AND indexname='idx_facility_modules_tenant') AS has_idx; -- expect 1
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='facility_modules'::regclass AND confrelid='tenants'::regclass AND contype='f'; -- expect 1
