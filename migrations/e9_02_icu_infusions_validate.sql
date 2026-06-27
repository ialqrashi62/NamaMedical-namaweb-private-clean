-- e9_02_icu_infusions_validate.sql  (run AFTER e9_02_icu_infusions_up.sql; read-only)
-- PASS = icu_infusions exists with tenant_id NOT NULL FK + admission/patient FK + FORCE RLS + policy + index.

SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_name='icu_infusions')           AS table_exists,        -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='icu_infusions')                          AS force_rls,           -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='icu_infusions'
       AND policyname='rls_icu_infusions_tenant_isolation')                                         AS policy,              -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='icu_infusions'
       AND column_name='tenant_id' AND is_nullable='NO')                                            AS tenant_not_null,     -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_infusions'::regclass AND confrelid='tenants'::regclass AND contype='f')  AS tenant_fk,           -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_infusions'::regclass AND confrelid='admissions'::regclass AND contype='f') AS admission_fk,      -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_infusions'::regclass AND confrelid='patients'::regclass AND contype='f') AS patient_fk,         -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='icu_infusions'
       AND indexname='idx_icu_infusions_tenant_id')                                                 AS idx;                 -- expect 1
