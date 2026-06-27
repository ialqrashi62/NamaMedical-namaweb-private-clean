-- ============================================================
-- e5_02_pharmacy_dispense_up.sql
-- E5 PHARMACY — Pharmacist verification + dispense ledger (per-batch FEFO line).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سجل صرف مستقل (pharmacy_dispense) يربط عنصر طابور الوصفة (prescription_id) + المريض + الدفعة
--   المصروفة منها (drug_batch_id من drug_batches) + الكمية + من تحقق (verified_by) + من صرف (dispensed_by).
--   آلة الحالة: عنصر الطابور Pending -> Verified -> Dispensed (أو Rejected). الصرف لا يتم إلا بعد التحقق.
--   نفس قالب الـ FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS + عزل + فهرس.
--
--   كذلك يضيف هذا الملف (idempotent) أعمدة حالة التحقق على pharmacy_prescriptions_queue:
--   verified_by / verified_at (الجدول مُهيأ خارج النطاق route_level_ddl_batch_c؛ نضيف فقط ما ينقص).
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + ADD COLUMN IF NOT EXISTS
--   + DROP/ADD CONSTRAINT IF EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS pharmacy_dispense (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id INTEGER,
    prescription_id INTEGER,                               -- -> pharmacy_prescriptions_queue.id (queue item dispensed)
    patient_id INTEGER,
    drug_id INTEGER,                                       -- -> pharmacy_drug_catalog.id
    drug_batch_id INTEGER REFERENCES drug_batches(id),     -- the FEFO batch the qty was taken from
    drug_name TEXT,
    qty INTEGER NOT NULL DEFAULT 0,
    verified_by INTEGER,                                   -- pharmacist who passed the CDS verify checkpoint
    verified_at TIMESTAMP,
    dispensed_by INTEGER,
    dispensed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'Dispensed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pharmacy_dispense_qty CHECK (qty >= 0),
    CONSTRAINT chk_pharmacy_dispense_status CHECK (status IN ('Dispensed','Reversed'))
);

ALTER TABLE pharmacy_dispense DROP CONSTRAINT IF EXISTS chk_pharmacy_dispense_qty;
ALTER TABLE pharmacy_dispense ADD CONSTRAINT chk_pharmacy_dispense_qty CHECK (qty >= 0);
ALTER TABLE pharmacy_dispense DROP CONSTRAINT IF EXISTS chk_pharmacy_dispense_status;
ALTER TABLE pharmacy_dispense ADD CONSTRAINT chk_pharmacy_dispense_status CHECK (status IN ('Dispensed','Reversed'));

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_tenant_id ON pharmacy_dispense (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_prescription ON pharmacy_dispense (tenant_id, prescription_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_patient ON pharmacy_dispense (tenant_id, patient_id);

ALTER TABLE pharmacy_dispense ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_dispense FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_dispense_tenant_isolation ON pharmacy_dispense;
CREATE POLICY rls_pharmacy_dispense_tenant_isolation ON pharmacy_dispense
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ----- verification-state columns on the existing queue (table provisioned out-of-band) -----
-- Guarded so this migration is safe even if pharmacy_prescriptions_queue is not yet present.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pharmacy_prescriptions_queue') THEN
    ALTER TABLE pharmacy_prescriptions_queue ADD COLUMN IF NOT EXISTS verified_by INTEGER;
    ALTER TABLE pharmacy_prescriptions_queue ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
  END IF;
END
$do$;

COMMIT;
