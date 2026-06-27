-- e3_03_lab_qc_validate.sql  (run AFTER e3_03_lab_qc_up.sql; read-only)
-- PASS = lab_qc exists with tenant_id FK (NOT NULL) + FORCE RLS + isolation policy + tenant index.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='lab_qc') AS lab_qc_exists,                      -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='lab_qc'
       AND column_name IN ('tenant_id','analyzer','analyte','level','value','target','sd','z','westgard_flag','breach','at')) AS lab_qc_cols, -- expect 11
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='lab_qc') AS lab_qc_force_rls,                            -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='lab_qc' AND policyname='rls_lab_qc_tenant_isolation') AS lab_qc_policy, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='lab_qc' AND indexname='idx_lab_qc_tenant_id') AS lab_qc_tenant_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='lab_qc' AND column_name='tenant_id' AND is_nullable='NO';                                       -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='lab_qc'::regclass AND confrelid='tenants'::regclass AND contype='f';                              -- expect 1
