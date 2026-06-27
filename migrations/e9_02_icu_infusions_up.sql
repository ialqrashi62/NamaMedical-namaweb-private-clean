-- ============================================================
-- e9_02_icu_infusions_up.sql
-- E9 ICU / CRITICAL CARE — NEW table: icu_infusions (continuous IV drips / infusions).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: جدول جديد لتسجيل التسريبات الوريدية المستمرة (الأدوية/المعدّل/الوحدات) المرتبطة بتنويم
--   عناية مركزة نشِط. هذه الفجوة الحقيقية في E9 (لم يوجد مفهوم infusions/drips سابقاً). جدول جديد
--   كلياً لذا tenant_id INTEGER NOT NULL REFERENCES tenants(id) منذ الإنشاء + FK للتنويم/المريض
--   + FORCE RLS بالقالب القانوني (USING/WITH CHECK على app.tenant_id).
--   ملاحظة: هذا الجدول NOT مُضاف إلى bootstrap في db_postgres.js (هجرة مرشّحة فقط).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP/ADD POLICY IF EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS icu_infusions (
    id              SERIAL PRIMARY KEY,
    admission_id    INTEGER NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    drug            TEXT NOT NULL,
    concentration   TEXT DEFAULT '',
    rate            REAL DEFAULT 0,
    rate_unit       TEXT DEFAULT 'mL/hr',
    dose            REAL DEFAULT 0,
    dose_unit       TEXT DEFAULT '',
    route           TEXT DEFAULT 'IV',
    status          TEXT DEFAULT 'Running',
    allergy_warning TEXT,
    notes           TEXT DEFAULT '',
    recorded_by     TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_icu_infusions_status CHECK (status IN ('Running','Paused','Stopped','Completed'))
);

CREATE INDEX IF NOT EXISTS idx_icu_infusions_tenant_id ON icu_infusions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_icu_infusions_admission ON icu_infusions (tenant_id, admission_id);

ALTER TABLE icu_infusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_infusions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_infusions_tenant_isolation ON icu_infusions;
CREATE POLICY rls_icu_infusions_tenant_isolation ON icu_infusions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
