-- p1_03_department_owners_down.sql
-- Rollback: Remove owner_role column from clinical_departments table
ALTER TABLE clinical_departments DROP COLUMN IF EXISTS owner_role;
