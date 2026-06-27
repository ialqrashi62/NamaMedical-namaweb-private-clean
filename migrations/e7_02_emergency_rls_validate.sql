-- e7_02_emergency_rls_validate.sql  (run AFTER e7_02_emergency_rls_up.sql; read-only)
-- PASS = both ED child tables have tenant_id NOT NULL FK + FORCE RLS + isolation policy + index.

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='emergency_trauma_assessments') AS trauma_force_rls,   -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='emergency_trauma_assessments'
       AND policyname='rls_emergency_trauma_tenant_isolation') AS trauma_policy,                                 -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='emergency_trauma_assessments'
       AND indexname='idx_emergency_trauma_tenant_id') AS trauma_idx,                                            -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='emergency_trauma_assessments'
       AND column_name='tenant_id' AND is_nullable='NO') AS trauma_tenant_not_null,                             -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='emergency_trauma_assessments'::regclass AND confrelid='tenants'::regclass AND contype='f') AS trauma_fk, -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='emergency_beds') AS beds_force_rls,                   -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='emergency_beds'
       AND policyname='rls_emergency_beds_tenant_isolation') AS beds_policy,                                     -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='emergency_beds'
       AND indexname='idx_emergency_beds_tenant_id') AS beds_idx,                                                -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='emergency_beds'
       AND column_name='tenant_id' AND is_nullable='NO') AS beds_tenant_not_null,                               -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='emergency_beds'::regclass AND confrelid='tenants'::regclass AND contype='f') AS beds_fk;  -- expect 1
