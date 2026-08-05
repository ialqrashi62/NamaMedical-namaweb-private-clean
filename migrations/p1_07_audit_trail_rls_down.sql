-- p1_07_audit_trail_rls_down.sql
-- Wave 16 — Reverse: drop RLS + policy from audit_trail.
BEGIN;

DROP POLICY IF EXISTS rls_audit_trail_tenant_isolation ON audit_trail;
ALTER TABLE audit_trail DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_trail DROP CONSTRAINT IF EXISTS fk_audit_trail_tenant;
ALTER TABLE audit_trail ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
