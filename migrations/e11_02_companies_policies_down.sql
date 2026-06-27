-- e11_02_companies_policies_down.sql  (rollback of e11_02_companies_policies_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: الجداول الثلاثة قائمة سابقاً => لا نُسقطها. نعكس الإضافات فقط. idempotent.
BEGIN;

DROP POLICY IF EXISTS rls_inscompany_tenant_isolation ON insurance_companies;
DROP INDEX IF EXISTS idx_inscompany_tenant_id;
ALTER TABLE insurance_companies DROP CONSTRAINT IF EXISTS fk_inscompany_tenant;
ALTER TABLE insurance_companies ALTER COLUMN tenant_id DROP NOT NULL;

DROP POLICY IF EXISTS rls_inspolicy_tenant_isolation ON insurance_policies;
DROP INDEX IF EXISTS idx_inspolicy_tenant_id;
ALTER TABLE insurance_policies DROP CONSTRAINT IF EXISTS fk_inspolicy_tenant;
ALTER TABLE insurance_policies ALTER COLUMN tenant_id DROP NOT NULL;

DROP POLICY IF EXISTS rls_inscontract_tenant_isolation ON insurance_contracts;
DROP INDEX IF EXISTS idx_inscontract_tenant_id;
ALTER TABLE insurance_contracts DROP CONSTRAINT IF EXISTS fk_inscontract_tenant;
ALTER TABLE insurance_contracts ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
