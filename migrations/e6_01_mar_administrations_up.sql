-- ============================================================
-- e6_01_mar_administrations_up.sql
-- E6 NURSING / MAR — Medication Administration Record (barcode 5-rights, server-enforced).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سجل إعطاء الأدوية (MAR) المرتبط بطابور الوصفات (pharmacy_prescriptions_queue) كمصدر للجرعات.
--   كل صف = حدث إعطاء واحد بعد التحقق من الحقوق الخمسة (المريض/الدواء/الجرعة/الطريقة/الوقت) من جهة الخادم.
--   prescription_ref يربط الجرعة بالوصفة المصدر (مثل pharmacy_dispense.prescription_id في E5)، NULL مسموح
--   للأدوية خارج الطابور. الحالة status: given/refused/held. الشاهد witness للأدوية عالية الخطورة.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS للـ status CHECK
--   + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS. مغلّف في BEGIN/COMMIT.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS mar_administrations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL REFERENCES patients(id),                   -- right-patient FK (server-resolved, never trusted)
    prescription_ref INTEGER REFERENCES pharmacy_prescriptions_queue(id),  -- nullable: source dose row in pharmacy_prescriptions_queue
    medication TEXT NOT NULL,
    dose TEXT,
    route TEXT,
    scheduled_at TIMESTAMP,                                -- the planned/due time the nurse acted against
    administered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,   -- server clock (never client clock)
    administered_by INTEGER,                               -- system_users.id of the nurse
    administered_by_name TEXT DEFAULT '',
    witness_by INTEGER,                                    -- second-nurse witness (high-alert drugs)
    witness_by_name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'given',
    override_reason TEXT DEFAULT '',                       -- dose/route/time-window override justification
    cds_warnings TEXT DEFAULT '',                          -- bonus CDS allergy/interaction findings at administer time
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_mar_status CHECK (status IN ('given', 'refused', 'held'))
);

-- idempotent: ensure the status CHECK exists even when the table pre-dates this migration
ALTER TABLE mar_administrations DROP CONSTRAINT IF EXISTS chk_mar_status;
ALTER TABLE mar_administrations ADD CONSTRAINT chk_mar_status CHECK (status IN ('given', 'refused', 'held'));

CREATE INDEX IF NOT EXISTS idx_mar_administrations_tenant_id ON mar_administrations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_mar_administrations_patient_id ON mar_administrations (patient_id);
CREATE INDEX IF NOT EXISTS idx_mar_administrations_prescription_ref ON mar_administrations (prescription_ref);

ALTER TABLE mar_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mar_administrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_mar_administrations_tenant_isolation ON mar_administrations;
CREATE POLICY rls_mar_administrations_tenant_isolation ON mar_administrations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
