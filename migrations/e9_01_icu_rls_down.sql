-- e9_01_icu_rls_down.sql  (rollback of e9_01_icu_rls_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: الجداول الأربعة قائمة سابقاً — لا نُسقطها. نتراجع فقط عن إضافات E9 (السياسة ثم
--   FORCE/ENABLE ثم القيد ثم الفهرس)، ونُبقي عمود tenant_id لأنه يسبق E9 (أُضيف في bootstrap).
--   السياسة أولاً. idempotent (IF EXISTS).
BEGIN;

-- ===== icu_monitoring =====
DROP POLICY IF EXISTS rls_icu_monitoring_tenant_isolation ON icu_monitoring;
ALTER TABLE IF EXISTS icu_monitoring NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_monitoring DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_monitoring DROP CONSTRAINT IF EXISTS fk_icu_monitoring_tenant;
DROP INDEX IF EXISTS idx_icu_monitoring_tenant_id;

-- ===== icu_ventilator =====
DROP POLICY IF EXISTS rls_icu_ventilator_tenant_isolation ON icu_ventilator;
ALTER TABLE IF EXISTS icu_ventilator NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_ventilator DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_ventilator DROP CONSTRAINT IF EXISTS fk_icu_ventilator_tenant;
DROP INDEX IF EXISTS idx_icu_ventilator_tenant_id;

-- ===== icu_scores =====
DROP POLICY IF EXISTS rls_icu_scores_tenant_isolation ON icu_scores;
ALTER TABLE IF EXISTS icu_scores NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_scores DROP CONSTRAINT IF EXISTS fk_icu_scores_tenant;
DROP INDEX IF EXISTS idx_icu_scores_tenant_id;

-- ===== icu_fluid_balance =====
DROP POLICY IF EXISTS rls_icu_fluid_balance_tenant_isolation ON icu_fluid_balance;
ALTER TABLE IF EXISTS icu_fluid_balance NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_fluid_balance DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS icu_fluid_balance DROP CONSTRAINT IF EXISTS fk_icu_fluid_balance_tenant;
DROP INDEX IF EXISTS idx_icu_fluid_balance_tenant_id;

COMMIT;
