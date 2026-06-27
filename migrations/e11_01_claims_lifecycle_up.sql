-- ============================================================
-- e11_01_claims_lifecycle_up.sql
-- E11 INSURANCE / NPHIES — harden the EXISTING insurance_claims into a tenant-isolated,
--   server-authoritative claims-lifecycle table linked to invoices/patients/companies.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: insurance_claims قائم سابقاً (bootstrap؛ يملك tenant_id/facility_id/branch_id بلا NOT NULL/FK
--   ولا عزل RLS؛ status حر النص؛ بلا ربط بالفاتورة/المريض/الشركة؛ بلا آلة حالة دورة حياة). نطبّق:
--     - tenant_id NOT NULL + FK -> tenants(id) + FORCE RLS بالقالب القانوني.
--     - patient_id / invoice_id / admission_id / insurance_company_id / pre_auth_id أعمدة ربط
--       + FK (ON DELETE SET NULL للمراجع الاختيارية، CASCADE للمستأجر).
--     - lifecycle_status enum-CHECK (draft/submitted/adjudicated/remittance_posted/denied/appealed)
--       — آلة الحالة الموثوقة من الخادم؛ status القديم (Pending/Approved/Rejected) يبقى للتوافق العكسي.
--     - مبالغ NUMERIC(14,2): claim_amount / approved_amount / paid_amount / patient_share.
--     - nphies_request_json / nphies_response_json / nphies_claim_ref + طوابع submitted/adjudicated.
--   جدول قائم سابقاً => down لا يُسقطه؛ يعكس الإضافات فقط.
--   لا إضافة جداول جديدة إلى bootstrap في db_postgres.js عبر هذه الهجرة (candidate-only).
--
-- idempotent: ADD COLUMN IF NOT EXISTS + backfill + SET NOT NULL + DROP/ADD CONSTRAINT IF EXISTS
--   + ALTER TYPE USING + CREATE INDEX IF NOT EXISTS + DROP/CREATE POLICY. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ----- tenant isolation -----
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE insurance_claims SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE insurance_claims ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_tenant;
ALTER TABLE insurance_claims ADD CONSTRAINT fk_claims_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ----- entity links -----
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS patient_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS invoice_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS admission_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS insurance_company_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS pre_auth_id INTEGER;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_patient;
ALTER TABLE insurance_claims ADD CONSTRAINT fk_claims_patient
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_invoice;
ALTER TABLE insurance_claims ADD CONSTRAINT fk_claims_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_company;
ALTER TABLE insurance_claims ADD CONSTRAINT fk_claims_company
    FOREIGN KEY (insurance_company_id) REFERENCES insurance_companies(id) ON DELETE SET NULL;

-- ----- lifecycle state machine (server-authoritative) -----
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'draft';
-- map legacy free-text status into the new lifecycle where recognisable
UPDATE insurance_claims SET lifecycle_status = CASE
        WHEN status ILIKE 'approved%' THEN 'adjudicated'
        WHEN status ILIKE 'rejected%' THEN 'denied'
        ELSE 'draft' END
 WHERE lifecycle_status IS NULL;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS chk_claims_lifecycle;
ALTER TABLE insurance_claims ADD CONSTRAINT chk_claims_lifecycle
    CHECK (lifecycle_status IN ('draft','submitted','adjudicated','remittance_posted','denied','appealed'));

-- ----- monetary precision (REAL -> NUMERIC) + adjudication amounts -----
ALTER TABLE insurance_claims ALTER COLUMN claim_amount TYPE NUMERIC(14,2) USING ROUND(claim_amount::numeric, 2);
ALTER TABLE insurance_claims ALTER COLUMN claim_amount SET DEFAULT 0;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS patient_share NUMERIC(14,2) DEFAULT 0;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS chk_claims_amounts;
ALTER TABLE insurance_claims ADD CONSTRAINT chk_claims_amounts
    CHECK (claim_amount >= 0 AND approved_amount >= 0 AND paid_amount >= 0 AND patient_share >= 0);

-- ----- NPHIES envelope + lifecycle timestamps + actor -----
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS nphies_claim_ref TEXT DEFAULT '';
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS nphies_request_json TEXT DEFAULT '';
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS nphies_response_json TEXT DEFAULT '';
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS adjudicated_at TIMESTAMP;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS created_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_ins_claims_tenant_id ON insurance_claims (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ins_claims_tenant_lifecycle ON insurance_claims (tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_ins_claims_invoice ON insurance_claims (tenant_id, invoice_id);

ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_claims_tenant_isolation ON insurance_claims;
CREATE POLICY rls_claims_tenant_isolation ON insurance_claims
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
