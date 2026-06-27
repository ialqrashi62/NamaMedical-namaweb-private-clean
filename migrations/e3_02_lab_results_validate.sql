-- e3_02_lab_results_validate.sql  (run AFTER e3_02_lab_results_up.sql; read-only)
-- PASS = lab_results has structured LIS columns + FORCE RLS + isolation policy + status CHECK
--        + tenant_id index + FK to tenants. (tenant_id NOT NULL is enforced only when the
--        table had no NULL rows; we report both the column nullability and the row count.)

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='lab_results') AS lab_results_exists,            -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='lab_results'
       AND column_name IN ('tenant_id','lab_sample_id','loinc','test_name','value','unit','normal_range',
                           'ref_low','ref_high','abnormal_flag','delta_pct','is_critical','status',
                           'verified_by','verified_at','reported')) AS lab_results_lis_cols,                        -- expect 16
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='lab_results') AS lab_results_force_rls,                  -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='lab_results' AND policyname='rls_lab_results_tenant_isolation') AS lab_results_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_lab_results_status') AS lab_results_status_check,          -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='lab_results' AND indexname='idx_lab_results_tenant_id') AS lab_results_tenant_idx; -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='lab_results'::regclass AND confrelid='tenants'::regclass AND contype='f';                         -- expect 1

-- ----- tenant_id nullability + NULL row count (NOT NULL only when 0 NULL rows) -----
SELECT
  (SELECT is_nullable FROM information_schema.columns WHERE table_name='lab_results' AND column_name='tenant_id') AS tenant_id_nullable, -- 'NO' when enforced
  (SELECT count(*) FROM lab_results WHERE tenant_id IS NULL) AS null_tenant_rows;                                   -- expect 0 in fresh/empty

-- ----- lab_critical_callbacks (critical call-back log) -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='lab_critical_callbacks') AS callbacks_exists,   -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='lab_critical_callbacks') AS callbacks_force_rls,         -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='lab_critical_callbacks' AND policyname='rls_lab_callbacks_tenant_isolation') AS callbacks_policy, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='lab_critical_callbacks' AND indexname='idx_lab_callbacks_tenant_id') AS callbacks_tenant_idx, -- expect 1
  (SELECT count(*) FROM information_schema.columns WHERE table_name='lab_critical_callbacks' AND column_name='tenant_id' AND is_nullable='NO') AS callbacks_tenant_not_null; -- expect 1
