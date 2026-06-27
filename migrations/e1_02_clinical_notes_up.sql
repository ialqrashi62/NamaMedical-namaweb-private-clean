-- ============================================================
-- e1_02_clinical_notes_up.sql
-- E1 DOCTOR STATION — Clinical Notes (SOAP, sign+lock).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ملاحظات سريرية منظمة بصيغة SOAP (subjective/objective/assessment/plan) منفصلة عن
--   medical_records المسطّح. الربط على patient_id؛ encounter_ref قابل للـ NULL (يطابق orders.encounter_id).
--   توقيع/قفل بنفس نمط medical_records (emr_status/signed_by/signed_at/integrity_hash) وإصلاحات emr_amendments.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS
--   + DROP/ADD CONSTRAINT IF EXISTS للـ CHECKs (يحترم الجداول السابقة).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS clinical_notes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL,
    encounter_ref INTEGER,                                 -- nullable: no encounters table yet (mirrors orders.encounter_id)
    type TEXT NOT NULL DEFAULT 'SOAP',
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    author_id INTEGER,
    emr_status TEXT NOT NULL DEFAULT 'draft',              -- draft | locked (mirrors medical_records sign/lock)
    signed_by_user_id INTEGER,
    signed_at TIMESTAMP,
    locked_at TIMESTAMP,
    integrity_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_clinical_notes_type CHECK (type IN ('SOAP')),
    CONSTRAINT chk_clinical_notes_status CHECK (emr_status IN ('draft', 'locked'))
);

-- idempotent: ensure CHECKs exist even when the table pre-dates this migration. DROP then ADD.
ALTER TABLE clinical_notes DROP CONSTRAINT IF EXISTS chk_clinical_notes_type;
ALTER TABLE clinical_notes ADD CONSTRAINT chk_clinical_notes_type CHECK (type IN ('SOAP'));
ALTER TABLE clinical_notes DROP CONSTRAINT IF EXISTS chk_clinical_notes_status;
ALTER TABLE clinical_notes ADD CONSTRAINT chk_clinical_notes_status CHECK (emr_status IN ('draft', 'locked'));

CREATE INDEX IF NOT EXISTS idx_clinical_notes_tenant_id ON clinical_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes (patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_ref ON clinical_notes (encounter_ref);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_clinical_notes_tenant_isolation ON clinical_notes;
CREATE POLICY rls_clinical_notes_tenant_isolation ON clinical_notes
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
