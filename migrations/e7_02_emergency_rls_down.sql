-- e7_02_emergency_rls_down.sql  (rollback of e7_02_emergency_rls_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: الجدولان قائمان سابقاً — لا نُسقطهما. نتراجع فقط عن سياسة + FK + فهرس E7
--   (نُبقي tenant_id لأنه يسبق E7). السياسة أولاً ثم القيود. idempotent (IF EXISTS).
BEGIN;

-- ===== emergency_trauma_assessments =====
DROP POLICY IF EXISTS rls_emergency_trauma_tenant_isolation ON emergency_trauma_assessments;
ALTER TABLE IF EXISTS emergency_trauma_assessments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emergency_trauma_assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emergency_trauma_assessments DROP CONSTRAINT IF EXISTS fk_emergency_trauma_tenant;
DROP INDEX IF EXISTS idx_emergency_trauma_tenant_id;

-- ===== emergency_beds =====
DROP POLICY IF EXISTS rls_emergency_beds_tenant_isolation ON emergency_beds;
ALTER TABLE IF EXISTS emergency_beds NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emergency_beds DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS emergency_beds DROP CONSTRAINT IF EXISTS fk_emergency_beds_tenant;
DROP INDEX IF EXISTS idx_emergency_beds_tenant_id;

COMMIT;
