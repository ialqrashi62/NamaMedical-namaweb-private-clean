-- e5_02_pharmacy_dispense_down.sql  (rollback of e5_02_pharmacy_dispense_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الفهارس والسياسة والقيود ثم جدول pharmacy_dispense، ويتراجع عن أعمدة التحقق على الطابور.
-- idempotent (IF EXISTS). ملاحظة: لا نحذف pharmacy_prescriptions_queue نفسه (مُهيأ خارج النطاق).
BEGIN;

DROP POLICY IF EXISTS rls_pharmacy_dispense_tenant_isolation ON pharmacy_dispense;
DROP INDEX IF EXISTS idx_pharmacy_dispense_patient;
DROP INDEX IF EXISTS idx_pharmacy_dispense_prescription;
DROP INDEX IF EXISTS idx_pharmacy_dispense_tenant_id;
ALTER TABLE IF EXISTS pharmacy_dispense DROP CONSTRAINT IF EXISTS chk_pharmacy_dispense_status;
ALTER TABLE IF EXISTS pharmacy_dispense DROP CONSTRAINT IF EXISTS chk_pharmacy_dispense_qty;
DROP TABLE IF EXISTS pharmacy_dispense;

-- roll back the additive verification columns (only the columns this migration added)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pharmacy_prescriptions_queue') THEN
    ALTER TABLE pharmacy_prescriptions_queue DROP COLUMN IF EXISTS verified_at;
    ALTER TABLE pharmacy_prescriptions_queue DROP COLUMN IF EXISTS verified_by;
  END IF;
END
$do$;

COMMIT;
