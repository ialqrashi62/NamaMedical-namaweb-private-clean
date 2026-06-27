-- e1_02_clinical_notes_down.sql  (rollback of e1_02_clinical_notes_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف سياسة العزل ثم جدول clinical_notes. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_clinical_notes_tenant_isolation ON clinical_notes;
ALTER TABLE IF EXISTS clinical_notes DROP CONSTRAINT IF EXISTS chk_clinical_notes_type;
ALTER TABLE IF EXISTS clinical_notes DROP CONSTRAINT IF EXISTS chk_clinical_notes_status;
DROP TABLE IF EXISTS clinical_notes;

COMMIT;
