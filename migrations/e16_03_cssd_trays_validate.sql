-- e16_03_cssd_trays_validate.sql  (run AFTER e16_03 up; read-only)
-- PASS = cssd_trays exists with tenant_id NOT NULL FK->tenants + FORCE RLS + isolation policy
--        + cycle FK + status state-machine check + index.
SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_name='cssd_trays')                  AS table_exists,        -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='cssd_trays')                                AS force_rls,           -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='cssd_trays'
       AND policyname='rls_cssd_trays_tenant_isolation')                                               AS policy,              -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='cssd_trays'
       AND column_name='tenant_id' AND is_nullable='NO')                                               AS tenant_not_null,     -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='cssd_trays'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                              AS tenant_fk,           -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='cssd_trays'::regclass
       AND confrelid='cssd_sterilization_cycles'::regclass AND contype='f')                            AS cycle_fk,            -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_cssd_trays_status')                      AS status_chk,          -- 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='cssd_trays'
       AND indexname='idx_cssd_trays_tenant_id')                                                       AS idx;                 -- 1
