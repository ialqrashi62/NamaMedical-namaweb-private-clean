-- ============================================================
-- e1_01_problems_up.sql
-- E1 DOCTOR STATION — Problem List (coded diagnoses).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ترقية التشخيص من نص حر (medical_records.icd10_codes / medical_records_coding.primary_icd10)
--   إلى قائمة مشاكل مُرمّزة (problems). الربط على patient_id مثل بقية النظام؛ encounter_ref قابل للـ NULL
--   (لا يوجد جدول encounters؛ الأقرب visit_lifecycle) ويطابق orders.encounter_id.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS
--   + DROP/ADD CONSTRAINT IF EXISTS للـ status CHECK (يحترم الجداول السابقة).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS problems (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL,
    encounter_ref INTEGER,                                 -- nullable: no encounters table yet (mirrors orders.encounter_id)
    icd10 TEXT,
    snomed TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    onset_date DATE,
    recorded_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_problems_status CHECK (status IN ('active', 'resolved'))
);

-- idempotent: ensure the status CHECK exists even when the table pre-dates this migration
-- (CREATE TABLE IF NOT EXISTS skips the inline constraint on an existing table). DROP then ADD.
ALTER TABLE problems DROP CONSTRAINT IF EXISTS chk_problems_status;
ALTER TABLE problems ADD CONSTRAINT chk_problems_status CHECK (status IN ('active', 'resolved'));

CREATE INDEX IF NOT EXISTS idx_problems_tenant_id ON problems (tenant_id);
CREATE INDEX IF NOT EXISTS idx_problems_patient_id ON problems (patient_id);
CREATE INDEX IF NOT EXISTS idx_problems_encounter_ref ON problems (encounter_ref);

ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_problems_tenant_isolation ON problems;
CREATE POLICY rls_problems_tenant_isolation ON problems
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
