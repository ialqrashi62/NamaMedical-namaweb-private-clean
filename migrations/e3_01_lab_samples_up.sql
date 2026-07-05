-- ============================================================
-- e3_01_lab_samples_up.sql
-- E3 LABORATORY / LIS — specimen lifecycle (1 of group E3).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: تتبع دورة حياة العينة المخبرية: Collected -> Received -> InProcess
--   -> Reported (أو Rejected). (التحقق Verified مفهوم خاص بالنتيجة lab_results.status لا بالعينة.)
--   صف واحد لكل عينة، يشير إلى أمر المختبر (lab_order_id
--   يطابق lab_radiology_orders.id اليوم؛ وعند تفعيل E-X يطابق orders.id من النوع 'lab').
--   الربط على patient_id مثل بقية النظام؛ لا يوجد جدول encounters بعد.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id)
--   + ENABLE+FORCE RLS + سياسة عزل tenant_id + فهرس tenant_id.
--   barcode فريد لكل مستأجر (UNIQUE (tenant_id, barcode)) — لمنع تصادم الباركود ولمطابقة HL7.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS للـ CHECK
--   + CREATE [UNIQUE] INDEX IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS lab_samples (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    lab_order_id INTEGER,                                  -- -> lab_radiology_orders.id (legacy) / orders.id (E-X, type='lab')
    patient_id INTEGER,
    barcode TEXT NOT NULL,                                 -- server-generated specimen barcode (LAB-{order}-{seq})
    state TEXT NOT NULL DEFAULT 'Collected',
    collected_by INTEGER,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INTEGER,
    received_at TIMESTAMP,
    rejected_reason TEXT,
    rejected_by INTEGER,
    rejected_at TIMESTAMP,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- state set limited to REACHABLE states only; 'Verified' was unreachable (no transition advances
    -- a sample to 'Verified' — verification is a RESULT concept, samples go ...InProcess->Reported).
    CONSTRAINT chk_lab_samples_state CHECK (state IN ('Collected','Received','InProcess','Reported','Rejected'))
);

-- idempotent: ensure the state CHECK exists even when the table pre-dates this migration.
ALTER TABLE lab_samples DROP CONSTRAINT IF EXISTS chk_lab_samples_state;
ALTER TABLE lab_samples ADD CONSTRAINT chk_lab_samples_state CHECK (state IN ('Collected','Received','InProcess','Reported','Rejected'));

CREATE INDEX IF NOT EXISTS idx_lab_samples_tenant_id ON lab_samples (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_lab_order_id ON lab_samples (lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_patient_id ON lab_samples (patient_id);
-- barcode unique PER tenant (not globally) so two tenants may reuse a serial namespace safely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_samples_tenant_barcode ON lab_samples (tenant_id, barcode);

ALTER TABLE lab_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_samples FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_samples_tenant_isolation ON lab_samples;
CREATE POLICY rls_lab_samples_tenant_isolation ON lab_samples
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
