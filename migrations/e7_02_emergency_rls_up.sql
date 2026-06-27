-- ============================================================
-- e7_02_emergency_rls_up.sql
-- E7 EMERGENCY DEPARTMENT — FORCE RLS on emergency_trauma_assessments + emergency_beds.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سدّ ثغرة E7 المتبقية — هذان الجدولان يملكان tenant_id لكن بلا سياسة عزل FORCE RLS.
--   تطبيق نفس القالب القانوني (USING/WITH CHECK على app.tenant_id) + ضبط tenant_id NOT NULL + FK.
--   ملاحظة: emergency_beds يستخدم branch_id (وليس facility_id) لكن العزل يتم عبر tenant_id.
--
-- idempotent: UPDATE backfill + SET NOT NULL + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS
--   + CREATE INDEX IF NOT EXISTS. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ===== emergency_trauma_assessments =====
ALTER TABLE emergency_trauma_assessments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE emergency_trauma_assessments SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE emergency_trauma_assessments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE emergency_trauma_assessments DROP CONSTRAINT IF EXISTS fk_emergency_trauma_tenant;
ALTER TABLE emergency_trauma_assessments ADD CONSTRAINT fk_emergency_trauma_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_emergency_trauma_tenant_id ON emergency_trauma_assessments (tenant_id);

ALTER TABLE emergency_trauma_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_trauma_assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_emergency_trauma_tenant_isolation ON emergency_trauma_assessments;
CREATE POLICY rls_emergency_trauma_tenant_isolation ON emergency_trauma_assessments
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== emergency_beds =====
ALTER TABLE emergency_beds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE emergency_beds SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE emergency_beds ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE emergency_beds DROP CONSTRAINT IF EXISTS fk_emergency_beds_tenant;
ALTER TABLE emergency_beds ADD CONSTRAINT fk_emergency_beds_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_emergency_beds_tenant_id ON emergency_beds (tenant_id);

ALTER TABLE emergency_beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_beds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_emergency_beds_tenant_isolation ON emergency_beds;
CREATE POLICY rls_emergency_beds_tenant_isolation ON emergency_beds
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
