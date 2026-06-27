-- e2_03_record_access_validate.sql  (run AFTER e2_03_record_access_up.sql; read-only)
-- PASS = record_access_log exists with tenant_id FK NOT NULL + FORCE RLS + isolation policy + indexes + access_type CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='record_access_log') AS ral_exists,            -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='record_access_log'
       AND column_name IN ('tenant_id','facility_id','patient_id','accessor_id','access_type','reason','at')) AS ral_cols, -- expect 7
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='record_access_log') AS ral_force_rls,                  -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='record_access_log' AND policyname='rls_record_access_log_tenant_isolation') AS ral_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_record_access_type') AS ral_type_check,                  -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='record_access_log' AND indexname='idx_record_access_log_tenant_id') AS ral_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='record_access_log' AND column_name='tenant_id' AND is_nullable='NO';                          -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='record_access_log'::regclass AND confrelid='tenants'::regclass AND contype='f';                 -- expect 1
