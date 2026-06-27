-- e6_01_mar_administrations_validate.sql  (run AFTER e6_01_mar_administrations_up.sql; read-only)
-- PASS = mar_administrations exists with tenant_id FK + FORCE RLS + isolation policy + indexes + status CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='mar_administrations') AS mar_exists,            -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='mar_administrations'
       AND column_name IN ('tenant_id','patient_id','prescription_ref','medication','dose','route','scheduled_at','administered_at','administered_by','witness_by','status','override_reason')) AS mar_cols, -- expect 12
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='mar_administrations') AS mar_force_rls,                  -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='mar_administrations' AND policyname='rls_mar_administrations_tenant_isolation') AS mar_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_mar_status') AS mar_status_check,                          -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='mar_administrations' AND indexname='idx_mar_administrations_tenant_id') AS mar_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='mar_administrations' AND column_name='tenant_id' AND is_nullable='NO';                          -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='mar_administrations'::regclass AND confrelid='tenants'::regclass AND contype='f';                 -- expect 1

-- ----- FK patient_id -> patients(id) (right-patient FK) -----
SELECT count(*)::int AS fk_to_patients FROM pg_constraint
  WHERE conrelid='mar_administrations'::regclass AND confrelid='patients'::regclass AND contype='f';                -- expect 1

-- ----- FK prescription_ref -> pharmacy_prescriptions_queue(id) (nullable) -----
SELECT count(*)::int AS fk_to_rx_queue FROM pg_constraint
  WHERE conrelid='mar_administrations'::regclass AND confrelid='pharmacy_prescriptions_queue'::regclass AND contype='f'; -- expect 1
