-- ============================================================
-- e3_03_lab_qc_up.sql
-- E3 LABORATORY / LIS — quality control (Levey-Jennings) (3 of group E3).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: تسجيل نقاط ضبط الجودة لكل محلّل/مادة/مستوى مع الهدف (target) والانحراف المعياري
--   (sd) والقيمة المرصودة (value)، وحساب علم Westgard (مثل 1-3s) عند الإدخال. westgard_flag
--   يُملأ من lis.qcFlag في طبقة الخادم.
--   نفس قالب الـ 150 سياسة FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id)
--   + ENABLE+FORCE RLS + سياسة عزل tenant_id + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS lab_qc (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    analyzer TEXT NOT NULL DEFAULT '',
    analyte TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',                        -- e.g. 'L1' | 'L2' | 'L3' (control level)
    value REAL,                                            -- observed control value
    target REAL,                                           -- target mean
    sd REAL,                                               -- standard deviation
    z REAL,                                                -- computed z-score ((value-target)/sd)
    westgard_flag TEXT DEFAULT '',                         -- 'in_control' | '1-2s_warning' | '1-3s' | 'invalid_qc_inputs'
    breach INTEGER DEFAULT 0,                              -- 1 when out-of-control (|z|>=3 or invalid)
    reagent_lot TEXT DEFAULT '',
    entered_by INTEGER,
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lab_qc_tenant_id ON lab_qc (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_qc_analyzer ON lab_qc (analyzer);

ALTER TABLE lab_qc ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_qc FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_qc_tenant_isolation ON lab_qc;
CREATE POLICY rls_lab_qc_tenant_isolation ON lab_qc
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
