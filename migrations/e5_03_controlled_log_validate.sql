-- e5_03_controlled_log_validate.sql  (run AFTER e5_03_controlled_log_up.sql; read-only)
-- PASS = controlled_drug_log exists with tenant_id FK + NOT NULL + FORCE RLS + isolation policy + indexes + qty CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='controlled_drug_log') AS log_exists,              -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='controlled_drug_log'
       AND column_name IN ('tenant_id','drug_id','drug_name','dispense_id','prescription_id','patient_id','qty','balance_before','balance_after','schedule_class','dispensed_by','witnessed_by','at')) AS log_cols, -- expect 13
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='controlled_drug_log') AS log_force_rls,                    -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='controlled_drug_log' AND policyname='rls_controlled_drug_log_tenant_isolation') AS log_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_controlled_log_qty') AS log_qty_check,                       -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='controlled_drug_log' AND indexname='idx_controlled_log_tenant_id') AS log_tenant_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='controlled_drug_log' AND column_name='tenant_id' AND is_nullable='NO';                           -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='controlled_drug_log'::regclass AND confrelid='tenants'::regclass AND contype='f';                  -- expect 1

-- ----- controlled flags present on the catalog -----
SELECT count(*)::int AS catalog_controlled_cols FROM information_schema.columns
  WHERE table_name='pharmacy_drug_catalog' AND column_name IN ('is_controlled','schedule_class');                    -- expect 2 (if catalog present)
