-- e1_01_problems_down.sql  (rollback of e1_01_problems_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف سياسة العزل ثم جدول problems. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_problems_tenant_isolation ON problems;
ALTER TABLE IF EXISTS problems DROP CONSTRAINT IF EXISTS chk_problems_status;
DROP TABLE IF EXISTS problems;

COMMIT;
