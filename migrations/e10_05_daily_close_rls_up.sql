-- ============================================================
-- e10_05_daily_close_rls_up.sql
-- E10 FINANCE — ensure daily_close is tenant-isolated (tenant_id NOT NULL FK + FORCE RLS).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: route الإغلاق اليومي يجمع فواتير tenant واحد ويختم daily_close.tenant_id. الجدول قائم سابقاً
--   (bootstrap بلا tenant_id في هذا الفرع؛ الإنتاج طبّق FORCE RLS سابقاً في Phase 178). نضمن وجود
--   tenant_id NOT NULL + FK -> tenants(id) + FORCE RLS بالقالب القانوني (idempotent، آمن إن كان مطبّقاً).
--   جدول قائم سابقاً => down لا يُسقطه.
-- ============================================================
BEGIN;

ALTER TABLE daily_close ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE daily_close SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE daily_close ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE daily_close DROP CONSTRAINT IF EXISTS fk_daily_close_tenant;
ALTER TABLE daily_close ADD CONSTRAINT fk_daily_close_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_daily_close_tenant_id ON daily_close (tenant_id);

ALTER TABLE daily_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_close FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_daily_close_tenant_isolation ON daily_close;
CREATE POLICY rls_daily_close_tenant_isolation ON daily_close
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
