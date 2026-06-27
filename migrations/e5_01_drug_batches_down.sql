-- e5_01_drug_batches_down.sql  (rollback of e5_01_drug_batches_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الفهارس والسياسة والقيد ثم جدول drug_batches. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_drug_batches_tenant_isolation ON drug_batches;
DROP INDEX IF EXISTS idx_drug_batches_fefo;
DROP INDEX IF EXISTS idx_drug_batches_tenant_id;
ALTER TABLE IF EXISTS drug_batches DROP CONSTRAINT IF EXISTS chk_drug_batches_qty;
DROP TABLE IF EXISTS drug_batches;

COMMIT;
