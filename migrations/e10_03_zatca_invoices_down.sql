-- e10_03_zatca_invoices_down.sql  (rollback of e10_03_zatca_invoices_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: zatca_invoices قائم سابقاً => لا نُسقطه. نعكس فقط الإضافات. tenant_id/facility_id/branch_id
--   كانت في bootstrap فنُبقي الأعمدة (نُزيل NOT NULL/FK فقط). idempotent.
BEGIN;

DROP POLICY IF EXISTS rls_zatca_tenant_isolation ON zatca_invoices;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS chk_zatca_clearance;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS fk_zatca_invoice;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS fk_zatca_tenant;
DROP INDEX IF EXISTS uq_zatca_tenant_invoice;
DROP INDEX IF EXISTS idx_zatca_tenant_id;
ALTER TABLE zatca_invoices DROP COLUMN IF EXISTS ubl_xml;
ALTER TABLE zatca_invoices DROP COLUMN IF EXISTS digital_stamp;
ALTER TABLE zatca_invoices DROP COLUMN IF EXISTS qr_tlv;
ALTER TABLE zatca_invoices DROP COLUMN IF EXISTS clearance_status;
ALTER TABLE zatca_invoices ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
