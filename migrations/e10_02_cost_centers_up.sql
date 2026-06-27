-- ============================================================
-- e10_02_cost_centers_up.sql
-- E10 FINANCE — harden the EXISTING finance_cost_centers to tenant isolation + FORCE RLS.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: finance_cost_centers قائم سابقاً (bootstrap) ويستخدم clinic_id فقط بلا tenant_id ولا عزل.
--   نضيف tenant_id NOT NULL + FK -> tenants(id) + facility_id + budget_amount + FORCE RLS بالقالب
--   القانوني. نُبقي clinic_id كما هو (عمود قديم، لا نُسقطه احتراماً لـ "down يعكس الإضافات فقط").
--   جدول قائم سابقاً => down لا يُسقطه. لا إضافة جداول جديدة إلى bootstrap عبر هذه الهجرة.
-- idempotent.
-- ============================================================
BEGIN;

ALTER TABLE finance_cost_centers ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE finance_cost_centers SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE finance_cost_centers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE finance_cost_centers DROP CONSTRAINT IF EXISTS fk_cc_tenant;
ALTER TABLE finance_cost_centers ADD CONSTRAINT fk_cc_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE finance_cost_centers ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_cost_centers ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cc_tenant_id ON finance_cost_centers (tenant_id);

ALTER TABLE finance_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_cost_centers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cc_tenant_isolation ON finance_cost_centers;
CREATE POLICY rls_cc_tenant_isolation ON finance_cost_centers
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- finance_journal_lines.cost_center_id may reference a cost center; add the FK now that CC is hardened.
ALTER TABLE finance_journal_lines DROP CONSTRAINT IF EXISTS fk_jl_cost_center;
-- legacy rows may carry cost_center_id=0 (sentinel "none") -> normalise to NULL before adding FK
UPDATE finance_journal_lines SET cost_center_id = NULL WHERE cost_center_id = 0;
ALTER TABLE finance_journal_lines ADD CONSTRAINT fk_jl_cost_center
    FOREIGN KEY (cost_center_id) REFERENCES finance_cost_centers(id);

COMMIT;
