-- ============================================================
-- e9_01_icu_rls_up.sql
-- E9 ICU / CRITICAL CARE — FORCE RLS on the four EXISTING icu_* tables.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سدّ ثغرة E9 المتبقية — جداول العناية الأربعة (icu_monitoring, icu_ventilator, icu_scores,
--   icu_fluid_balance) تملك tenant_id (أُضيف في bootstrap) لكن بلا سياسة عزل FORCE RLS — وهي ثغرة
--   حقيقية. نطبّق نفس القالب القانوني (USING/WITH CHECK على app.tenant_id) + ضبط tenant_id NOT NULL
--   + FK -> tenants(id) + فهرس. هذه الجداول قائمة سابقاً (لم تنشئها هذه الهجرة) فلا نُسقطها في down.
--   ملاحظة: لا إضافة جداول جديدة إلى bootstrap في db_postgres.js عبر هذه الهجرة (هجرة مرشّحة فقط).
--
-- idempotent: ADD COLUMN IF NOT EXISTS + backfill + SET NOT NULL + DROP/ADD CONSTRAINT IF EXISTS
--   + CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ===== icu_monitoring (ICU flowsheet) =====
ALTER TABLE icu_monitoring ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE icu_monitoring SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE icu_monitoring ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE icu_monitoring DROP CONSTRAINT IF EXISTS fk_icu_monitoring_tenant;
ALTER TABLE icu_monitoring ADD CONSTRAINT fk_icu_monitoring_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_icu_monitoring_tenant_id ON icu_monitoring (tenant_id);
ALTER TABLE icu_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_monitoring FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_monitoring_tenant_isolation ON icu_monitoring;
CREATE POLICY rls_icu_monitoring_tenant_isolation ON icu_monitoring
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== icu_ventilator =====
ALTER TABLE icu_ventilator ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE icu_ventilator SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE icu_ventilator ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE icu_ventilator DROP CONSTRAINT IF EXISTS fk_icu_ventilator_tenant;
ALTER TABLE icu_ventilator ADD CONSTRAINT fk_icu_ventilator_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_icu_ventilator_tenant_id ON icu_ventilator (tenant_id);
ALTER TABLE icu_ventilator ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_ventilator FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_ventilator_tenant_isolation ON icu_ventilator;
CREATE POLICY rls_icu_ventilator_tenant_isolation ON icu_ventilator
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== icu_scores =====
ALTER TABLE icu_scores ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE icu_scores SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE icu_scores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE icu_scores DROP CONSTRAINT IF EXISTS fk_icu_scores_tenant;
ALTER TABLE icu_scores ADD CONSTRAINT fk_icu_scores_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_icu_scores_tenant_id ON icu_scores (tenant_id);
ALTER TABLE icu_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_scores_tenant_isolation ON icu_scores;
CREATE POLICY rls_icu_scores_tenant_isolation ON icu_scores
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== icu_fluid_balance =====
ALTER TABLE icu_fluid_balance ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE icu_fluid_balance SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE icu_fluid_balance ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE icu_fluid_balance DROP CONSTRAINT IF EXISTS fk_icu_fluid_balance_tenant;
ALTER TABLE icu_fluid_balance ADD CONSTRAINT fk_icu_fluid_balance_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_icu_fluid_balance_tenant_id ON icu_fluid_balance (tenant_id);
ALTER TABLE icu_fluid_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_fluid_balance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_fluid_balance_tenant_isolation ON icu_fluid_balance;
CREATE POLICY rls_icu_fluid_balance_tenant_isolation ON icu_fluid_balance
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
