-- p1_03_department_owners_validate.sql
-- Validation query for department owner matrix.
-- PASS = owner_role column exists in clinical_departments and has non-empty values.

SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='clinical_departments' AND column_name='owner_role') AS owner_role_col_exists, -- expect 1
  (SELECT count(*) FROM clinical_departments WHERE owner_role IS NULL OR owner_role = '') AS unmapped_owners_count; -- expect 0
