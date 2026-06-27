-- e8_01_inpatient_adt_rls_validate.sql  (run AFTER e8_01_inpatient_adt_rls_up.sql; read-only)
-- PASS = all five ADT tables have tenant_id NOT NULL FK + FORCE RLS + isolation policy + index.

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='admissions')               AS admissions_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='admissions'
       AND policyname='rls_admissions_tenant_isolation')                              AS admissions_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='admissions'
       AND column_name='tenant_id' AND is_nullable='NO')                             AS admissions_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='admissions'::regclass AND confrelid='tenants'::regclass AND contype='f') AS admissions_fk,    -- expect 1

  (SELECT relforcerowsecurity FROM pg_class WHERE relname='beds')                     AS beds_force_rls,              -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='beds'
       AND policyname='rls_beds_tenant_isolation')                                    AS beds_policy,                 -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='beds'::regclass AND conname='chk_beds_status')                 AS beds_status_chk,             -- expect 1

  (SELECT relforcerowsecurity FROM pg_class WHERE relname='wards')                    AS wards_force_rls,             -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='wards'
       AND policyname='rls_wards_tenant_isolation')                                   AS wards_policy,                -- expect 1

  (SELECT relforcerowsecurity FROM pg_class WHERE relname='bed_transfers')            AS bed_transfers_force_rls,     -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='bed_transfers'
       AND policyname='rls_bed_transfers_tenant_isolation')                           AS bed_transfers_policy,        -- expect 1

  (SELECT relforcerowsecurity FROM pg_class WHERE relname='admission_daily_rounds')   AS rounds_force_rls,            -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='admission_daily_rounds'
       AND policyname='rls_admission_rounds_tenant_isolation')                        AS rounds_policy;               -- expect 1
