-- e10_02_cost_centers_down.sql  (rollback of e10_02_cost_centers_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: finance_cost_centers قائم سابقاً => لا نُسقطه. نعكس فقط الإضافات. idempotent.
BEGIN;

ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS fk_jl_cost_center;

DROP POLICY IF EXISTS rls_cc_tenant_isolation ON finance_cost_centers;
ALTER TABLE finance_cost_centers DROP CONSTRAINT IF EXISTS fk_cc_tenant;
DROP INDEX IF EXISTS idx_cc_tenant_id;
ALTER TABLE finance_cost_centers DROP COLUMN IF EXISTS budget_amount;
-- facility_id may be shared by bootstrap conventions elsewhere; this migration added it -> drop.
ALTER TABLE finance_cost_centers DROP COLUMN IF EXISTS facility_id;
ALTER TABLE finance_cost_centers ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
