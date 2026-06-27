-- e0_03_facility_modules_down.sql  (rollback of e0_03_facility_modules_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف جدول facility_modules بالكامل (وسياسته وفهرسه). idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_facility_modules_tenant_isolation ON facility_modules;
DROP TABLE IF EXISTS facility_modules;

COMMIT;
