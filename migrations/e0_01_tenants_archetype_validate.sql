-- e0_01_tenants_archetype_validate.sql  (run AFTER up.sql; read-only)
-- PASS = tenants has archetype column + CHECK constraint present.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='tenants' AND column_name='archetype') AS has_archetype_col,   -- expect 1
  (SELECT count(*) FROM pg_constraint
     WHERE conname='chk_tenants_archetype') AS has_check_constraint,                  -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='tenants'
       AND column_name IN ('moh_license','cr_no','vat_no')) AS has_reg_id_cols;       -- expect 3
-- Verify constraint rejects bad values and accepts valid ones (sanity, no row written):
--   INSERT ... archetype='bogus' must fail with check_violation; 'polyclinic' must pass.
