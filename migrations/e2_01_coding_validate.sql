-- e2_01_coding_validate.sql  (run AFTER e2_01_coding_up.sql; read-only)
-- PASS = coding exists with tenant_id FK NOT NULL + FORCE RLS + isolation policy + indexes + code_system CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='coding') AS coding_exists,                     -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='coding'
       AND column_name IN ('tenant_id','facility_id','patient_id','encounter_ref','code_system','code','description','coder_id','created_at')) AS coding_cols, -- expect 9
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='coding') AS coding_force_rls,                           -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='coding' AND policyname='rls_coding_tenant_isolation') AS coding_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_coding_code_system') AS coding_codesys_check,             -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='coding' AND indexname='idx_coding_tenant_id') AS coding_idx;   -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='coding' AND column_name='tenant_id' AND is_nullable='NO';                                      -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='coding'::regclass AND confrelid='tenants'::regclass AND contype='f';                             -- expect 1
