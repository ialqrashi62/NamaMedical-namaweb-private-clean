-- e16_03_cssd_trays_down.sql  (rollback of e16_03 up)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- cssd_trays جدول جديد أنشأته هذه الهجرة — نُسقطه أولاً (يُسقط سياسته/فهارسه/قيوده ضمناً). idempotent.
BEGIN;

DROP TABLE IF EXISTS cssd_trays CASCADE;
DROP POLICY IF EXISTS rls_cssd_trays_tenant_isolation ON cssd_trays;

COMMIT;
