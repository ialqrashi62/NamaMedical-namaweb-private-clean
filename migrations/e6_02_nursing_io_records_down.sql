-- e6_02_nursing_io_records_down.sql  (rollback of e6_02_nursing_io_records_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الجدول أولاً (DROP TABLE يسقط السياسة والفهارس التابعة)، ثم تنظيف احترازي idempotent (IF EXISTS).
-- LOWER-3: DROP TABLE FIRST so a failed/locked DROP POLICY can never block the table teardown.
BEGIN;

DROP TABLE IF EXISTS nursing_io_records;

DROP POLICY IF EXISTS rls_nursing_io_records_tenant_isolation ON nursing_io_records;
DROP INDEX IF EXISTS idx_nursing_io_records_patient_id;
DROP INDEX IF EXISTS idx_nursing_io_records_tenant_id;

COMMIT;
