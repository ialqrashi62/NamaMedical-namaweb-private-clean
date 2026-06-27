-- ============================================================
-- e6_03_nursing_scores_up.sql
-- E6 NURSING / MAR — Nursing scores (Morse fall risk, Braden, NEWS/MEWS, Pain).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: حفظ المقاييس التمريضية المحسوبة من جهة الخادم (nursing_scores.js): score_type يحدد المقياس،
--   score القيمة الرقمية، band التصنيف (Low/Moderate/High...)، inputs_json المدخلات الخام للتدقيق.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS للـ score_type CHECK
--   + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS. مغلّف في BEGIN/COMMIT.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS nursing_scores (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    patient_id INTEGER NOT NULL REFERENCES patients(id),  -- right-patient FK
    score_type TEXT NOT NULL DEFAULT 'news',              -- morse | braden | news | pain
    score INTEGER NOT NULL DEFAULT 0,
    band TEXT DEFAULT '',
    inputs_json TEXT DEFAULT '',                          -- raw observations the server scored (audit)
    recorded_by INTEGER,
    recorded_by_name TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_nursing_score_type CHECK (score_type IN ('morse', 'braden', 'news', 'pain'))
);

ALTER TABLE nursing_scores DROP CONSTRAINT IF EXISTS chk_nursing_score_type;
ALTER TABLE nursing_scores ADD CONSTRAINT chk_nursing_score_type CHECK (score_type IN ('morse', 'braden', 'news', 'pain'));

CREATE INDEX IF NOT EXISTS idx_nursing_scores_tenant_id ON nursing_scores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nursing_scores_patient_id ON nursing_scores (patient_id);

ALTER TABLE nursing_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_scores_tenant_isolation ON nursing_scores;
CREATE POLICY rls_nursing_scores_tenant_isolation ON nursing_scores
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
