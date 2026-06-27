-- e6_02_nursing_io_records_validate.sql  (run AFTER e6_02_nursing_io_records_up.sql; read-only)
-- PASS = nursing_io_records exists with tenant_id FK + FORCE RLS + isolation policy + indexes + direction CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='nursing_io_records') AS io_exists,              -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='nursing_io_records'
       AND column_name IN ('tenant_id','patient_id','direction','category','amount_ml','recorded_by','shift')) AS io_cols, -- expect 7
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='nursing_io_records') AS io_force_rls,                    -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='nursing_io_records' AND policyname='rls_nursing_io_records_tenant_isolation') AS io_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_io_direction') AS io_direction_check,                      -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='nursing_io_records' AND indexname='idx_nursing_io_records_tenant_id') AS io_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='nursing_io_records' AND column_name='tenant_id' AND is_nullable='NO';                           -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='nursing_io_records'::regclass AND confrelid='tenants'::regclass AND contype='f';                  -- expect 1

-- ----- FK patient_id -> patients(id) -----
SELECT count(*)::int AS fk_to_patients FROM pg_constraint
  WHERE conrelid='nursing_io_records'::regclass AND confrelid='patients'::regclass AND contype='f';                 -- expect 1
