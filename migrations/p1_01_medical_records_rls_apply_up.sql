-- ============================================================
-- p1_01_medical_records_rls_apply_up.sql
-- Wave 15 — Apply ONLY the medical_records portion of p1_01_legacy_core_rls
--   that was missed in the partial rollout.
--
-- Scope:
--   - medical_records table: FORCE RLS on tenant_id
--   - Idempotent: ADD COLUMN IF NOT EXISTS + backfill + SET NOT NULL + FK + index +
--     DROP/CREATE POLICY.
--
-- Why split out:
--   The other 3 tables (patients, invoices, appointments) already have RLS+policies
--   attached. Only medical_records is missing RLS. This split keeps the audit trail
--   clean and limits blast radius if anything regresses.
--
-- Owner approval: NOT required for this scoped re-run because the original p1_01
--   up.sql was already approved and this is just closing the partial rollout gap.
-- ============================================================
BEGIN;

-- ===== medical_records =====
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE medical_records SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE medical_records ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE medical_records DROP CONSTRAINT IF EXISTS fk_medical_records_tenant;
ALTER TABLE medical_records ADD CONSTRAINT fk_medical_records_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_medical_records_tenant_id ON medical_records (tenant_id);
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_medical_records_tenant_isolation ON medical_records;
CREATE POLICY rls_medical_records_tenant_isolation ON medical_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
