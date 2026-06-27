-- e2_03_record_access_down.sql  (rollback of e2_03_record_access_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف سياسة العزل ثم جدول record_access_log. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_record_access_log_tenant_isolation ON record_access_log;
ALTER TABLE IF EXISTS record_access_log DROP CONSTRAINT IF EXISTS chk_record_access_type;
-- idempotent inverse of the up's CREATE INDEX IF NOT EXISTS (explicit; DROP TABLE also removes them)
DROP INDEX IF EXISTS idx_record_access_log_tenant_id;
DROP INDEX IF EXISTS idx_record_access_log_patient_id;
DROP INDEX IF EXISTS idx_record_access_log_at;
DROP TABLE IF EXISTS record_access_log;

COMMIT;
