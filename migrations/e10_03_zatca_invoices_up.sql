-- ============================================================
-- e10_03_zatca_invoices_up.sql
-- E10 ZATCA PHASE-2 E-INVOICE — harden EXISTING zatca_invoices for UBL/stamp/QR + tenant isolation.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: zatca_invoices قائم سابقاً (bootstrap، يملك tenant_id/facility_id/branch_id بلا NOT NULL/FK
--   ولا عزل). نضيف:
--     - tenant_id NOT NULL + FK -> tenants(id) + FK invoice_id -> invoices(id) + FORCE RLS.
--     - ubl_xml TEXT (UBL 2.1) + digital_stamp TEXT (placeholder حتى توفّر CSID) + xml_hash (موجود)
--       + qr_tlv TEXT (TLV base64) + clearance_status enum-CHECK (NOT_SUBMITTED/RECORDED/CLEARED/REJECTED).
--     - فهرس (tenant_id, invoice_id).
--   جدول قائم سابقاً => down لا يُسقطه. لا إضافة جداول جديدة إلى bootstrap عبر هذه الهجرة. idempotent.
-- ============================================================
BEGIN;

ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE zatca_invoices SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE zatca_invoices ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS fk_zatca_tenant;
ALTER TABLE zatca_invoices ADD CONSTRAINT fk_zatca_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS fk_zatca_invoice;
ALTER TABLE zatca_invoices ADD CONSTRAINT fk_zatca_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS ubl_xml TEXT DEFAULT '';
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS digital_stamp TEXT DEFAULT '';
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS qr_tlv TEXT DEFAULT '';
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS clearance_status TEXT DEFAULT 'NOT_SUBMITTED';
UPDATE zatca_invoices SET clearance_status = 'NOT_SUBMITTED' WHERE clearance_status IS NULL;
ALTER TABLE zatca_invoices DROP CONSTRAINT IF EXISTS chk_zatca_clearance;
ALTER TABLE zatca_invoices ADD CONSTRAINT chk_zatca_clearance
    CHECK (clearance_status IN ('NOT_SUBMITTED','RECORDED','CLEARED','REJECTED'));

-- one e-invoice artifact per source invoice per tenant (idempotent generate -> upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_zatca_tenant_invoice ON zatca_invoices (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_zatca_tenant_id ON zatca_invoices (tenant_id);

ALTER TABLE zatca_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE zatca_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_zatca_tenant_isolation ON zatca_invoices;
CREATE POLICY rls_zatca_tenant_isolation ON zatca_invoices
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
