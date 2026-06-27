-- e1_02_clinical_notes_validate.sql  (run AFTER e1_02_clinical_notes_up.sql; read-only)
-- PASS = clinical_notes exists with tenant_id FK + FORCE RLS + isolation policy + indexes + CHECKs + sign/lock cols.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='clinical_notes') AS notes_exists,             -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='clinical_notes'
       AND column_name IN ('tenant_id','patient_id','encounter_ref','type','subjective','objective','assessment','plan','author_id','signed_at')) AS notes_cols, -- expect 10
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='clinical_notes'
       AND column_name IN ('emr_status','signed_by_user_id','locked_at','integrity_hash')) AS notes_lock_cols,    -- expect 4
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='clinical_notes') AS notes_force_rls,                   -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='clinical_notes' AND policyname='rls_clinical_notes_tenant_isolation') AS notes_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_clinical_notes_type') AS notes_type_check,               -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_clinical_notes_status') AS notes_status_check,           -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='clinical_notes' AND indexname='idx_clinical_notes_tenant_id') AS notes_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='clinical_notes' AND column_name='tenant_id' AND is_nullable='NO';                             -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='clinical_notes'::regclass AND confrelid='tenants'::regclass AND contype='f';                    -- expect 1
