-- e5_03_controlled_log_down.sql  (rollback of e5_03_controlled_log_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الفهارس والسياسة والقيد ثم جدول controlled_drug_log، ويتراجع عن أعلام الكتالوج.
-- idempotent (IF EXISTS). لا نحذف pharmacy_drug_catalog نفسه (مُهيأ خارج النطاق).
BEGIN;

DROP POLICY IF EXISTS rls_controlled_drug_log_tenant_isolation ON controlled_drug_log;
DROP INDEX IF EXISTS idx_controlled_log_drug;
DROP INDEX IF EXISTS idx_controlled_log_tenant_id;
ALTER TABLE IF EXISTS controlled_drug_log DROP CONSTRAINT IF EXISTS chk_controlled_log_qty;
DROP TABLE IF EXISTS controlled_drug_log;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pharmacy_drug_catalog') THEN
    ALTER TABLE pharmacy_drug_catalog DROP COLUMN IF EXISTS schedule_class;
    ALTER TABLE pharmacy_drug_catalog DROP COLUMN IF EXISTS is_controlled;
  END IF;
END
$do$;

COMMIT;
