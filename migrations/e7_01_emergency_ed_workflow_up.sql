-- ============================================================
-- e7_01_emergency_ed_workflow_up.sql
-- E7 EMERGENCY DEPARTMENT — ESI triage + workflow state machine on emergency_visits.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ترقية جدول زيارات الطوارئ القائم (emergency_visits) بأعمدة سير عمل الطوارئ:
--   مؤشر شدة الطوارئ المحسوب خادمياً (esi_level / esi_rationale)، مرحلة العمل (er_phase)،
--   وأختام الوقت (triage_started_at / provider_assigned_at / time_to_provider_min) ونوع التصرف
--   (disposition_type). ثم تطبيق نفس قالب الـ 150 سياسة FORCE RLS على emergency_visits
--   (الجدول حالياً يملك tenant_id لكن بلا سياسة عزل — سدّ ثغرة E7).
--
-- emergency_visits جدول قائم: نستخدم ADD COLUMN IF NOT EXISTS، نملأ tenant_id الفارغ، ثم نضبط
--   NOT NULL ونضيف FK إلى tenants(id) بشكل idempotent. patient_id يبقى INTEGER (نمط النظام
--   لا يفرض FK على patient_id في الجداول القائمة — التحقق طبقة-تطبيق + RLS).
--
-- idempotent: ADD COLUMN IF NOT EXISTS + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS
--   + CREATE INDEX IF NOT EXISTS. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ----- 1. ED workflow / ESI columns -----
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS esi_level INTEGER DEFAULT 0;
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS esi_rationale TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS er_phase TEXT DEFAULT 'Arrival';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS triage_started_at TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS provider_assigned_at TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS time_to_provider_min INTEGER DEFAULT 0;
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS disposition_type TEXT DEFAULT '';

-- er_phase domain guard (idempotent: drop then add).
ALTER TABLE emergency_visits DROP CONSTRAINT IF EXISTS chk_emergency_visits_phase;
ALTER TABLE emergency_visits ADD CONSTRAINT chk_emergency_visits_phase
    CHECK (er_phase IN ('Arrival','Triage','Waiting','InTreatment','Disposition'));

-- esi_level domain guard (0 = not yet triaged; 1..5 = ESI).
ALTER TABLE emergency_visits DROP CONSTRAINT IF EXISTS chk_emergency_visits_esi;
ALTER TABLE emergency_visits ADD CONSTRAINT chk_emergency_visits_esi
    CHECK (esi_level BETWEEN 0 AND 5);

-- ----- 2. tenant_id hardening + FK (table pre-exists with nullable tenant_id) -----
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE emergency_visits SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE emergency_visits ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE emergency_visits DROP CONSTRAINT IF EXISTS fk_emergency_visits_tenant;
ALTER TABLE emergency_visits ADD CONSTRAINT fk_emergency_visits_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_emergency_visits_tenant_id ON emergency_visits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_emergency_visits_board ON emergency_visits (tenant_id, status, esi_level);

-- ----- 3. FORCE RLS + canonical tenant-isolation policy (closes the E7 RLS gap) -----
ALTER TABLE emergency_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_visits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_emergency_visits_tenant_isolation ON emergency_visits;
CREATE POLICY rls_emergency_visits_tenant_isolation ON emergency_visits
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
