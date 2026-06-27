-- ============================================================
-- e0_04_integration_settings_rls_up.sql
-- E0 Facility Onboarding Wizard — migration 4 (RLS hardening).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: تفعيل FORCE RLS بعزل tenant_id على integration_settings (نفس نمط 150 سياسة القائمة)
--   حتى تبقى صفوف التكاملات المُنشأة أثناء التزويد معزولة لكل مستأجر. عمود tenant_id موجود
--   مسبقاً (أُضيف في db_postgres.js) — لا حاجة لـ DDL على العمود.
--
-- idempotent: DROP POLICY IF EXISTS قبل CREATE؛ ENABLE/FORCE آمنة لإعادة التشغيل.
-- ============================================================
BEGIN;

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_integration_settings_tenant_isolation ON integration_settings;
CREATE POLICY rls_integration_settings_tenant_isolation ON integration_settings
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
