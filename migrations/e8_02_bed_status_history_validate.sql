-- e8_02_bed_status_history_validate.sql  (run AFTER e8_02_bed_status_history_up.sql; read-only)
-- PASS = bed_status_history exists with tenant_id NOT NULL FK + FORCE RLS + isolation policy + index.

SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_name='bed_status_history')     AS table_exists,        -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='bed_status_history')                   AS force_rls,           -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='bed_status_history'
       AND policyname='rls_bed_status_history_tenant_isolation')                                  AS policy,              -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='bed_status_history'
       AND column_name='tenant_id' AND is_nullable='NO')                                          AS tenant_not_null,     -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='bed_status_history'::regclass AND confrelid='tenants'::regclass AND contype='f') AS tenant_fk,     -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='bed_status_history'::regclass AND confrelid='beds'::regclass AND contype='f')    AS bed_fk,        -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='bed_status_history'::regclass AND confrelid='patients'::regclass AND contype='f') AS patient_fk,  -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='bed_status_history'
       AND indexname='idx_bed_status_history_tenant_id')                                          AS idx;                 -- expect 1
