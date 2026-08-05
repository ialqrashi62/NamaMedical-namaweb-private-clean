-- ============================================================
-- p1_07_audit_trail_rls_up.sql
-- Wave 16 — Apply FORCE RLS on audit_trail.
--
-- Pre-requisites (already shipped in Wave 15):
--   1. logAudit() in server.js now stamps tenant_id from AsyncLocalStorage
--      (tenant_context.getCurrentTenantId()) and falls back to the PG session GUC
--      (current_setting('app.tenant_id', true)).
--   2. auditResultAckFallback() passes tenant_id explicitly in its INSERT.
--
-- This migration:
--   1. Backfills any NULL tenant_id on existing rows to tenant 1 (best-effort).
--   2. Sets tenant_id NOT NULL on audit_trail so RLS can rely on a stable column.
--   3. Adds FK to tenants(id) (defense-in-depth).
--   4. ENABLES + FORCES RLS.
--   5. Creates rls_audit_trail_tenant_isolation policy.
--
-- Idempotent: every statement uses IF EXISTS / IF NOT EXISTS / DROP IF EXISTS.
-- Wrapped in BEGIN; … COMMIT; so the migration is atomic.
--
-- Owner approval: NOT required (this is the deferred-item #2 closure that
-- was already approved as part of PHASE1 §3 and blocked on logAudit stamping,
-- which Wave 16 now ships).
-- ============================================================
BEGIN;

-- ===== audit_trail =====
-- 1. Backfill: existing rows may have tenant_id=NULL. Best-effort default to tenant 1
--    (matches the convention used for patients/invoices/appointments/medical_records).
UPDATE audit_trail SET tenant_id = 1 WHERE tenant_id IS NULL;

-- 2. NOT NULL + FK.
ALTER TABLE audit_trail ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_trail DROP CONSTRAINT IF EXISTS fk_audit_trail_tenant;
ALTER TABLE audit_trail ADD CONSTRAINT fk_audit_trail_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 3. Index already exists (idx_audit_trail_tenant) per earlier migration; no-op.

-- 4. ENABLE + FORCE RLS.
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail FORCE ROW LEVEL SECURITY;

-- 5. Policy: rows visible only when tenant_id matches the active session tenant.
--    Tenant 0 is reserved for system/cross-tenant admin events (e.g. provisioning);
--    a SUPERUSER bypasses RLS by default, but the app role is non-superuser, so this
--    policy is the binding isolation layer.
DROP POLICY IF EXISTS rls_audit_trail_tenant_isolation ON audit_trail;
CREATE POLICY rls_audit_trail_tenant_isolation ON audit_trail
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
