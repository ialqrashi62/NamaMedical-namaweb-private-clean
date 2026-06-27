-- ============================================================
-- e11_02_companies_policies_up.sql
-- E11 INSURANCE / NPHIES — tenant-isolate the EXISTING insurance_companies + insurance_policies
--   + insurance_contracts (payer master data) so a payer/policy cannot leak across tenants.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: الجداول الثلاثة قائمة سابقاً (bootstrap) بلا tenant_id ولا عزل. نضيف tenant_id NOT NULL + FK
--   -> tenants(id) + FORCE RLS بالقالب القانوني + فهرس (tenant_id). جداول قائمة سابقاً => down يعكس
--   الإضافات فقط ولا يُسقطها. idempotent.
-- ============================================================
BEGIN;

-- ----- insurance_companies -----
ALTER TABLE insurance_companies ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE insurance_companies SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE insurance_companies ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE insurance_companies DROP CONSTRAINT IF EXISTS fk_inscompany_tenant;
ALTER TABLE insurance_companies ADD CONSTRAINT fk_inscompany_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_inscompany_tenant_id ON insurance_companies (tenant_id);
ALTER TABLE insurance_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inscompany_tenant_isolation ON insurance_companies;
CREATE POLICY rls_inscompany_tenant_isolation ON insurance_companies
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ----- insurance_policies -----
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE insurance_policies SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE insurance_policies ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE insurance_policies DROP CONSTRAINT IF EXISTS fk_inspolicy_tenant;
ALTER TABLE insurance_policies ADD CONSTRAINT fk_inspolicy_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_inspolicy_tenant_id ON insurance_policies (tenant_id);
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inspolicy_tenant_isolation ON insurance_policies;
CREATE POLICY rls_inspolicy_tenant_isolation ON insurance_policies
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ----- insurance_contracts -----
ALTER TABLE insurance_contracts ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE insurance_contracts SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE insurance_contracts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE insurance_contracts DROP CONSTRAINT IF EXISTS fk_inscontract_tenant;
ALTER TABLE insurance_contracts ADD CONSTRAINT fk_inscontract_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_inscontract_tenant_id ON insurance_contracts (tenant_id);
ALTER TABLE insurance_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_contracts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inscontract_tenant_isolation ON insurance_contracts;
CREATE POLICY rls_inscontract_tenant_isolation ON insurance_contracts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
