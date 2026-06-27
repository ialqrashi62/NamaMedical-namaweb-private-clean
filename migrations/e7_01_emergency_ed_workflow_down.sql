-- e7_01_emergency_ed_workflow_down.sql  (rollback of e7_01_emergency_ed_workflow_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: emergency_visits جدول قائم سابقاً (لم تنشئه هذه الهجرة) — لذلك لا نُسقط الجدول.
--   نتراجع فقط عن إضافات E7: السياسة ثم القيود ثم الأعمدة المُضافة (مع الإبقاء على tenant_id
--   لأنه كان موجوداً قبل E7). idempotent (IF EXISTS).
BEGIN;

-- 1. policy first (RLS additions).
DROP POLICY IF EXISTS rls_emergency_visits_tenant_isolation ON emergency_visits;
ALTER TABLE IF EXISTS emergency_visits NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emergency_visits DISABLE ROW LEVEL SECURITY;

-- 2. constraints added by E7.
ALTER TABLE IF EXISTS emergency_visits DROP CONSTRAINT IF EXISTS chk_emergency_visits_phase;
ALTER TABLE IF EXISTS emergency_visits DROP CONSTRAINT IF EXISTS chk_emergency_visits_esi;
ALTER TABLE IF EXISTS emergency_visits DROP CONSTRAINT IF EXISTS fk_emergency_visits_tenant;

-- 3. indexes added by E7.
DROP INDEX IF EXISTS idx_emergency_visits_tenant_id;
DROP INDEX IF EXISTS idx_emergency_visits_board;

-- 4. workflow columns added by E7 (tenant_id is intentionally retained — pre-dates E7).
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS esi_level;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS esi_rationale;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS er_phase;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS triage_started_at;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS provider_assigned_at;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS time_to_provider_min;
ALTER TABLE IF EXISTS emergency_visits DROP COLUMN IF EXISTS disposition_type;

COMMIT;
