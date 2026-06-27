-- e3_03_lab_qc_down.sql  (rollback of e3_03_lab_qc_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف السياسة والفهارس ثم الجدول. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_lab_qc_tenant_isolation ON lab_qc;
DROP INDEX IF EXISTS idx_lab_qc_analyzer;
DROP INDEX IF EXISTS idx_lab_qc_tenant_id;
DROP TABLE IF EXISTS lab_qc;

COMMIT;
