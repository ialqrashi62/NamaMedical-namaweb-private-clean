-- ============================================================
-- e2_03_record_access_up.sql
-- E2 MEDICAL RECORDS / HIM — Record Access Log + Break-Glass.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سجل وصول PHI لكل فتح للملف الطولي (من فتح / أي مريض / متى / أي مستأجر) — وهو سجل تدقيق
--   HIM المخصّص، منفصل عن audit_trail العام. access_type يدعم normal و break_glass؛
--   break-glass يتطلّب reason ويُسجَّل هنا + ينشئ تنبيه BREAK_GLASS في audit_trail.
--   net-new (لا سابقة) — يتبع نفس قالب الـ FORCE RLS الكنسي.
--
--   tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS + سياسة عزل tenant_id + فهرس. fail-closed.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS
--   + CREATE INDEX IF NOT EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS record_access_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL,
    accessor_id INTEGER,
    access_type TEXT NOT NULL DEFAULT 'normal',
    reason TEXT DEFAULT '',
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_record_access_type CHECK (access_type IN ('normal', 'break_glass'))
);

-- idempotent: ensure the access_type CHECK exists even when the table pre-dates this migration.
ALTER TABLE record_access_log DROP CONSTRAINT IF EXISTS chk_record_access_type;
ALTER TABLE record_access_log ADD CONSTRAINT chk_record_access_type CHECK (access_type IN ('normal', 'break_glass'));

CREATE INDEX IF NOT EXISTS idx_record_access_log_tenant_id ON record_access_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_record_access_log_patient_id ON record_access_log (patient_id);
CREATE INDEX IF NOT EXISTS idx_record_access_log_at ON record_access_log (at);

ALTER TABLE record_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_access_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_record_access_log_tenant_isolation ON record_access_log;
CREATE POLICY rls_record_access_log_tenant_isolation ON record_access_log
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
