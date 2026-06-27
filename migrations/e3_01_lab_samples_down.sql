-- e3_01_lab_samples_down.sql  (rollback of e3_01_lab_samples_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف السياسة والفهارس (بما فيها فهرس الباركود الفريد) ثم الجدول. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_lab_samples_tenant_isolation ON lab_samples;
DROP INDEX IF EXISTS uq_lab_samples_tenant_barcode;
DROP INDEX IF EXISTS idx_lab_samples_patient_id;
DROP INDEX IF EXISTS idx_lab_samples_lab_order_id;
DROP INDEX IF EXISTS idx_lab_samples_tenant_id;
ALTER TABLE IF EXISTS lab_samples DROP CONSTRAINT IF EXISTS chk_lab_samples_state;
DROP TABLE IF EXISTS lab_samples;

COMMIT;
