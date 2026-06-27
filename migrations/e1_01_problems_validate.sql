-- e1_01_problems_validate.sql  (run AFTER e1_01_problems_up.sql; read-only)
-- PASS = problems exists with tenant_id FK + FORCE RLS + isolation policy + indexes + status CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='problems') AS problems_exists,                 -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='problems'
       AND column_name IN ('tenant_id','patient_id','encounter_ref','icd10','snomed','description','status','onset_date','recorded_by')) AS problems_cols, -- expect 9
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='problems') AS problems_force_rls,                       -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='problems' AND policyname='rls_problems_tenant_isolation') AS problems_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_problems_status') AS problems_status_check,               -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='problems' AND indexname='idx_problems_tenant_id') AS problems_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='problems' AND column_name='tenant_id' AND is_nullable='NO';                                    -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='problems'::regclass AND confrelid='tenants'::regclass AND contype='f';                           -- expect 1
