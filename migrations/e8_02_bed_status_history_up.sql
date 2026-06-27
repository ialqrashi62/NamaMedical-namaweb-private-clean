-- ============================================================
-- e8_02_bed_status_history_up.sql
-- E8 INPATIENT / ADT — NEW table: bed_status_history (audit of bed-status transitions).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: جدول جديد لتتبّع دورة حياة حالة السرير (Available/Reserved/Occupied/Cleaning/Blocked)
--   — من حالة إلى حالة، بواسطة من، ومتى، مع ربطها بالتنويم/المريض عند توفّرهما. جدول جديد كلياً
--   لذا tenant_id INTEGER NOT NULL REFERENCES tenants(id) منذ الإنشاء + FORCE RLS بالقالب القانوني.
--   ملاحظة: هذا الجدول NOT مُضاف إلى bootstrap في db_postgres.js (هجرة مرشّحة فقط).
--
-- idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP/ADD POLICY IF EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS bed_status_history (
    id                SERIAL PRIMARY KEY,
    bed_id            INTEGER NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
    admission_id      INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
    patient_id        INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    from_status       TEXT NOT NULL,
    to_status         TEXT NOT NULL,
    reason            TEXT DEFAULT '',
    changed_by        TEXT DEFAULT '',
    changed_at        TIMESTAMP DEFAULT now(),
    tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id       INTEGER,
    CONSTRAINT chk_bed_status_history_to   CHECK (to_status   IN ('Available','Reserved','Occupied','Cleaning','Blocked')),
    CONSTRAINT chk_bed_status_history_from CHECK (from_status IN ('Available','Reserved','Occupied','Cleaning','Blocked'))
);

CREATE INDEX IF NOT EXISTS idx_bed_status_history_tenant_id ON bed_status_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bed_status_history_bed ON bed_status_history (tenant_id, bed_id);

ALTER TABLE bed_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_bed_status_history_tenant_isolation ON bed_status_history;
CREATE POLICY rls_bed_status_history_tenant_isolation ON bed_status_history
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
