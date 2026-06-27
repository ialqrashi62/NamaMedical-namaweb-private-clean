-- e0_04_integration_settings_rls_down.sql  (rollback of e0_04_integration_settings_rls_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يُزيل سياسة العزل ويُعطّل FORCE/ENABLE RLS على integration_settings. idempotent (IF EXISTS).
-- ملاحظة أمنية: التراجع يُضعف العزل — لا يُنفَّذ إلا ضمن تراجع كامل لميزة E0.
BEGIN;

DROP POLICY IF EXISTS rls_integration_settings_tenant_isolation ON integration_settings;
ALTER TABLE integration_settings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_settings DISABLE ROW LEVEL SECURITY;

COMMIT;
