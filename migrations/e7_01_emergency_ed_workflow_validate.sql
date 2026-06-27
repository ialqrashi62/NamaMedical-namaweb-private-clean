-- e7_01_emergency_ed_workflow_validate.sql  (run AFTER e7_01_emergency_ed_workflow_up.sql; read-only)
-- PASS = emergency_visits has ESI/workflow columns + tenant_id NOT NULL FK + FORCE RLS + isolation policy + CHECKs + indexes.

SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='emergency_visits'
       AND column_name IN ('esi_level','esi_rationale','er_phase','triage_started_at',
                           'provider_assigned_at','time_to_provider_min','disposition_type')) AS workflow_cols, -- expect 7
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='emergency_visits') AS force_rls,                     -- expect t
  (SELECT relrowsecurity FROM pg_class WHERE relname='emergency_visits') AS rls_enabled,                        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='emergency_visits'
       AND policyname='rls_emergency_visits_tenant_isolation') AS isolation_policy,                             -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_emergency_visits_phase') AS phase_check,               -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_emergency_visits_esi') AS esi_check,                   -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='emergency_visits' AND indexname='idx_emergency_visits_tenant_id') AS tenant_idx, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='emergency_visits' AND indexname='idx_emergency_visits_board') AS board_idx;      -- expect 1

-- ----- tenant_id is NOT NULL -----
SELECT count(*)::int AS tenant_id_not_null FROM information_schema.columns
  WHERE table_name='emergency_visits' AND column_name='tenant_id' AND is_nullable='NO';                         -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='emergency_visits'::regclass AND confrelid='tenants'::regclass AND contype='f';                -- expect 1
