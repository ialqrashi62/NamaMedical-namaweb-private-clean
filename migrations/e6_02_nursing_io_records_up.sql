-- ============================================================
-- e6_02_nursing_io_records_up.sql
-- E6 NURSING / MAR — Intake/Output (I/O) records.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: تسجيل المُدخلات والمُخرجات (I/O) للمريض المنوّم (سوائل/بول/إلخ) بوحدة مللي. direction: intake/output.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS للـ direction CHECK
--   + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS. مغلّف في BEGIN/COMMIT.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS nursing_io_records (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL REFERENCES patients(id),  -- right-patient FK
    direction TEXT NOT NULL DEFAULT 'intake',             -- intake | output
    category TEXT DEFAULT '',                             -- e.g. Oral, IV, Urine, Drain, Emesis
    amount_ml INTEGER NOT NULL DEFAULT 0,
    recorded_by INTEGER,
    recorded_by_name TEXT DEFAULT '',
    shift TEXT DEFAULT 'Morning',
    notes TEXT DEFAULT '',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_io_direction CHECK (direction IN ('intake', 'output'))
);

ALTER TABLE nursing_io_records DROP CONSTRAINT IF EXISTS chk_io_direction;
ALTER TABLE nursing_io_records ADD CONSTRAINT chk_io_direction CHECK (direction IN ('intake', 'output'));

CREATE INDEX IF NOT EXISTS idx_nursing_io_records_tenant_id ON nursing_io_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nursing_io_records_patient_id ON nursing_io_records (patient_id);

ALTER TABLE nursing_io_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_io_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_io_records_tenant_isolation ON nursing_io_records;
CREATE POLICY rls_nursing_io_records_tenant_isolation ON nursing_io_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
