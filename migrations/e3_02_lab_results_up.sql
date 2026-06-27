-- ============================================================
-- e3_02_lab_results_up.sql
-- E3 LABORATORY / LIS — structured, LOINC-coded results (2 of group E3).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ترقية lab_results من الهيكل اليتيم (order_id, test_id, result_value, is_abnormal,
--   notes) إلى نتائج بنيوية مُرمّزة LOINC مع وحدات ونطاق مرجعي وحالة تحقق (verification).
--   ADDITIVE: نحافظ على الأعمدة القديمة (لا حذف) ونضيف الأعمدة الجديدة عبر
--   ADD COLUMN IF NOT EXISTS حتى لو كان الجدول موجوداً مسبقاً (CREATE TABLE IF NOT EXISTS
--   يتخطى الجدول الموجود فلا يضيف الأعمدة وحده).
--
--   tenant_id: نضيفه ثم نطبّق NOT NULL فقط عندما لا توجد صفوف NULL (الجدول يتيم/فارغ في
--   الإنتاج). إن وُجدت صفوف قديمة بدون tenant_id يبقى العمود NULLABLE (لا نُفشل الترحيل
--   ولا نخمّن المستأجر) — يُعالَج عبر backfill مستقل قبل فرض NOT NULL.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + DROP/ADD CONSTRAINT
--   IF EXISTS + CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + DO-block guards.
-- ============================================================
BEGIN;

-- Base table (created only if it does not already exist; legacy orphan keeps its columns).
CREATE TABLE IF NOT EXISTS lab_results (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    test_id INTEGER,
    result_value TEXT DEFAULT '',
    is_abnormal INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);

-- ---- additive structured columns (LIS) ----
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS lab_sample_id INTEGER;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS loinc TEXT;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS test_name TEXT DEFAULT '';
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS value TEXT DEFAULT '';
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '';
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS normal_range TEXT DEFAULT '';
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS ref_low REAL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS ref_high REAL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS abnormal_flag TEXT;          -- 'N'|'L'|'H'|'HH'|'LL'
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS delta_pct REAL;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS is_critical INTEGER DEFAULT 0;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'; -- pending|held|verified
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS hold_reasons TEXT DEFAULT '';  -- comma list from lis.autoVerify
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS verified_by INTEGER;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS reported INTEGER DEFAULT 0;    -- 1 once released to chart
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- status CHECK (DROP then ADD; idempotent and tolerant of pre-existing rows == default 'pending').
ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS chk_lab_results_status;
ALTER TABLE lab_results ADD CONSTRAINT chk_lab_results_status CHECK (status IN ('pending','held','verified'));

-- FK to tenants(id) — added only if not present yet (legacy orphan had no tenant_id).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='lab_results'::regclass AND confrelid='tenants'::regclass AND contype='f'
    ) THEN
        ALTER TABLE lab_results
            ADD CONSTRAINT fk_lab_results_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Enforce tenant_id NOT NULL ONLY when safe (no NULL rows). FAIL-SAFE: never coerce / never guess.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM lab_results WHERE tenant_id IS NULL) THEN
        BEGIN
            ALTER TABLE lab_results ALTER COLUMN tenant_id SET NOT NULL;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'lab_results.tenant_id left NULLABLE (could not set NOT NULL): %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'lab_results has NULL tenant_id rows; left NULLABLE pending backfill before NOT NULL.';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_id ON lab_results (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_lab_sample_id ON lab_results (lab_sample_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_order_id ON lab_results (order_id);

ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_results_tenant_isolation ON lab_results;
CREATE POLICY rls_lab_results_tenant_isolation ON lab_results
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ============================================================
-- lab_critical_callbacks — documented critical-value call-back log (CLINICAL SAFETY).
-- A critical result CANNOT be released to 'Reported' until a call-back row exists
-- (who notified whom, and when) — enforced server-side. Greenfield child table.
-- ============================================================
CREATE TABLE IF NOT EXISTS lab_critical_callbacks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    result_id INTEGER NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
    notified_to TEXT NOT NULL,                             -- physician / responsible party notified
    notified_by INTEGER,                                   -- staff user id who made the call-back
    notified_by_name TEXT DEFAULT '',
    notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ack INTEGER DEFAULT 0,                                  -- 1 once the recipient acknowledged read-back
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lab_callbacks_tenant_id ON lab_critical_callbacks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_callbacks_result_id ON lab_critical_callbacks (result_id);

ALTER TABLE lab_critical_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_critical_callbacks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_callbacks_tenant_isolation ON lab_critical_callbacks;
CREATE POLICY rls_lab_callbacks_tenant_isolation ON lab_critical_callbacks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
