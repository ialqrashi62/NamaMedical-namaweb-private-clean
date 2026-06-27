-- e3_01_lab_samples_validate.sql  (run AFTER e3_01_lab_samples_up.sql; read-only)
-- PASS = lab_samples exists with tenant_id FK + FORCE RLS + isolation policy + indexes
--        + state CHECK + per-tenant unique barcode.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='lab_samples') AS lab_samples_exists,            -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='lab_samples'
       AND column_name IN ('tenant_id','facility_id','lab_order_id','patient_id','barcode','state',
                           'collected_by','collected_at','received_by','received_at','rejected_reason')) AS lab_samples_cols, -- expect 11
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='lab_samples') AS lab_samples_force_rls,                  -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='lab_samples' AND policyname='rls_lab_samples_tenant_isolation') AS lab_samples_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_lab_samples_state') AS lab_samples_state_check,            -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='lab_samples' AND indexname='idx_lab_samples_tenant_id') AS lab_samples_tenant_idx, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='lab_samples' AND indexname='uq_lab_samples_tenant_barcode') AS lab_samples_barcode_uq; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='lab_samples' AND column_name='tenant_id' AND is_nullable='NO';                                  -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='lab_samples'::regclass AND confrelid='tenants'::regclass AND contype='f';                         -- expect 1
