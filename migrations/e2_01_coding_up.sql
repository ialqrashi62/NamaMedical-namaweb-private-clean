-- ============================================================
-- e2_01_coding_up.sql
-- E2 MEDICAL RECORDS / HIM — Clinical Coding (ICD10 / SNOMED / CPT).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: جدول ترميز مُنظّم (coding) لربط أكواد ICD10/SNOMED/CPT بزيارة/مريض،
--   يحلّ محل الحقول الحرة في medical_records_coding (التي لا تملك tenant_id ولا RLS).
--   الربط على patient_id مثل بقية النظام؛ encounter_ref قابل للـ NULL (لا يوجد جدول encounters؛
--   الأقرب visit_lifecycle) ويطابق orders.encounter_id / E1 problems.encounter_ref.
--
--   نفس قالب الـ FORCE RLS الكنسي: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id. fail-closed: NULLIF(current_setting('app.tenant_id'..)).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS
--   + CREATE INDEX IF NOT EXISTS. لا يلمس medical_records_coding القائم (تركة) — إضافة جانبية فقط.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS coding (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL,
    encounter_ref INTEGER,                                 -- nullable: no encounters table yet (mirrors orders.encounter_id)
    code_system TEXT NOT NULL DEFAULT 'ICD10',
    code TEXT NOT NULL,
    description TEXT DEFAULT '',
    coder_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_coding_code_system CHECK (code_system IN ('ICD10', 'SNOMED', 'CPT'))
);

-- idempotent: ensure the code_system CHECK exists even when the table pre-dates this migration
-- (CREATE TABLE IF NOT EXISTS skips the inline constraint on an existing table). DROP then ADD.
ALTER TABLE coding DROP CONSTRAINT IF EXISTS chk_coding_code_system;
ALTER TABLE coding ADD CONSTRAINT chk_coding_code_system CHECK (code_system IN ('ICD10', 'SNOMED', 'CPT'));

CREATE INDEX IF NOT EXISTS idx_coding_tenant_id ON coding (tenant_id);
CREATE INDEX IF NOT EXISTS idx_coding_patient_id ON coding (patient_id);
CREATE INDEX IF NOT EXISTS idx_coding_encounter_ref ON coding (encounter_ref);

ALTER TABLE coding ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_coding_tenant_isolation ON coding;
CREATE POLICY rls_coding_tenant_isolation ON coding
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
