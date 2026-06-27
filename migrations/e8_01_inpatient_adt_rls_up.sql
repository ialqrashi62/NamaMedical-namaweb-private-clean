-- ============================================================
-- e8_01_inpatient_adt_rls_up.sql
-- E8 INPATIENT / ADT — FORCE RLS on the five existing ADT tables.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سدّ ثغرة E8 المتبقية — هذه الجداول الخمسة (admissions, beds, wards, bed_transfers,
--   admission_daily_rounds) تملك tenant_id لكن بلا سياسة عزل FORCE RLS. نطبّق نفس القالب
--   القانوني (USING/WITH CHECK على app.tenant_id) + ضبط tenant_id NOT NULL + FK -> tenants(id).
--   ملاحظة: bed_transfers يستخدم branch_id (وليس facility_id) لكن العزل يتم عبر tenant_id.
--
-- هذه الجداول قائمة سابقاً (لم تنشئها هذه الهجرة) — نستخدم ADD COLUMN IF NOT EXISTS + backfill
--   + SET NOT NULL + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS + CREATE INDEX
--   IF NOT EXISTS. idempotent. wrapped BEGIN; … COMMIT;
-- ============================================================
BEGIN;

-- ===== admissions =====
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE admissions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE admissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS fk_admissions_tenant;
ALTER TABLE admissions ADD CONSTRAINT fk_admissions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_id ON admissions (tenant_id);
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_admissions_tenant_isolation ON admissions;
CREATE POLICY rls_admissions_tenant_isolation ON admissions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== beds =====
ALTER TABLE beds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE beds SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE beds ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE beds DROP CONSTRAINT IF EXISTS fk_beds_tenant;
ALTER TABLE beds ADD CONSTRAINT fk_beds_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_beds_tenant_id ON beds (tenant_id);
-- bed status domain guard (server lifecycle: Available/Reserved/Occupied/Cleaning/Blocked).
ALTER TABLE beds DROP CONSTRAINT IF EXISTS chk_beds_status;
ALTER TABLE beds ADD CONSTRAINT chk_beds_status
    CHECK (status IN ('Available','Reserved','Occupied','Cleaning','Blocked'));
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_beds_tenant_isolation ON beds;
CREATE POLICY rls_beds_tenant_isolation ON beds
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== wards =====
ALTER TABLE wards ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE wards SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE wards ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE wards DROP CONSTRAINT IF EXISTS fk_wards_tenant;
ALTER TABLE wards ADD CONSTRAINT fk_wards_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_wards_tenant_id ON wards (tenant_id);
ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_wards_tenant_isolation ON wards;
CREATE POLICY rls_wards_tenant_isolation ON wards
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== bed_transfers =====
ALTER TABLE bed_transfers ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE bed_transfers SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE bed_transfers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE bed_transfers DROP CONSTRAINT IF EXISTS fk_bed_transfers_tenant;
ALTER TABLE bed_transfers ADD CONSTRAINT fk_bed_transfers_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_bed_transfers_tenant_id ON bed_transfers (tenant_id);
ALTER TABLE bed_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_bed_transfers_tenant_isolation ON bed_transfers;
CREATE POLICY rls_bed_transfers_tenant_isolation ON bed_transfers
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== admission_daily_rounds =====
ALTER TABLE admission_daily_rounds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE admission_daily_rounds SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE admission_daily_rounds ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE admission_daily_rounds DROP CONSTRAINT IF EXISTS fk_admission_rounds_tenant;
ALTER TABLE admission_daily_rounds ADD CONSTRAINT fk_admission_rounds_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_admission_rounds_tenant_id ON admission_daily_rounds (tenant_id);
ALTER TABLE admission_daily_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_daily_rounds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_admission_rounds_tenant_isolation ON admission_daily_rounds;
CREATE POLICY rls_admission_rounds_tenant_isolation ON admission_daily_rounds
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
