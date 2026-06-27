-- e0_02_facilities_extend_validate.sql  (run AFTER up.sql; read-only)
-- PASS = facilities has all 5 new columns + parent self-FK + FORCE RLS + isolation policy + indexes.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='facilities'
       AND column_name IN ('type','beds','currency','timezone','parent_facility_id')) AS new_cols,        -- expect 5
  (SELECT count(*) FROM pg_constraint WHERE conname='fk_facilities_parent') AS has_parent_fk,             -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_facilities_type') AS has_type_check,             -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='facilities') AS force_rls,                     -- expect t
  (SELECT count(*) FROM pg_policies
     WHERE tablename='facilities' AND policyname='rls_facilities_tenant_isolation') AS has_policy,         -- expect 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename='facilities' AND indexname IN ('idx_facilities_tenant','idx_facilities_parent')) AS idx_cnt; -- expect 2
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='nama_medical_app';  -- expect false/false (app role unchanged)
