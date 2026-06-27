-- e8_01_inpatient_adt_rls_down.sql  (rollback of e8_01_inpatient_adt_rls_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: الجداول الخمسة قائمة سابقاً — لا نُسقطها. نتراجع فقط عن إضافات E8 (السياسة ثم
--   FORCE/ENABLE ثم القيود ثم الفهارس)، ونُبقي عمود tenant_id لأنه يسبق E8. السياسة أولاً.
--   idempotent (IF EXISTS).
BEGIN;

-- ===== admissions =====
DROP POLICY IF EXISTS rls_admissions_tenant_isolation ON admissions;
ALTER TABLE IF EXISTS admissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admissions DROP CONSTRAINT IF EXISTS fk_admissions_tenant;
DROP INDEX IF EXISTS idx_admissions_tenant_id;

-- ===== beds =====
DROP POLICY IF EXISTS rls_beds_tenant_isolation ON beds;
ALTER TABLE IF EXISTS beds NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS beds DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS beds DROP CONSTRAINT IF EXISTS fk_beds_tenant;
ALTER TABLE IF EXISTS beds DROP CONSTRAINT IF EXISTS chk_beds_status;
DROP INDEX IF EXISTS idx_beds_tenant_id;

-- ===== wards =====
DROP POLICY IF EXISTS rls_wards_tenant_isolation ON wards;
ALTER TABLE IF EXISTS wards NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wards DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wards DROP CONSTRAINT IF EXISTS fk_wards_tenant;
DROP INDEX IF EXISTS idx_wards_tenant_id;

-- ===== bed_transfers =====
DROP POLICY IF EXISTS rls_bed_transfers_tenant_isolation ON bed_transfers;
ALTER TABLE IF EXISTS bed_transfers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bed_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bed_transfers DROP CONSTRAINT IF EXISTS fk_bed_transfers_tenant;
DROP INDEX IF EXISTS idx_bed_transfers_tenant_id;

-- ===== admission_daily_rounds =====
DROP POLICY IF EXISTS rls_admission_rounds_tenant_isolation ON admission_daily_rounds;
ALTER TABLE IF EXISTS admission_daily_rounds NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admission_daily_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admission_daily_rounds DROP CONSTRAINT IF EXISTS fk_admission_rounds_tenant;
DROP INDEX IF EXISTS idx_admission_rounds_tenant_id;

COMMIT;
