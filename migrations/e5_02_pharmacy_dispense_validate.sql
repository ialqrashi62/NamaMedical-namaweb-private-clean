-- e5_02_pharmacy_dispense_validate.sql  (run AFTER e5_02_pharmacy_dispense_up.sql; read-only)
-- PASS = pharmacy_dispense exists with tenant_id FK + NOT NULL + FORCE RLS + isolation policy + indexes + checks.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='pharmacy_dispense') AS dispense_exists,           -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='pharmacy_dispense'
       AND column_name IN ('tenant_id','prescription_id','patient_id','drug_id','drug_batch_id','qty','verified_by','dispensed_by','dispensed_at','status')) AS dispense_cols, -- expect 10
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='pharmacy_dispense') AS dispense_force_rls,                 -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='pharmacy_dispense' AND policyname='rls_pharmacy_dispense_tenant_isolation') AS dispense_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_pharmacy_dispense_qty') AS dispense_qty_check,               -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_pharmacy_dispense_status') AS dispense_status_check,         -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='pharmacy_dispense' AND indexname='idx_pharmacy_dispense_tenant_id') AS dispense_tenant_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='pharmacy_dispense' AND column_name='tenant_id' AND is_nullable='NO';                              -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='pharmacy_dispense'::regclass AND confrelid='tenants'::regclass AND contype='f';                     -- expect 1

-- ----- verification columns present on the queue -----
SELECT count(*)::int AS queue_verify_cols FROM information_schema.columns
  WHERE table_name='pharmacy_prescriptions_queue' AND column_name IN ('verified_by','verified_at');                  -- expect 2 (if queue table present)
