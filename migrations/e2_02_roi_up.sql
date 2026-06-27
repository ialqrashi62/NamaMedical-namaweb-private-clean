-- ============================================================
-- e2_02_roi_up.sql
-- E2 MEDICAL RECORDS / HIM — Release of Information (ROI) requests.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: تتبّع طلبات الإفصاح عن المعلومات (إفراج السجل الطبي لطرف خارجي) مع موافقة/رفض وتاريخ إفراج.
--   يبني على دلالات medical_records_requests (file-room) لكن مع حالة موافقة وإفراج مدقّقة + RLS.
--   الربط على patient_id؛ الحالة status محصورة pending/approved/released/denied.
--
--   نفس قالب الـ FORCE RLS الكنسي: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id. fail-closed.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS
--   + CREATE INDEX IF NOT EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS roi_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL,
    requester TEXT NOT NULL DEFAULT '',
    purpose TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by INTEGER,
    approved_by INTEGER,
    released_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_roi_status CHECK (status IN ('pending', 'approved', 'released', 'denied'))
);

-- idempotent: ensure the status CHECK exists even when the table pre-dates this migration.
ALTER TABLE roi_requests DROP CONSTRAINT IF EXISTS chk_roi_status;
ALTER TABLE roi_requests ADD CONSTRAINT chk_roi_status CHECK (status IN ('pending', 'approved', 'released', 'denied'));

CREATE INDEX IF NOT EXISTS idx_roi_requests_tenant_id ON roi_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_roi_requests_patient_id ON roi_requests (patient_id);
CREATE INDEX IF NOT EXISTS idx_roi_requests_status ON roi_requests (status);

ALTER TABLE roi_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_roi_requests_tenant_isolation ON roi_requests;
CREATE POLICY rls_roi_requests_tenant_isolation ON roi_requests
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
