-- e6_03_nursing_scores_validate.sql  (run AFTER e6_03_nursing_scores_up.sql; read-only)
-- PASS = nursing_scores exists with tenant_id FK + FORCE RLS + isolation policy + indexes + score_type CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='nursing_scores') AS scores_exists,              -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='nursing_scores'
       AND column_name IN ('tenant_id','patient_id','score_type','score','band','inputs_json','recorded_by')) AS scores_cols, -- expect 7
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='nursing_scores') AS scores_force_rls,                    -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='nursing_scores' AND policyname='rls_nursing_scores_tenant_isolation') AS scores_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_nursing_score_type') AS scores_type_check,                 -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='nursing_scores' AND indexname='idx_nursing_scores_tenant_id') AS scores_idx; -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='nursing_scores' AND column_name='tenant_id' AND is_nullable='NO';                               -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='nursing_scores'::regclass AND confrelid='tenants'::regclass AND contype='f';                      -- expect 1

-- ----- FK patient_id -> patients(id) -----
SELECT count(*)::int AS fk_to_patients FROM pg_constraint
  WHERE conrelid='nursing_scores'::regclass AND confrelid='patients'::regclass AND contype='f';                     -- expect 1
