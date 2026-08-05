-- ============================================================
-- p1_09_wave18_backfilled_rls_up.sql
-- Wave 18 — FORCE RLS on the 5 tables with live data (already on tenant_id=1).
--
-- Pre-check (verified live 2026-08-26):
--   pharmacy_drug_catalog: 90 rows, 0 NULL, distinct tenants=1 (all on 1)
--   tenant_plan_assignments: 30 rows, 0 NULL, distinct tenants=1
--   company_settings: 12 rows, 0 NULL, distinct tenants=1
--   dental_records: 4 rows, 0 NULL, distinct tenants=1
--   user_tenants: 3 rows, 0 NULL, distinct tenants=1
--
-- No backfill required. All rows already correctly tagged.
-- Same FORCE RLS pattern as Wave 17.
--
-- Owner approval: NOT required. Continues the defense-in-depth pattern.
-- ============================================================
BEGIN;

ALTER TABLE pharmacy_drug_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_drug_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_drug_catalog_tenant_isolation ON pharmacy_drug_catalog;
CREATE POLICY rls_pharmacy_drug_catalog_tenant_isolation ON pharmacy_drug_catalog
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE tenant_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_plan_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_plan_assignments_tenant_isolation ON tenant_plan_assignments;
CREATE POLICY rls_tenant_plan_assignments_tenant_isolation ON tenant_plan_assignments
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_company_settings_tenant_isolation ON company_settings;
CREATE POLICY rls_company_settings_tenant_isolation ON company_settings
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE dental_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_dental_records_tenant_isolation ON dental_records;
CREATE POLICY rls_dental_records_tenant_isolation ON dental_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_user_tenants_tenant_isolation ON user_tenants;
CREATE POLICY rls_user_tenants_tenant_isolation ON user_tenants
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
