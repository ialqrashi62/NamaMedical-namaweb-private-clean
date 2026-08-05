-- p1_01_medical_records_rls_apply_down.sql
-- Wave 15 — Reverse: drop RLS + policy from medical_records (reverse of the apply_up).
BEGIN;

DROP POLICY IF EXISTS rls_medical_records_tenant_isolation ON medical_records;
ALTER TABLE medical_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records NO FORCE ROW LEVEL SECURITY;
-- Drop the FK + index + tenant_id NOT NULL — keep the column nullable for rollback safety.
ALTER TABLE medical_records DROP CONSTRAINT IF EXISTS fk_medical_records_tenant;
DROP INDEX IF EXISTS idx_medical_records_tenant_id;
ALTER TABLE medical_records ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
